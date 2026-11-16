/**
 * Local mock test harness for the Apps Script project.
 *
 * Apps Script cannot run outside Google, so this loads the real .gs sources into
 * a Node VM with stubbed Google services and proves the behaviour that matters:
 *   - the calendar picks up festivals (Google holiday calendar + built-in table)
 *   - the same date always yields the same post, and every post carries the link
 *   - each channel is idempotent per day and failure isolated
 *   - the media path produces a public JPEG URL (Instagram needs one)
 *   - YouTube only uploads a fresh video, from a real mp4 blob
 *   - the GitHub media host updates an existing file instead of failing
 *   - OAuth 1.0a signing for X is real, not a stored bearer token
 *   - dryRun() publishes nothing
 *
 *   node tests/local-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const FILES = ['config.gs', 'calendar.gs', 'content.gs', 'media.gs', 'publishers.gs', 'code.gs', 'backfill.gs'];

/* A callable object where every property is also callable and returns the same
 * chainable, which is all the Apps Script shape/text API needs in a mock. */
function chain() {
  const target = function () {};
  return new Proxy(target, {
    get: (t, prop) => {
      if (prop === 'then' || prop === 'inspect' || prop === Symbol.toPrimitive) return undefined;
      return () => chain();
    },
    apply: () => chain(),
  });
}

function makeBlob() {
  return {
    bytes: new Array(40000).fill(1),
    getBytes() { return this.bytes; },
    getAs() { return 'image/jpeg'; },
    setName() { return this; },
    setContentType() { return this; },
    getContentType() { return 'image/jpeg'; },
    setDataFromString() { return this; },
  };
}

function makeSandbox(options) {
  const opts = options || {};
  const props = Object.assign({}, opts.props || {});
  const httpLog = [];

  const sheet = {
    rows: [],
    appendRow(row) { this.rows.push(row); },
    getDataRange() { return { getValues: () => opts.sheetRows || [] }; },
    getParent() { return spreadsheet; },
  };
  const spreadsheet = {
    id: 'sheet-1',
    getUrl: () => 'https://docs.google.com/spreadsheets/d/sheet-1',
    getSheetByName: (name) => (name === 'PostLog' ? sheet : null),
    insertSheet: () => sheet,
  };

  const calendar = {
    getName: () => opts.calendarName || 'Holidays in India',
    getEventsForDay: () => (opts.events || []).map((title) => ({
      getTitle: () => title,
      isAllDayEvent: () => true,
    })),
  };

  const sandbox = {
    console,
    JSON,
    Date,
    Math,
    Object,
    String,
    Number,
    Array,
    RegExp,
    parseInt,
    isNaN,
    encodeURIComponent,
    Logger: { log: () => {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: (k) => { delete props[k]; },
        getProperties: () => Object.assign({}, props),
      }),
    },
    Utilities: {
      formatDate: (date, tz, fmt) => {
        const y = date.getUTCFullYear();
        const m = String(date.getUTCMonth() + 1).padStart(2, '0');
        const d = String(date.getUTCDate()).padStart(2, '0');
        if (fmt === 'yyyy-MM-dd') return `${y}-${m}-${d}`;
        return date.toISOString();
      },
      sleep: () => {},
      newBlob: (data) => {
        const buf = Buffer.from(String(data), 'utf8');
        return { getBytes: () => Array.from(buf) };
      },
      computeHmacSignature: (algo, value, key) =>
        Array.from(require('crypto').createHmac('sha1', String(key)).update(String(value)).digest()),
      base64Encode: (bytes) => Buffer.from(bytes).toString('base64'),
      MacAlgorithm: { HMAC_SHA_1: 'HMAC_SHA_1' },
    },
    ScriptApp: {
      getOAuthToken: () => 'stub-token',
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => chain(),
    },
    LockService: {
      getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }),
    },
    CacheService: { getScriptCache: () => ({ get: () => null, put: () => {} }) },
    SpreadsheetApp: {
      create: () => spreadsheet,
      openById: () => Object.assign({}, spreadsheet, { getSheets: () => [sheet] }),
    },
    DriveApp: {
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: () => ({ createFile: () => ({ getId: () => 'drv1', setSharing: () => {} }) }),
      Access: { ANYONE_WITH_LINK: 1 },
      Permission: { VIEW: 1 },
      getFileById: () => ({ setTrashed: () => {} }),
    },
    CalendarApp: {
      getCalendarById: () => (opts.calendarPresent === false ? null : calendar),
      subscribeToCalendar: () => { sandbox.__subscribed = true; },
      getAllCalendars: () => [calendar],
      getDefaultCalendar: () => calendar,
    },
    SlidesApp: {
      ShapeType: { RECTANGLE: 'RECTANGLE', ROUND_RECTANGLE: 'ROUND_RECTANGLE' },
      ParagraphAlignment: { END: 'END' },
      create: () => ({
        setPageWidth: () => {},
        setPageHeight: () => {},
        getSlides: () => [{
          getPageElements: () => [],
          getObjectId: () => 'page-1',
          insertShape: () => chain(),
          insertTextBox: () => chain(),
        }],
        getId: () => 'deck-1',
        saveAndClose: () => {},
      }),
    },
    UrlFetchApp: {
      fetch: (url, params) => {
        httpLog.push({ url, params: params || {} });
        const handler = opts.http && opts.http(url, params || {});
        const result = handler || { code: 200, text: '{"id":"ok","url":"https://blog.example/post"}' };
        return {
          getResponseCode: () => result.code,
          getContentText: () => result.text,
          getBlob: () => makeBlob(),
          getHeaders: () => result.headers || {},
        };
      },
    },
  };
  if (opts.youtube) sandbox.YouTube = opts.youtube;
  sandbox.global = sandbox;

  const context = vm.createContext(sandbox);
  FILES.forEach((file) => {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  });
  return { context, httpLog, props, sandbox };
}

let passed = 0;
const failures = [];

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log('  ok   ' + name);
  } catch (err) {
    failures.push({ name, error: err.message });
    console.log('  FAIL ' + name + ' :: ' + err.message);
  }
}

const SECTION = (title) => console.log('\n' + title);
console.log('GAHONSH social autopilot - mock tests');

/* ------------------------------------------------------------------ *
 * 1. Content guarantees                                              *
 * ------------------------------------------------------------------ */
SECTION('content');
test('every generated post contains the website link', () => {
  const { context } = makeSandbox();
  const build = vm.runInContext('buildDailyPost', context);
  for (let i = 0; i < 90; i++) {
    const date = new Date(Date.UTC(2026, 0, 1) + i * 4 * 86400000);
    const post = build(date);
    assert.ok(post.caption.includes('https://gahonsh-blip.github.io'), 'missing link on ' + post.dateKey);
    assert.ok(post.caption.length > 80, 'caption too short on ' + post.dateKey);
    assert.ok(post.hashtags.includes('#'), 'missing hashtags on ' + post.dateKey);
    assert.ok(post.title.includes('GAHONSH'), 'title missing brand');
    assert.ok(post.headline.length > 10);
  }
});

test('the same date always produces the same headline', () => {
  const { context } = makeSandbox();
  const build = vm.runInContext('buildDailyPost', context);
  const d = new Date(Date.UTC(2026, 6, 15));
  assert.strictEqual(build(d).headline, build(d).headline);
});

test('truncate_ cuts on a word boundary and never exceeds the budget', () => {
  const { context } = makeSandbox();
  const cut = vm.runInContext('truncate_', context);
  const out = cut('alpha beta gamma delta epsilon', 14);
  assert.ok(out.length <= 14, 'over budget: ' + out.length);
  assert.ok(out.endsWith('\u2026'), 'missing ellipsis');
  assert.ok(!out.includes('eps\u2026'), 'sliced a word');
});

/* ------------------------------------------------------------------ *
 * 2. Calendar and festivals                                          *
 * ------------------------------------------------------------------ */
SECTION('calendar');
test('the Indian holiday calendar is subscribed when missing', () => {
  const { context, sandbox } = makeSandbox({ calendarPresent: false });
  const res = vm.runInContext('ensureHolidayCalendar_', context)();
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.already, false);
  assert.strictEqual(sandbox.__subscribed, true, 'subscribeToCalendar was not called');
});

test('an already subscribed holiday calendar is not subscribed twice', () => {
  const { context, sandbox } = makeSandbox({ calendarPresent: true });
  const res = vm.runInContext('ensureHolidayCalendar_', context)();
  assert.strictEqual(res.already, true);
  assert.strictEqual(sandbox.__subscribed, undefined);
});

test('a festival from any calendar becomes the day topic', () => {
  const { context } = makeSandbox({ events: ['Diwali Celebration'] });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2027, 10, 1)));
  assert.strictEqual(post.type, 'festival');
  assert.strictEqual(post.source, 'google-calendar');
  assert.ok(/Diwali/.test(post.headline));
});

test('the built-in table still answers when no calendar is available', () => {
  const { context } = makeSandbox({ calendarPresent: false });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 10, 8)));
  assert.strictEqual(post.type, 'festival');
  assert.strictEqual(post.occasion, 'Diwali');
});

test('fixed observances are an occasion, not a festival greeting', () => {
  const { context } = makeSandbox({ calendarPresent: false });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 0, 26)));
  assert.strictEqual(post.type, 'occasion');
  assert.strictEqual(post.occasion, 'Republic Day');
});

test('a plain day falls back to the business rotation', () => {
  const { context } = makeSandbox({ calendarPresent: false });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 0, 13)));
  assert.strictEqual(post.type, 'business');
});

test('the owner sheet can override any day without touching code', () => {
  const { context } = makeSandbox({
    calendarPresent: false,
    props: { CONTENT_CALENDAR_SHEET_ID: 'sheet-1' },
    sheetRows: [['headers'], ['2026-07-20', 'business', '', 'Custom sheet caption for a launch day', '']],
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 20)));
  assert.ok(post.caption.includes('Custom sheet caption'), post.caption);
});

/* ------------------------------------------------------------------ *
 * 3. Media: card, hosting, video manifest                            *
 * ------------------------------------------------------------------ */
SECTION('media');
test('the card is exported and hosted as a public JPEG url', () => {
  const { context, httpLog } = makeSandbox({
    props: { GITHUB_TOKEN: 'gh', PUBLISH_IMAGE: 'yes' },
    http: (url, params) => {
      if (url.includes('docs.google.com/presentation')) return { code: 200, text: 'img' };
      if (url.includes('api.github.com')) {
        if (params.method === 'put') return { code: 201, text: '{"content":{"sha":"new"}}' };
        return { code: 200, text: '{"sha":"old"}' };
      }
      if (url.includes('gahonsh-blip.github.io')) return { code: 200, text: 'ok' };
      return { code: 200, text: '{}' };
    },
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 10)));
  const image = vm.runInContext('buildBrandImage', context)(post);
  assert.strictEqual(image.ok, true, JSON.stringify(image));
  assert.ok(image.imageUrl.startsWith('https://gahonsh-blip.github.io/social/media/'), image.imageUrl);
  assert.ok(image.imageUrl.endsWith('.jpg'), 'instagram needs a jpeg');
  const put = httpLog.find((c) => c.url.includes('api.github.com') && c.params.method === 'put');
  assert.ok(put, 'no commit to the media repo');
  assert.ok(JSON.parse(put.params.payload).sha === 'old', 'existing file must be updated, not re-created');
});

test('a missing GitHub token degrades to a Drive url instead of breaking', () => {
  const { context } = makeSandbox({
    props: { PUBLISH_IMAGE: 'yes' },
    http: (url) => {
      if (url.includes('docs.google.com/presentation')) return { code: 200, text: 'img' };
      return { code: 200, text: '{}' };
    },
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 11)));
  const image = vm.runInContext('buildBrandImage', context)(post);
  assert.strictEqual(image.ok, true, JSON.stringify(image));
  assert.ok(/GITHUB_TOKEN/.test(image.warning), image.warning);
});

test('a fresh video manifest is used as-is', () => {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const key = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`;
  const { context } = makeSandbox({
    http: () => ({ code: 200, text: JSON.stringify({ date: key, video_url: 'https://x/v.mp4', title: 't' }) }),
  });
  const res = vm.runInContext('fetchVideoManifest_', context)();
  assert.strictEqual(res.ok, true);
  assert.strictEqual(res.fresh, true);
  assert.strictEqual(res.url, 'https://x/v.mp4');
});

test('a stale manifest falls back to the rotating Short pool', () => {
  const { context } = makeSandbox({
    http: (url) => {
      if (url.includes('videos.json')) {
        return { code: 200, text: JSON.stringify({ videos: [{ id: 1, video_url: 'https://x/p1.mp4' }, { id: 2, video_url: 'https://x/p2.mp4' }] }) };
      }
      return { code: 200, text: JSON.stringify({ date: '2020-01-01', video_url: 'https://x/old.mp4' }) };
    },
  });
  const res = vm.runInContext('fetchVideoManifest_', context)();
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.fresh, false);
  assert.ok(/^pool#/.test(res.source), res.source);
  assert.ok(res.url.includes('p'), res.url);
  assert.ok(/stale_manifest/.test(res.note), res.note);
});

test('with no fresh render and no pool, youtube is honestly skipped', () => {
  const { context } = makeSandbox({ http: () => ({ code: 404, text: 'nope' }) });
  const res = vm.runInContext('fetchVideoManifest_', context)();
  assert.strictEqual(res.ok, false);
  assert.ok(/pool_empty|pool_http/.test(res.error), res.error);
});

/* ------------------------------------------------------------------ *
 * 4. Per channel publishing                                          *
 * ------------------------------------------------------------------ */
SECTION('publishers');
test('facebook posts the card to the page feed with the META_ key names', () => {
  const { context, httpLog } = makeSandbox({
    props: { META_PAGE_ID: '824', META_PAGE_TOKEN: 'tok' },
    http: () => ({ code: 200, text: '{"id":"824_1","post_id":"824_1"}' }),
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 12)));
  const res = vm.runInContext('publishFacebook_', context)(post, 'https://img/x.jpg');
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  const call = httpLog.find((c) => c.url.includes('/824/photos'));
  assert.ok(call, 'the photo post was never made');
  assert.strictEqual(call.params.payload.url, 'https://img/x.jpg');
});

test('instagram creates a container and only then publishes it', () => {
  const { context, httpLog } = makeSandbox({
    props: { META_IG_ID: '178', META_PAGE_TOKEN: 'tok' },
    http: (url) => (url.includes('media_publish')
      ? { code: 200, text: '{"id":"ig-post-1"}' }
      : { code: 200, text: '{"id":"container-1"}' }),
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 13)));
  const res = vm.runInContext('publishInstagram_', context)(post, 'https://img/x.jpg');
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  const container = httpLog.find((c) => c.url.endsWith('/178/media'));
  const publish = httpLog.find((c) => c.url.endsWith('/178/media_publish'));
  assert.ok(container && publish, 'container then publish must both happen');
  assert.ok(httpLog.indexOf(container) < httpLog.indexOf(publish), 'publish came before the container');
  assert.strictEqual(publish.params.payload.creation_id, 'container-1');
});

test('instagram refuses to run without a public image', () => {
  const { context, httpLog } = makeSandbox({ props: { META_IG_ID: '178', META_PAGE_TOKEN: 'tok' } });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 13)));
  const res = vm.runInContext('publishInstagram_', context)(post, '');
  assert.strictEqual(res.skipped, true);
  assert.strictEqual(httpLog.length, 0, 'must not call the api at all');
});

test('linkedin uses the current /rest/posts shape and a 2900 char cap', () => {
  const { context, httpLog } = makeSandbox({
    props: { LINKEDIN_ACCESS_TOKEN: 'li', LINKEDIN_AUTHOR_URN: 'urn:li:person:abc' },
    http: () => ({ code: 201, text: '{}', headers: { 'x-restli-id': 'urn:li:share:1' } }),
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 14)));
  const res = vm.runInContext('publishLinkedIn_', context)(post, '');
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  const body = JSON.parse(httpLog[0].params.payload);
  assert.strictEqual(body.visibility, 'PUBLIC');
  assert.ok(body.commentary.length <= 2900);
  assert.strictEqual(httpLog[0].params.headers['LinkedIn-Version'] !== undefined, true);
});

test('x signs with OAuth 1.0a and stays inside the character budget', () => {
  const { context, httpLog } = makeSandbox({
    props: { X_API_KEY: 'ck', X_API_SECRET: 'cs', X_ACCESS_TOKEN: 'at', X_ACCESS_SECRET: 'ats' },
    http: () => ({ code: 201, text: '{"data":{"id":"1799"}}' }),
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 4)));
  const res = vm.runInContext('publishX_', context)(post);
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  const auth = httpLog[0].params.headers.Authorization;
  assert.ok(auth.indexOf('OAuth ') === 0);
  assert.ok(auth.includes('oauth_signature='));
  assert.ok(!/undefined/.test(auth), 'undefined leaked into the oauth header');
  const text = JSON.parse(httpLog[0].params.payload).text;
  assert.ok(text.length <= 280, 'too long: ' + text.length);
  assert.ok(text.includes('https://gahonsh-blip.github.io'));
});

test('x skips with a clear message when only a bearer token exists', () => {
  const { context } = makeSandbox({ props: { TWITTER_BEARER_TOKEN: 'app-only' } });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 3)));
  const res = vm.runInContext('publishX_', context)(post);
  assert.strictEqual(res.skipped, true);
  assert.ok(/OAuth 1.0a/.test(res.error));
});

test('bluesky keeps the text short and the link clickable', () => {
  const { context, httpLog } = makeSandbox({
    props: { BSKY_HANDLE: 'gahonsh.bsky.social', BSKY_APP_PASSWORD: 'xxxx' },
    http: (url) => {
      if (url.includes('createSession')) return { code: 200, text: '{"accessJwt":"jwt","did":"did:plc:abc"}' };
      if (url.includes('createRecord')) return { code: 200, text: '{"uri":"at://x/1"}' };
      return { code: 200, text: '{}' };
    },
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 2)));
  const res = vm.runInContext('publishBluesky_', context)(post, '');
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  const record = JSON.parse(httpLog.find((c) => c.url.includes('createRecord')).params.payload).record;
  assert.ok(record.text.length <= 300);
  assert.strictEqual(record.facets[0].features[0].$type, 'app.bsky.richtext.facet#link');
});

test('telegram caption fits the photo caption limit', () => {
  const { context, httpLog } = makeSandbox({ props: { TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '-100' } });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 6)));
  vm.runInContext('publishTelegram_', context)(post, 'https://img/x.jpg');
  const call = httpLog.find((c) => c.url.includes('sendPhoto'));
  assert.ok(call.params.payload.caption.length <= 1024);
});

test('an already posted headline on the page is not posted twice', () => {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}T04:00:00+0000`;
  const { context } = makeSandbox({
    props: { META_PAGE_ID: '824', META_PAGE_TOKEN: 'tok' },
    http: (url) => {
      if (url.includes('/posts?')) {
        return { code: 200, text: JSON.stringify({ data: [{ id: '824_9', created_time: stamp, message: 'Flutter apps for Android and iOS from one codebase\n\nmore' }] }) };
      }
      return { code: 200, text: '{"id":"new"}' };
    },
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date());
  const res = vm.runInContext('publishFacebook_', context)(post, 'https://img/x.jpg');
  assert.strictEqual(res.skipped, true, JSON.stringify(res));
  assert.ok(/already posted today/.test(res.note), res.note);
});

test('a different headline today is still posted', () => {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const stamp = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}T04:00:00+0000`;
  const { context, httpLog } = makeSandbox({
    props: { META_PAGE_ID: '824', META_PAGE_TOKEN: 'tok' },
    http: (url) => {
      if (url.includes('/posts?')) {
        return { code: 200, text: JSON.stringify({ data: [{ id: '824_8', created_time: stamp, message: 'A completely different message' }] }) };
      }
      return { code: 200, text: '{"id":"new"}' };
    },
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date());
  const res = vm.runInContext('publishFacebook_', context)(post, 'https://img/x.jpg');
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.ok(httpLog.some((c) => c.url.includes('/824/photos')));
});

/* ------------------------------------------------------------------ *
 * 5. YouTube                                                         *
 * ------------------------------------------------------------------ */
SECTION('youtube');
function youtubeStub(privacy) {
  const calls = { insert: [], list: [] };
  return {
    calls,
    api: {
      Videos: {
        insert: (resource, parts, blob) => {
          calls.insert.push({ resource, parts, size: blob.getBytes().length });
          return { id: 'vid123' };
        },
        list: (part, params) => {
          calls.list.push({ part, params });
          return { items: [{ id: params.id, status: { privacyStatus: privacy } }] };
        },
      },
    },
  };
}

test('youtube uploads the mp4 blob and reports the real privacy status', () => {
  const today = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const key = `${today.getUTCFullYear()}-${pad(today.getUTCMonth() + 1)}-${pad(today.getUTCDate())}`;
  const yt = youtubeStub('public');
  const { context } = makeSandbox({
    youtube: yt.api,
    http: (url) => {
      if (url.includes('daily.json')) return { code: 200, text: JSON.stringify({ date: key, video_url: 'https://x/v.mp4', title: 'T', description: 'D' }) };
      return { code: 200, text: 'x' };
    },
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date());
  const media = { video: { url: 'https://x/v.mp4', title: 'T', description: 'D' } };
  const res = vm.runInContext('publishYouTube_', context)(post, '', media);
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(res.note, 'public');
  assert.ok(res.url.includes('youtube.com/shorts/vid123'));
  assert.strictEqual(yt.calls.insert[0].resource.status.privacyStatus, 'public');
  assert.strictEqual(yt.calls.insert[0].parts, 'snippet,status');
  assert.ok(yt.calls.insert[0].size > 20000, 'video blob looks empty');
});

test('youtube warns instead of pretending when the project forces private', () => {
  const yt = youtubeStub('private');
  const { context } = makeSandbox({ youtube: yt.api, http: () => ({ code: 200, text: 'x' }) });
  const post = vm.runInContext('buildDailyPost', context)(new Date());
  const res = vm.runInContext('publishYouTube_', context)(post, '', { video: { url: 'https://x/v.mp4' } });
  assert.strictEqual(res.ok, true);
  assert.ok(/privacy=private/.test(res.note), res.note);
});

test('youtube skips cleanly with no video or no advanced service', () => {
  const { context } = makeSandbox({ http: () => ({ code: 200, text: 'x' }) });
  const post = vm.runInContext('buildDailyPost', context)(new Date());
  const noService = vm.runInContext('publishYouTube_', context)(post, '', { video: { url: 'https://x/v.mp4' } });
  assert.strictEqual(noService.skipped, true);
  assert.ok(/advanced service/i.test(noService.error));

  const yt = youtubeStub('public');
  const withService = makeSandbox({ youtube: yt.api, http: () => ({ code: 200, text: 'x' }) });
  const noVideo = vm.runInContext('publishYouTube_', withService.context)(post, '', {});
  assert.strictEqual(noVideo.skipped, true);
  assert.ok(/no video/i.test(noVideo.error));
  assert.strictEqual(yt.calls.insert.length, 0);
});

/* ------------------------------------------------------------------ *
 * 6. Orchestrator: idempotency, isolation, dry run                   *
 * ------------------------------------------------------------------ */
SECTION('orchestrator');
test('a second run the same day posts nothing again', () => {
  const { context, httpLog } = makeSandbox({
    props: { PUBLISH_IMAGE: 'no', TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' },
    http: () => ({ code: 200, text: '{"ok":true,"result":{"message_id":7}}' }),
  });
  const run = vm.runInContext('runDailyPost', context);
  const first = run();
  assert.strictEqual(first.ok, true, JSON.stringify(first));
  const publishCalls = () => httpLog.filter((c) => /graph\.facebook|api\.telegram|www\.blogger|/i.test(c.url) && /graph\.facebook|api\.telegram|blogger/.test(c.url)).length;
  const before = publishCalls();
  assert.ok(before >= 1, 'first run published nothing');
  const second = run();
  assert.strictEqual(second.skipped, true, JSON.stringify(second));
  assert.strictEqual(publishCalls(), before, 'second run must not publish again');
});

test('only the failed channel is retried after a fix', () => {
  let bloggerFails = true;
  const { context, httpLog } = makeSandbox({
    props: { PUBLISH_IMAGE: 'no', TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' },
    http: (url) => {
      if (url.includes('blogger')) return bloggerFails ? { code: 400, text: 'bad' } : { code: 200, text: '{"id":"p1","url":"https://blog/p1"}' };
      return { code: 200, text: '{"ok":true,"result":{"message_id":7}}' };
    },
  });
  const run = vm.runInContext('runDailyPost', context);
  const first = run();
  assert.strictEqual(first.channelsOk.includes('telegram'), true);
  assert.strictEqual(first.channelsFailed.includes('blogger'), true);

  bloggerFails = false;
  const before = httpLog.length;
  const second = run();
  assert.strictEqual(second.ok, true, JSON.stringify(second));
  const retried = httpLog.slice(before).map((c) => c.url).join(' ');
  assert.ok(retried.includes('blogger'), 'blogger was not retried');
  assert.ok(!retried.includes('telegram'), 'telegram posted twice');
});

test('a failing channel never stops the others', () => {
  const { context } = makeSandbox({
    props: { PUBLISH_IMAGE: 'no', BSKY_HANDLE: 'a', BSKY_APP_PASSWORD: 'b', TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '-100' },
    http: (url) => (url.includes('bsky.social') ? { code: 400, text: 'boom' } : { code: 200, text: '{"result":{"message_id":7}}' }),
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 6, 5)));
  const results = vm.runInContext('publishAll_', context)(post, '');
  const by = results.reduce((acc, r) => Object.assign(acc, { [r.channel]: r }), {});
  assert.strictEqual(by.bluesky.ok, false);
  assert.strictEqual(by.telegram.ok, true);
});

test('a transient 503 is retried exactly once', () => {
  let first = true;
  const { context, httpLog } = makeSandbox({
    props: { PUBLISH_IMAGE: 'no', TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' },
    http: (url) => {
      if (url.includes('telegram') && first) { first = false; return { code: 503, text: 'unavailable' }; }
      return { code: 200, text: '{"result":{"message_id":7}}' };
    },
  });
  const post = vm.runInContext('buildDailyPost', context)(new Date());
  const fn = vm.runInContext('publishTelegram_', context);
  const res = vm.runInContext('withRetry_', context)(() => fn(post, ''));
  assert.strictEqual(res.ok, true, JSON.stringify(res));
  assert.strictEqual(httpLog.filter((c) => c.url.includes('telegram')).length, 2);
});

test('DISABLE_<CHANNEL> switches a configured channel off', () => {
  const { context } = makeSandbox({ props: { META_PAGE_ID: '1', META_PAGE_TOKEN: 't', DISABLE_FACEBOOK: 'yes' } });
  const names = vm.runInContext('adapters_', context)().map((a) => a.name);
  assert.ok(!names.includes('facebook'), names.join(','));
});

test('dryRun builds everything and publishes nothing', () => {
  const { context, httpLog } = makeSandbox({
    props: { PUBLISH_IMAGE: 'no', META_PAGE_ID: '1', META_PAGE_TOKEN: 't', TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' },
  });
  const report = vm.runInContext('dryRun', context)();
  assert.ok(report.headline.length > 5);
  assert.ok(report.plan.length >= 3, 'plan should list every channel');
  const posting = httpLog.filter((c) => /graph\.facebook|api\.telegram/.test(c.url));
  assert.strictEqual(posting.length, 0, 'dryRun must not post');
});

test('resetToday clears the marks so a channel can be retried', () => {
  const { context, props } = makeSandbox({ props: { PUBLISH_IMAGE: 'no', TELEGRAM_BOT_TOKEN: 'tok', TELEGRAM_CHAT_ID: '42' } });
  vm.runInContext('runDailyPost', context)();
  assert.ok(Object.keys(props).some((k) => k.startsWith('done_')), 'no marks written');
  const res = vm.runInContext('resetToday', context)();
  assert.ok(res.cleared.length >= 1);
  assert.ok(!Object.keys(props).some((k) => k.startsWith('done_')));
});

/* ------------------------------------------------------------------ *
 * 7. Setup report                                                    *
 * ------------------------------------------------------------------ */
SECTION('setup');
test('channelMatrix is honest about what is on and what is missing', () => {
  const { context } = makeSandbox({ props: { META_PAGE_ID: '1', META_PAGE_TOKEN: 't', META_IG_ID: '178' } });
  const rows = vm.runInContext('channelMatrix', context)();
  const by = rows.reduce((acc, r) => Object.assign(acc, { [r.channel]: r }), {});
  assert.strictEqual(by.facebook.ready, true);
  assert.strictEqual(by.instagram.ready, true);
  assert.strictEqual(by.telegram.ready, false);
  assert.ok(by.telegram.needs.join(' ').includes('TELEGRAM_BOT_TOKEN'));
  assert.strictEqual(by.blogger.ready, true);
});

const total = passed + failures.length;
console.log('\n' + passed + '/' + total + ' passed');
if (failures.length) {
  failures.forEach((f) => console.log('  - ' + f.name + ': ' + f.error));
  process.exit(1);
}
