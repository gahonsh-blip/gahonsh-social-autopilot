/**
 * Local test harness for the Apps Script project.
 *
 * Apps Script cannot be run outside Google, so this file loads the real .gs
 * sources into a Node VM with stubbed Google services and asserts the behaviour
 * that actually matters: the link is always present, festivals are detected,
 * the daily job is idempotent, and one failing channel cannot stop the others.
 *
 *   node tests/local-test.js
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const FILES = ['config.gs', 'calendar.gs', 'content.gs', 'image.gs', 'publishers.gs', 'Code.gs', 'backfill.gs'];

function makeSandbox(options) {
  const opts = options || {};
  const props = Object.assign({}, opts.props || {});
  const httpLog = [];

  class Sheet {
    constructor(name) {
      this.name = name;
      this.rows = [];
    }
    appendRow(row) { this.rows.push(row); }
    getDataRange() { return { getValues: () => (opts.sheetRows || []) }; }
  }
  class Spreadsheet {
    constructor(id, name) { this.id = id || 'sheet-' + Math.random(); this.name = name; this.tabs = {}; }
    getId() { return this.id; }
    getSheetByName(name) { return this.tabs[name] || null; }
    insertSheet(name) { const s = new Sheet(name); this.tabs[name] = s; return s; }
  }

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
    Logger: { log: () => {} },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => (Object.prototype.hasOwnProperty.call(props, k) ? props[k] : null),
        setProperty: (k, v) => { props[k] = String(v); },
        deleteProperty: (k) => { delete props[k]; },
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
    },
    ScriptApp: {
      getOAuthToken: () => 'stub-token',
      getProjectTriggers: () => [],
      deleteTrigger: () => {},
      newTrigger: () => ({
        timeBased: () => ({ atHour() { return this; }, nearMinute() { return this; }, everyDays() { return this; }, inTimezone() { return this; }, create() { return {}; } }),
      }),
    },
    CalendarApp: {
      getDefaultCalendar: () => ({
        getEventsForDay: () => (opts.events || []).map((title) => ({ getTitle: () => title, isAllDayEvent: () => true })),
      }),
    },
    SpreadsheetApp: {
      create: (name) => new Spreadsheet(null, name),
      openById: (id) => new Spreadsheet(id, 'log'),
    },
    DriveApp: {
      getFoldersByName: () => ({ hasNext: () => false }),
      createFolder: () => ({ createFile: () => ({ getId: () => 'img1', setSharing: () => {} }) }),
      Access: { ANYONE_WITH_LINK: 1 },
      Permission: { VIEW: 1 },
      getFileById: () => ({ setTrashed: () => {} }),
    },
    SlidesApp: {},
    UrlFetchApp: {
      fetch: (url, params) => {
        httpLog.push({ url, params: params || {} });
        const handler = opts.http && opts.http(url, params);
        const result = handler || { code: 200, text: '{"id":"ok","url":"https://blog.example/post"}' };
        return {
          getResponseCode: () => result.code,
          getContentText: () => result.text,
          getBlob: () => ({ setName: () => ({}) }),
          getHeaders: () => ({}),
        };
      },
    },
    __httpLog: httpLog,
    __props: props,
  };
  sandbox.global = sandbox;

  const context = vm.createContext(sandbox);
  FILES.forEach((file) => {
    const code = fs.readFileSync(path.join(ROOT, file), 'utf8');
    vm.runInContext(code, context, { filename: file });
  });
  return { context, httpLog, props };
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

console.log('GAHONSH autopilot - local tests\n');

/* ---------------------------------------------------------------- *
 * 1. Every post carries the website link, whatever the day is      *
 * ---------------------------------------------------------------- */
test('every generated post contains the website link', () => {
  const { context } = makeSandbox();
  const post = vm.runInContext('buildDailyPost', context);
  for (let i = 0; i < 60; i++) {
    const date = new Date(Date.UTC(2026, 0, 1) + i * 6 * 86400000);
    const result = post(date);
    assert.ok(result.caption.includes('https://gahonsh-blip.github.io'), 'missing link on ' + result.dateKey);
    assert.ok(result.caption.length > 80, 'caption too short on ' + result.dateKey);
    assert.ok(result.hashtags.includes('#'), 'missing hashtags on ' + result.dateKey);
    assert.ok(result.title.includes('GAHONSH'), 'title missing brand');
  }
});

/* ---------------------------------------------------------------- *
 * 2. Festival detection from the built-in calendar                 *
 * ---------------------------------------------------------------- */
test('detects Diwali 2026 as a festival post', () => {
  const { context } = makeSandbox();
  const post = vm.runInContext('buildDailyPost', context);
  const result = post(new Date(Date.UTC(2026, 10, 8)));
  assert.strictEqual(result.type, 'festival');
  assert.strictEqual(result.occasion, 'Diwali');
  assert.ok(/Diwali/.test(result.headline));
  assert.ok(result.caption.includes('https://gahonsh-blip.github.io'));
});

test('detects a festival from a Google Calendar all-day event', () => {
  const { context } = makeSandbox({ events: ['Diwali Celebration'] });
  const post = vm.runInContext('buildDailyPost', context);
  const result = post(new Date(Date.UTC(2027, 10, 1)));
  assert.strictEqual(result.type, 'festival');
  assert.strictEqual(result.source, 'google-calendar');
});

test('fixed observance like Republic Day is flagged as an occasion', () => {
  const { context } = makeSandbox();
  const post = vm.runInContext('buildDailyPost', context);
  const result = post(new Date(Date.UTC(2026, 0, 26)));
  assert.strictEqual(result.type, 'occasion');
  assert.strictEqual(result.occasion, 'Republic Day');
});

test('a plain day falls back to the business rotation', () => {
  const { context } = makeSandbox();
  const post = vm.runInContext('buildDailyPost', context);
  const result = post(new Date(Date.UTC(2026, 0, 13)));
  assert.strictEqual(result.type, 'business');
  assert.ok(result.headline.length > 10);
});

/* ---------------------------------------------------------------- *
 * 3. Idempotency                                                   *
 * ---------------------------------------------------------------- */
test('runDailyPost publishes once and then refuses to repeat', () => {
  const { context, httpLog } = makeSandbox({
    props: { PUBLISH_BLOGGER: 'yes', PUBLISH_TELEGRAM: 'no', PUBLISH_IMAGE: 'no', BLOGGER_BLOG_ID: '123' },
  });
  const run = vm.runInContext('runDailyPost', context);
  const first = run();
  assert.strictEqual(first.ok, true, 'first run should succeed');
  const callsAfterFirst = httpLog.length;
  assert.ok(callsAfterFirst >= 1, 'no http call was made');

  const second = run();
  assert.strictEqual(second.skipped, true);
  assert.strictEqual(second.reason, 'already_posted_today');
  assert.strictEqual(httpLog.length, callsAfterFirst, 'second run must not publish again');
});

/* ---------------------------------------------------------------- *
 * 4. Failure isolation                                             *
 * ---------------------------------------------------------------- */
test('a failing channel does not stop the others', () => {
  const { context, httpLog } = makeSandbox({
    props: {
      PUBLISH_BLOGGER: 'yes',
      PUBLISH_TELEGRAM: 'yes',
      PUBLISH_IMAGE: 'no',
      BLOGGER_BLOG_ID: '123',
      TELEGRAM_BOT_TOKEN: 'tok',
      TELEGRAM_CHAT_ID: '42',
    },
    http: (url) => (url.includes('blogger') ? { code: 500, text: 'boom' } : { code: 200, text: '{"ok":true,"result":{"message_id":7}}' }),
  });
  const run = vm.runInContext('runDailyPost', context);
  const result = run();
  assert.strictEqual(result.channelsOk.length, 1, 'telegram should still succeed');
  assert.ok(result.channelsOk.includes('telegram'));
  const blogger = result.results.find((r) => r.channel === 'blogger');
  assert.strictEqual(blogger.ok, false);
  assert.ok(httpLog.length >= 2, 'both channels should have been attempted');
});

test('unconfigured channels are skipped, not treated as errors', () => {
  const { context } = makeSandbox({ props: { PUBLISH_BLOGGER: 'yes', PUBLISH_IMAGE: 'no' } });
  const run = vm.runInContext('runDailyPost', context);
  const result = run();
  const blogger = result.results.find((r) => r.channel === 'blogger');
  assert.strictEqual(blogger.skipped, true);
  assert.strictEqual(result.ok, false, 'nothing published means ok is false');
});

/* ---------------------------------------------------------------- *
 * 5. Blog HTML                                                     *
 * ---------------------------------------------------------------- */
test('blog html includes the caption, the link and the image', () => {
  const { context } = makeSandbox();
  const post = vm.runInContext('buildDailyPost', context)(new Date(Date.UTC(2026, 4, 12)));
  const html = vm.runInContext('postHtml_', context)(post, 'https://img.example/a.png');
  assert.ok(html.includes('https://gahonsh-blip.github.io'));
  assert.ok(html.includes('<img src="https://img.example/a.png"'));
  assert.ok(html.includes('<p>'));
});

/* ---------------------------------------------------------------- *
 * 6. Topic rotation is stable per date                             *
 * ---------------------------------------------------------------- */
test('the same date always produces the same headline', () => {
  const { context } = makeSandbox();
  const post = vm.runInContext('buildDailyPost', context);
  const date = new Date(Date.UTC(2026, 6, 15));
  assert.strictEqual(post(date).headline, post(date).headline);
});

const total = passed + failures.length;
console.log('\n' + passed + '/' + total + ' passed');
if (failures.length) {
  failures.forEach((f) => console.log('  - ' + f.name + ': ' + f.error));
  process.exit(1);
}
