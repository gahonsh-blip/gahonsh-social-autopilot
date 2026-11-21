/**
 * GAHONSH social autopilot - single file build.
 * Generated from the modules in this repo by build-bundle.js. Do not edit here.
 *
 * Paste this whole file into script.google.com as Code.gs, then run setupAll().
 * Full instructions: SETUP.md
 */

/* ======================= config.gs ======================= */

/**
 * GAHONSH social autopilot - shared configuration.
 *
 * Every API used here is free:
 *   Google (Blogger, YouTube, Slides, Calendar) - included with the Google account
 *   Meta Graph (Facebook Page, Instagram)        - free app, no card
 *   Telegram bot, Bluesky, Mastodon, dev.to      - free accounts
 *   GitHub Contents API                          - free public media hosting
 *
 * Keys are never written in this file. They live in Script Properties
 * (Project Settings -> Script properties) so this code can stay in a public repo.
 */

var CONFIG = {
  brand: 'GAHONSH',
  tagline: 'Websites, web apps and APIs, built properly',
  website: 'https://gahonsh-blip.github.io',
  portfolio: 'https://gahonsh-blip.github.io/portfolio.html',
  email: 'gahonsh@gmail.com',
  whatsapp: 'https://wa.me/919999999999',
  timezone: 'Asia/Kolkata',
  driveFolder: 'GAHONSH Social',
  defaultBlogId: '4592871834916952562', // gahonsh.blogspot.com
  logSheetName: 'GAHONSH Social Post Log',
  logTabName: 'PostLog',

  // Public media host. Instagram, Facebook and Bluesky need a direct https URL,
  // so the generated card is committed to the GitHub Pages repo and served from
  // there. Free, permanent, no expiry.
  mediaRepo: {
    owner: 'gahonsh-blip',
    repo: 'gahonsh-blip.github.io',
    branch: 'main',
    dir: 'social/media',
    publicBase: 'https://gahonsh-blip.github.io/social/media'
  },

  // Built by the free GitHub Action (ffmpeg + free TTS, no paid video API).
  videoManifestUrl: 'https://gahonsh-blip.github.io/social/daily.json',
  // If the slide card cannot be built for any reason, this evergreen card is
  // used instead so Instagram still gets a real image and the post goes out.
  fallbackCardUrl: 'https://gahonsh-blip.github.io/social/media/card-default.jpg',

  // Google's own holiday calendar for India: every festival date, every year,
  // maintained by Google. No hardcoded lunar dates to get wrong.
  holidayCalendarId: 'en.indian#holiday@group.v.calendar.google.com',

  // Meta retires a Graph API version about two years after release (v20.0 stopped
  // answering on 2026-09-24). LinkedIn retires each marketing version after one
  // year. Both defaults can be overridden from Script Properties, so a sunset is
  // a property change, not a code change.
  metaGraphVersion: 'v25.0',
  linkedinVersion: '202611',

  limits: { x: 275, bluesky: 290, mastodon: 480, telegram: 1000, instagram: 2100, linkedin: 2900, facebook: 5000 }
};

/** Base URL for a Graph API path, on the configured version. */
function graphUrl_(path) {
  return 'https://graph.facebook.com/' + prop_('META_GRAPH_VERSION', CONFIG.metaGraphVersion) + '/' + path;
}

/** LinkedIn marketing version header value. */
function linkedinVersion_() {
  return prop_('LINKEDIN_VERSION', CONFIG.linkedinVersion);
}

/** Read a Script Property with a default. */
function prop_(key, fallback) {
  var value = PropertiesService.getScriptProperties().getProperty(key);
  return value === null || value === '' ? (fallback === undefined ? '' : fallback) : value;
}

/** First non-empty Script Property out of several accepted names. */
function propAny_(names, fallback) {
  for (var i = 0; i < names.length; i++) {
    var value = prop_(names[i], '');
    if (value) return value;
  }
  return fallback === undefined ? '' : fallback;
}

/** Date key used for idempotency and log rows: 2026-11-16 */
function dateKey_(date) {
  return Utilities.formatDate(date, CONFIG.timezone, 'yyyy-MM-dd');
}

/** Stable small hash so the same date always picks the same topic. */
function dayIndex_(date, modulo) {
  var start = new Date(Date.UTC(date.getFullYear(), 0, 1));
  var diff = Math.floor((Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) - start.getTime()) / 86400000);
  return Math.abs(diff + date.getFullYear()) % modulo;
}

/** Cut text to a character budget without slicing a word in half. */
function truncate_(text, max) {
  var value = String(text || '');
  if (!max || value.length <= max) return value;
  var cut = value.slice(0, max - 1);
  var space = cut.lastIndexOf(' ');
  if (space > max * 0.6) cut = cut.slice(0, space);
  return cut.replace(/[\s,;:.-]+$/, '') + '\u2026';
}

/** Apps Script has Utilities.sleep; tests stub it. */
function sleepMs_(ms) {
  try { Utilities.sleep(ms); } catch (err) { /* ignore */ }
}

/** Channel keys, in the order they appear in reports. */
var CHANNELS = ['blogger', 'telegram', 'facebook', 'instagram', 'linkedin', 'x', 'youtube', 'bluesky', 'mastodon', 'devto'];

/**
 * A channel is on when its keys exist. Setting DISABLE_<CHANNEL>=yes turns it
 * off without deleting keys. Nothing has to be switched on by hand.
 */
function channelDisabled_(channel) {
  return String(prop_('DISABLE_' + channel.toUpperCase(), 'no')).toLowerCase() === 'yes';
}

function hasFacebook_() { return !!(propAny_(['META_PAGE_ID', 'FACEBOOK_PAGE_ID']) && propAny_(['META_PAGE_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN'])); }
function hasInstagram_() { return !!(propAny_(['META_IG_ID', 'INSTAGRAM_BUSINESS_ACCOUNT_ID']) && propAny_(['META_PAGE_TOKEN', 'INSTAGRAM_ACCESS_TOKEN'])); }
function hasTelegram_() { return !!(prop_('TELEGRAM_BOT_TOKEN') && prop_('TELEGRAM_CHAT_ID')); }
function hasLinkedIn_() { return !!(prop_('LINKEDIN_ACCESS_TOKEN') && prop_('LINKEDIN_AUTHOR_URN')); }
function hasX_() { return !!(prop_('X_API_KEY') && prop_('X_API_SECRET') && prop_('X_ACCESS_TOKEN') && prop_('X_ACCESS_SECRET')); }
function hasBluesky_() { return !!(prop_('BSKY_HANDLE') && prop_('BSKY_APP_PASSWORD')); }
function hasMastodon_() { return !!(prop_('MASTODON_INSTANCE') && prop_('MASTODON_TOKEN')); }
function hasDevTo_() { return !!prop_('DEVTO_API_KEY'); }
function hasBlogger_() { return !!propAny_(['BLOGGER_BLOG_ID'], CONFIG.defaultBlogId); }

/* ======================= calendar.gs ======================= */

/**
 * Calendar + festival awareness.
 *
 * Three sources, in priority order:
 *   1. Google's built-in Indian holiday calendar (subscribed once by setupAll).
 *      It carries every festival date for every year, so nothing goes stale.
 *   2. The owner's own calendars: any all-day event that looks like an occasion.
 *   3. A built-in list of fixed observances plus the verified 2026 festivals,
 *      used only when neither calendar answers.
 *   4. A ContentCalendar sheet the owner can edit without touching code.
 */

var FIXED_OBSERVANCES = {
  '01-01': 'New Year',
  '01-26': 'Republic Day',
  '02-14': 'Valentine\u2019s Day',
  '03-08': 'International Women\u2019s Day',
  '04-22': 'Earth Day',
  '05-01': 'Labour Day',
  '06-05': 'World Environment Day',
  '06-21': 'International Yoga Day',
  '08-15': 'Independence Day',
  '09-05': 'Teachers\u2019 Day',
  '10-02': 'Gandhi Jayanti',
  '10-24': 'United Nations Day',
  '11-14': 'Children\u2019s Day',
  '12-25': 'Christmas',
  '12-31': 'New Year\u2019s Eve'
};

/**
 * Major Indian festivals. Lunar dates move every year, so only 2026 is filled in
 * and 2027 is intentionally left to the calendar. Verify before relying on it.
 */
var INDIAN_FESTIVALS = {
  '2026-01-14': 'Makar Sankranti',
  '2026-02-15': 'Maha Shivratri',
  '2026-03-03': 'Holika Dahan',
  '2026-03-04': 'Holi',
  '2026-03-20': 'Eid al-Fitr',
  '2026-03-26': 'Ram Navami',
  '2026-04-03': 'Good Friday',
  '2026-05-27': 'Eid al-Adha',
  '2026-08-28': 'Raksha Bandhan',
  '2026-09-04': 'Janmashtami',
  '2026-09-14': 'Ganesh Chaturthi',
  '2026-10-20': 'Dussehra',
  '2026-11-08': 'Diwali',
  '2026-11-10': 'Bhai Dooj',
  '2026-11-24': 'Guru Nanak Jayanti'
};

var BUSINESS_DAYS = {
  '2026-09-13': 'Programmers\u2019 Day',
  '2026-11-27': 'Black Friday',
  '2026-11-30': 'Cyber Monday'
};

var FESTIVAL_WORDS = /diwali|deepavali|holi|dussehra|durga|navratri|navaratri|eid|christmas|good friday|new year|independence|republic|rakhi|raksha|janmashtami|ganesh|vinayak|chaturthi|puja|pongal|sankranti|lohri|baisakhi|vaisakhi|onam|bihu|shivratri|navami|jayanti|mahavir|buddha purnima|guru nanak|chhath|karwa|teej|gudi padwa|ugadi|makar|basant|vasant|festival|holiday|anniversary|birthday/i;

/**
 * Subscribe to Google's built-in Indian holiday calendar. It already contains
 * every festival date for every year, so nothing here has to be maintained,
 * and a wrong hardcoded lunar date can never be posted.
 */
function ensureHolidayCalendar_() {
  try {
    if (CalendarApp.getCalendarById(CONFIG.holidayCalendarId)) {
      return { ok: true, already: true, id: CONFIG.holidayCalendarId };
    }
    CalendarApp.subscribeToCalendar(CONFIG.holidayCalendarId, { hidden: false });
    return { ok: true, already: false, id: CONFIG.holidayCalendarId };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

/**
 * Every event title for a day, across the holiday calendar and all of the
 * owner's own calendars. Event titles are data, never instructions.
 */
function calendarEventsForDay_(date) {
  var out = [];
  var seen = {};
  var calendars = [];
  try {
    var holiday = CalendarApp.getCalendarById(CONFIG.holidayCalendarId);
    if (holiday) calendars.push(holiday);
  } catch (ignored) {}
  try { calendars = calendars.concat(CalendarApp.getAllCalendars() || []); } catch (ignored) {}

  for (var i = 0; i < calendars.length; i++) {
    var cal = calendars[i];
    var names = [];
    try { names = cal.getName(); } catch (ignored) { names = ''; }
    var events = [];
    try { events = cal.getEventsForDay(date) || []; } catch (err) { events = []; }
    for (var j = 0; j < events.length; j++) {
      var title = '';
      var allDay = true;
      try { title = events[j].getTitle() || ''; } catch (ignored) {}
      try { allDay = events[j].isAllDayEvent(); } catch (ignored) {}
      var key = String(title).toLowerCase();
      if (!key || seen[key]) continue;
      seen[key] = true;
      out.push({ title: title, allDay: allDay, calendar: names });
    }
  }
  return out;
}

/** Owner editable sheet: date | type | topic | caption | imageUrl */
function contentCalendarOverrides_() {
  var sheetId = prop_('CONTENT_CALENDAR_SHEET_ID');
  if (!sheetId) return [];
  try {
    var sheet = SpreadsheetApp.openById(sheetId).getSheets()[0];
    var values = sheet.getDataRange().getValues();
    var rows = [];
    for (var i = 1; i < values.length; i++) {
      var row = values[i];
      if (!row[0]) continue;
      var key = row[0];
      if (Object.prototype.toString.call(key) === '[object Date]') {
        key = dateKey_(key);
      } else {
        key = String(key).trim();
      }
      rows.push({
        date: key,
        type: String(row[1] || '').toLowerCase() || 'business',
        topic: String(row[2] || ''),
        caption: String(row[3] || ''),
        imageUrl: String(row[4] || '')
      });
    }
    return rows;
  } catch (err) {
    return [];
  }
}

/**
 * Decide what today's post is about.
 * Returns { type: 'festival'|'business', occasion: string|null, source: string }
 */
function classifyDay_(date) {
  var key = dateKey_(date);
  var monthDay = key.slice(5);

  var overrides = contentCalendarOverrides_();
  for (var i = 0; i < overrides.length; i++) {
    if (overrides[i].date === key) {
      return { type: overrides[i].type, occasion: overrides[i].topic || null, source: 'content-sheet', override: overrides[i] };
    }
  }

  var events = calendarEventsForDay_(date);
  for (var j = 0; j < events.length; j++) {
    if (FESTIVAL_WORDS.test(events[j].title)) {
      return { type: 'festival', occasion: events[j].title, source: 'google-calendar' };
    }
  }

  if (INDIAN_FESTIVALS[key]) {
    return { type: 'festival', occasion: INDIAN_FESTIVALS[key], source: 'builtin-festival' };
  }
  if (BUSINESS_DAYS[key]) {
    return { type: 'occasion', occasion: BUSINESS_DAYS[key], source: 'builtin-business' };
  }
  if (FIXED_OBSERVANCES[monthDay]) {
    return { type: 'occasion', occasion: FIXED_OBSERVANCES[monthDay], source: 'builtin-fixed' };
  }

  return { type: 'business', occasion: null, source: 'rotation' };
}

/** Next 7 days, used by the preview command and by the backlog filler. */
function upcomingDays_(days) {
  var out = [];
  var today = new Date();
  for (var i = 0; i < days; i++) {
    var d = new Date(today.getTime() + i * 86400000);
    var classified = classifyDay_(d);
    out.push({ date: dateKey_(d), type: classified.type, occasion: classified.occasion });
  }
  return out;
}

/* ======================= content.gs ======================= */

/**
 * Content engine. No AI API, no paid service: deterministic, professional copy
 * composed from a curated topic bank so a post costs exactly zero every day.
 */

var TOPIC_BANK = [
  { tag: 'proof', headline: 'A dashboard is only useful if the numbers are true',
    body: 'We build finance dashboards that reconcile with the source data, not just look good in a screenshot. Every KPI is traceable to a row you can open.',
    cta: 'See a live sample workbook built with 1,000 real rows.' },
  { tag: 'proof', headline: 'Your website is your hardest working salesperson',
    body: 'A clear services page, real samples and one obvious way to contact you will earn more than any ad budget. We build exactly that, in days not months.',
    cta: 'Look at the portfolio and judge the work yourself.' },
  { tag: 'service', headline: 'Custom Node.js APIs that stay fast under load',
    body: 'Express or Fastify, MySQL or Postgres, JWT auth, clean REST endpoints and tests. Documented so your next developer is not lost.',
    cta: 'Starter builds begin at $69.' },
  { tag: 'service', headline: 'Flutter apps for Android and iOS from one codebase',
    body: 'One build, two stores, no duplicated logic. Offline-first storage and real device testing before release.',
    cta: 'Tell us the screens you need and we will scope it honestly.' },
  { tag: 'service', headline: 'Laravel and PHP backends, maintained not abandoned',
    body: 'Most small businesses already run PHP. We repair, secure and extend what you have instead of forcing a rewrite.',
    cta: 'Send the repo link for a free 20 minute review.' },
  { tag: 'service', headline: 'Excel tools that behave like software',
    body: 'Trackers, loan calculators, inventory sheets and attendance registers with a dashboard, charts and a read-me that explains where to paste new data.',
    cta: 'Four sample workbooks are downloadable from the portfolio.' },
  { tag: 'education', headline: 'Why your page speed matters more than your design',
    body: 'A visitor on a phone in a weak network gives you three seconds. Compressed images, fewer scripts and a real host will beat any animation.',
    cta: 'We test every build on a throttled mobile connection before handover.' },
  { tag: 'education', headline: 'The five pages every service business actually needs',
    body: 'Home, services with prices, proof, about, contact. Anything more is optional until you have traffic.',
    cta: 'We can launch those five pages in under a week.' },
  { tag: 'education', headline: 'HTTPS is not optional in 2026',
    body: 'Browsers warn visitors, payment providers refuse, and search engines demote. A free certificate solves it in minutes.',
    cta: 'Every site we ship is HTTPS with automatic renewal.' },
  { tag: 'education', headline: 'A backup you have never restored is not a backup',
    body: 'Test the restore once a quarter. A five minute check is cheaper than a lost client database.',
    cta: 'We include a restore test in every handover.' },
  { tag: 'process', headline: 'How a GAHONSH project runs, start to finish',
    body: 'Written scope, 50 percent to start, weekly demo, then handover with the repo and credentials. No surprise invoices.',
    cta: 'Ask for the one page scope template.' },
  { tag: 'process', headline: 'You will see progress every week, not at the end',
    body: 'A staging link goes live in week one and updates as we build. Feedback lands while changes are still cheap.',
    cta: 'Book a short call and we will show you a staging build.' },
  { tag: 'process', headline: 'What we need from you to start today',
    body: 'Your logo, your services and prices, a few photos, and one person who can approve. That is the whole list.',
    cta: 'Send those four things and we begin the same week.' },
  { tag: 'process', headline: 'Fixed price, fixed scope, written down',
    body: 'Scope changes are quoted before they are built. You always know what a change costs before saying yes.',
    cta: 'Every project starts with the same short scope document.' },
  { tag: 'offer', headline: 'A landing page that converts, delivered in 3 days',
    body: 'One page, mobile first, contact form wired to your email, and the copy tightened so the offer is obvious.',
    cta: 'Starter package is $69 with a 2 to 4 day turnaround.' },
  { tag: 'offer', headline: 'Need a web app, not a brochure site?',
    body: 'Authentication, dashboards, payments and an admin panel, built on Node.js and a managed database.',
    cta: 'Professional package is $249 and includes deployment.' },
  { tag: 'offer', headline: 'Free 20 minute review of your current site',
    body: 'We will list the five things costing you enquiries, in plain language, whether or not you hire us.',
    cta: 'Email to request a slot.' },
  { tag: 'offer', headline: 'Fix a bug without rebuilding everything',
    body: 'Bring us the problem, we quote the fix, you pay only for that fix. No retainer required.',
    cta: 'Service cards start at $25.' },
  { tag: 'trust', headline: 'You own everything we build',
    body: 'Repository, hosting account, database and domain stay in your name. We hand over credentials at handover, not hold them hostage.',
    cta: 'Ask for the handover checklist.' },
  { tag: 'trust', headline: 'NDA signed before we see your data',
    body: 'Client data stays on your infrastructure. We do not reuse screenshots or numbers without written permission.',
    cta: 'We can sign your NDA or send ours.' },
  { tag: 'trust', headline: 'Seven days of bug support after every delivery',
    body: 'Anything we broke, we fix free. Anything new is quoted. That line is in writing before work starts.',
    cta: 'Read the terms on the site.' },
  { tag: 'global', headline: 'Working across time zones without losing a day',
    body: 'Americas, UK, Gulf, Singapore and Australia. Morning handovers, written updates, no calls needed unless you want them.',
    cta: 'We invoice in USD and accept international transfer.' },
  { tag: 'global', headline: 'Why international clients hire a small studio',
    body: 'You talk to the person writing the code, not an account manager reading a ticket. Decisions take minutes.',
    cta: 'Current availability is two project slots.' },
  { tag: 'insight', headline: 'Most small business sites fail on one thing: no clear next step',
    body: 'Every page should answer one question and offer one action. We rebuild the navigation around that single idea.',
    cta: 'See how the services page is structured on the site.' }
];

var WEEKDAY_FOCUS = ['trust', 'service', 'education', 'process', 'offer', 'proof', 'insight'];

var HASHTAGS = {
  proof: ['#WebDevelopment', '#Portfolio', '#Dashboard', '#BuildInPublic'],
  service: ['#NodeJS', '#Flutter', '#Laravel', '#WebApp'],
  education: ['#WebTips', '#SmallBusiness', '#WebsiteSpeed', '#SEO'],
  process: ['#Freelance', '#ClientWork', '#ProjectManagement', '#Transparency'],
  offer: ['#FreelanceDeveloper', '#WebsiteDesign', '#LaunchFast', '#SmallBusiness'],
  trust: ['#FreelanceLife', '#ClientFirst', '#NDA', '#Handover'],
  global: ['#RemoteWork', '#FreelanceDeveloper', '#GlobalClients', '#Outsourcing'],
  insight: ['#BusinessGrowth', '#WebStrategy', '#Conversion', '#FreelanceDeveloper']
};

function pickTopic_(date) {
  var focus = WEEKDAY_FOCUS[date.getDay()];
  var pool = TOPIC_BANK.filter(function (topic) { return topic.tag === focus; });
  if (!pool.length) pool = TOPIC_BANK;
  return pool[dayIndex_(date, pool.length)];
}

function hashtagsFor_(tag) {
  var base = HASHTAGS[tag] || HASHTAGS.service;
  return base.concat(['#GAHONSH', '#FreelanceDeveloperIndia']).join(' ');
}

var HINDI_NAMES = {
  'Diwali': '\u0926\u093f\u0935\u093e\u0932\u0940',
  'Holi': '\u0939\u094b\u0932\u0940',
  'Holika Dahan': '\u0939\u094b\u0932\u093f\u0915\u093e \u0926\u0939\u0928',
  'Eid al-Fitr': '\u0908\u0926',
  'Eid al-Adha': '\u092c\u0915\u0930\u0940\u0926',
  'Christmas': '\u0915\u094d\u0930\u093f\u0938\u092e\u0938',
  'New Year': '\u0928\u0935\u0935\u0930\u094d\u0937',
  'Makar Sankranti': '\u092e\u0915\u0930 \u0938\u0902\u0915\u094d\u0930\u093e\u0902\u0924\u093f',
  'Maha Shivratri': '\u092e\u0939\u093e\u0936\u093f\u0935\u0930\u093e\u0924\u094d\u0930\u093f',
  'Ram Navami': '\u0930\u093e\u092e \u0928\u0935\u092e\u0940',
  'Raksha Bandhan': '\u0930\u0915\u094d\u0937\u093e \u092c\u0902\u0927\u0928',
  'Janmashtami': '\u091c\u0928\u094d\u092e\u093e\u0937\u094d\u091f\u092e\u0940',
  'Ganesh Chaturthi': '\u0917\u0923\u0947\u0936 \u091a\u0924\u0941\u0930\u094d\u0925\u0940',
  'Dussehra': '\u0926\u0936\u0939\u0930\u093e',
  'Bhai Dooj': '\u092d\u093e\u0908 \u0926\u0942\u091c',
  'Guru Nanak Jayanti': '\u0917\u0941\u0930\u0941 \u0928\u093e\u0928\u0915 \u091c\u092f\u0902\u0924\u0940',
  'Independence Day': '\u0938\u094d\u0935\u0924\u0902\u0924\u094d\u0930\u0924\u093e \u0926\u093f\u0935\u0938',
  'Republic Day': '\u0917\u0923\u0924\u0902\u0924\u094d\u0930 \u0926\u093f\u0935\u0938'
};

function hindiGreeting_(occasion) {
  var name = HINDI_NAMES[occasion] || occasion;
  return '\u0938\u092d\u0940 \u0915\u094b ' + name + ' \u0915\u0940 \u0939\u093e\u0930\u094d\u0926\u093f\u0915 \u0936\u0941\u092d\u0915\u093e\u092e\u0928\u093e\u090f\u0901\u0964';
}

/**
 * Build the day's post. Pure function of the date plus calendar state.
 * Returns { dateKey, type, occasion, headline, caption, hashtags, link, title }
 */
function buildDailyPost(date) {
  var when = date || new Date();
  var key = dateKey_(when);
  var classified = classifyDay_(when);
  var post;

  if (classified.type === 'festival') {
    var occasion = classified.occasion || 'the festival';
    var headline = 'Happy ' + occasion + ' from ' + CONFIG.brand;
    var lines = [
      headline + '.',
      'Wishing you a calm, prosperous and happy ' + occasion + ' from all of us at ' + CONFIG.brand + '.',
      'While you celebrate, we are quietly keeping client websites fast, secure and online.'
    ];
    if (prop_('BILINGUAL_HINDI', 'yes') === 'yes') lines.push(hindiGreeting_(occasion));
    lines.push('We build websites, web apps and dashboards for businesses worldwide. ' + CONFIG.website);
    post = {
      headline: headline,
      caption: lines.join('\n\n'),
      hashtags: ['#' + occasion.replace(/[^A-Za-z0-9]/g, ''), '#Festival', '#GAHONSH', '#WebDevelopment', '#FreelanceDeveloper'].join(' '),
      tag: 'festival'
    };
  } else if (classified.type === 'occasion') {
    var occasion2 = classified.occasion || 'today';
    post = {
      headline: occasion2 + ': a good day to fix the website',
      caption: [
        occasion2 + ' is a good moment to check that your business is easy to find online.',
        'Three things worth doing today: put your prices on the services page, add one recent sample, and make the contact button obvious.',
        'If you want it done for you, we ship a landing page in three days. ' + CONFIG.website
      ].join('\n\n'),
      hashtags: ['#' + occasion2.replace(/[^A-Za-z0-9]/g, ''), '#SmallBusiness', '#GAHONSH', '#FreelanceDeveloper'].join(' '),
      tag: 'offer'
    };
  } else if (classified.override && classified.override.headline) {
    post = { headline: classified.override.headline, caption: classified.override.caption, hashtags: hashtagsFor_('service'), tag: 'service' };
  } else {
    var topic = (classified.override && classified.override.topic)
      ? { tag: 'service', headline: classified.override.topic, body: '', cta: 'See the work at ' + CONFIG.portfolio }
      : pickTopic_(when);
    var caption = [topic.headline + '.', topic.body, topic.cta, CONFIG.website].filter(Boolean).join('\n\n');
    if (classified.override && classified.override.caption) caption = classified.override.caption + '\n\n' + CONFIG.website;
    post = { headline: topic.headline, caption: caption, hashtags: hashtagsFor_(topic.tag), tag: topic.tag };
  }

  // Hard guarantee: every single post carries the website link.
  if (post.caption.indexOf(CONFIG.website) === -1) post.caption += '\n\n' + CONFIG.website;

  return {
    dateKey: key,
    type: classified.type,
    source: classified.source,
    occasion: classified.occasion,
    headline: post.headline,
    caption: post.caption,
    hashtags: post.hashtags,
    link: CONFIG.website,
    title: post.headline + ' | ' + CONFIG.brand,
    imageUrl: (classified.override && classified.override.imageUrl) || ''
  };
}

/** Full text used by blog publishing. */
function postHtml_(post, imageUrl) {
  var paragraphs = post.caption.split('\n\n').map(function (line) {
    return '<p>' + line.replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</p>';
  }).join('\n');
  var img = imageUrl ? '<img src="' + imageUrl + '" alt="' + post.headline.replace(/"/g, '') + '" style="max-width:100%;height:auto" />' : '';
  return img + '\n' + paragraphs + '\n<p><a href="' + CONFIG.portfolio + '">See the portfolio</a> | <a href="' + CONFIG.website + '">' + CONFIG.website + '</a></p>';
}

/* ======================= media.gs ======================= */

/**
 * Media pipeline. Everything here is free.
 *
 * Card  : a slide is drawn with the brand colours in Google Slides and exported
 *         as JPEG/PNG. No image API, no key, no watermark.
 * Host  : the file is committed to the GitHub Pages repo, because Instagram,
 *         Facebook and Bluesky need a direct https image URL that never expires.
 *         A Drive link does not work for Instagram; a Pages raw file does.
 * Video : rendered by the free GitHub Action (ffmpeg + free TTS) and read from
 *         the public manifest. Apps Script cannot encode video, and no free video
 *         API gives unlimited daily renders, so this is the honest split.
 */

var BRAND = {
  bg: '#F7F5F0',
  teal: '#12776A',
  amber: '#C9922E',
  navy: '#1E3A4C',
  ink: '#12211F'
};

function getOrCreateFolder_(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) return folders.next();
  return DriveApp.createFolder(name);
}

function ghToken_() {
  return propAny_(['GITHUB_TOKEN', 'GH_TOKEN', 'GITHUB_ACCESS_TOKEN']);
}

/** Commit one file to the Pages repo. Returns the public URL. */
function hostOnPages_(blob, filename, contentType) {
  var token = ghToken_();
  if (!token) throw new Error('missing GITHUB_TOKEN');
  var repo = CONFIG.mediaRepo;
  var path = repo.dir + '/' + filename;
  var api = 'https://api.github.com/repos/' + repo.owner + '/' + repo.repo + '/contents/' + path;
  var headers = { Authorization: 'Bearer ' + token, 'User-Agent': 'gahonsh-autopilot', Accept: 'application/vnd.github+json' };

  var sha = '';
  var existing = UrlFetchApp.fetch(api + '?ref=' + repo.branch, { headers: headers, muteHttpExceptions: true });
  if (existing.getResponseCode() === 200) {
    try { sha = JSON.parse(existing.getContentText()).sha || ''; } catch (err) { sha = ''; }
  }

  var payload = {
    message: 'media: ' + filename,
    content: Utilities.base64Encode(blob.getBytes()),
    branch: repo.branch
  };
  if (sha) payload.sha = sha;

  var res = UrlFetchApp.fetch(api, {
    method: 'put',
    contentType: 'application/json',
    headers: headers,
    payload: JSON.stringify(payload),
    muteHttpExceptions: true
  });
  var code = res.getResponseCode();
  if (code !== 200 && code !== 201) {
    throw new Error('github_put_http_' + code + ': ' + res.getContentText().slice(0, 140));
  }
  return repo.publicBase.replace(/\/$/, '') + '/' + filename;
}

/** GitHub Pages takes 20-90 seconds to serve a brand new file. Wait for it. */
function waitForPublicUrl_(url, tries, delayMs) {
  var attempts = tries || 8;
  for (var i = 0; i < attempts; i++) {
    try {
      var res = UrlFetchApp.fetch(url, { method: 'get', muteHttpExceptions: true, followRedirects: true });
      var code = res.getResponseCode();
      if (code === 200) return true;
      if (code === 404) { sleepMs_(delayMs || 10000); continue; }
      return true; // some hosts answer 403/405 to HEAD-ish reads but serve the file
    } catch (err) {
      sleepMs_(delayMs || 10000);
    }
  }
  return false;
}

/** Export one slide as an image blob. */
function exportSlide_(presentationId, pageId, kind) {
  var url = 'https://docs.google.com/presentation/d/' + presentationId + '/export/' +
    (kind === 'jpeg' ? 'jpeg' : 'png') + '?pageid=' + pageId;
  var response = UrlFetchApp.fetch(url, {
    headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
    muteHttpExceptions: true,
    followRedirects: true
  });
  if (response.getResponseCode() !== 200) throw new Error(kind + '_export_failed_' + response.getResponseCode());
  return response.getBlob();
}

/**
 * Build today's branded card, 1080x1080, and host it publicly.
 * Returns { ok, url, jpegUrl, fileId, warning }
 */
function buildBrandImage(post) {
  var presentation = null;
  var presentationId = '';
  var pageId = '';
  try {
    presentation = SlidesApp.create('GAHONSH post ' + post.dateKey + ' ' + new Date().getTime());
    presentationId = presentation.getId();

    // Apps Script cannot resize a slide page (there is no setPageWidth), so the
    // layout is written in fractions of the deck's own page size. The card then
    // fills the slide edge to edge whether the deck is 16:9 or 4:3, and the
    // export keeps that ratio - both are accepted by Instagram and Facebook.
    var W = presentation.getPageWidth();
    var H = presentation.getPageHeight();
    var slide = presentation.getSlides()[0];
    pageId = slide.getObjectId();
    slide.getPageElements().forEach(function (element) { element.remove(); });

    var px = function (f) { return f * W; };
    var py = function (f) { return f * H; };
    var accent = post.type === 'festival' ? BRAND.amber : BRAND.teal;
    var paper = post.type === 'festival' ? '#FFF8EC' : BRAND.bg;

    var bg = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, W, H);
    bg.getFill().setSolidFill(paper);
    bg.getBorder().setTransparent();

    var bar = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, W, py(0.035));
    bar.getFill().setSolidFill(accent);
    bar.getBorder().setTransparent();

    var footer = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, py(0.885), W, py(0.115));
    footer.getFill().setSolidFill(BRAND.navy);
    footer.getBorder().setTransparent();

    var mark = slide.insertTextBox(CONFIG.brand, px(0.055), py(0.075), px(0.5), py(0.10));
    mark.getText().setText(CONFIG.brand);
    mark.getText().getTextStyle().setFontSize(px(0.075)).setBold(true)
      .setForegroundColor(BRAND.teal).setFontFamily('Arial');

    var dateText = slide.insertTextBox(post.dateKey, px(0.60), py(0.085), px(0.34), py(0.07));
    dateText.getText().setText(post.dateKey);
    dateText.getText().getTextStyle().setFontSize(px(0.028)).setForegroundColor(BRAND.navy).setFontFamily('Arial');
    dateText.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.END);

    var headlineTop = 0.235;
    if (post.occasion) {
      var chipW = Math.min(px(0.62), px(0.16) + String(post.occasion).length * px(0.014));
      var chip = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, px(0.055), py(0.155), chipW, py(0.075));
      chip.getFill().setSolidFill(BRAND.amber);
      chip.getBorder().setTransparent();
      chip.getText().setText(String(post.occasion).toUpperCase());
      chip.getText().getTextStyle().setFontSize(px(0.024)).setBold(true)
        .setForegroundColor('#FFFFFF').setFontFamily('Arial');
      headlineTop = 0.30;
    }

    var headline = slide.insertTextBox(post.headline, px(0.055), py(headlineTop), px(0.89), py(0.34));
    headline.getText().setText(post.headline);
    var len = String(post.headline || '').length;
    var size = len > 90 ? 0.040 : len > 60 ? 0.048 : len > 40 ? 0.055 : 0.062;
    headline.getText().getTextStyle().setFontSize(px(size)).setBold(true)
      .setForegroundColor(BRAND.ink).setFontFamily('Arial');

    var rule = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, px(0.055), py(0.655), px(0.15), py(0.012));
    rule.getFill().setSolidFill(BRAND.amber);
    rule.getBorder().setTransparent();

    var proof = slide.insertTextBox(CONFIG.tagline, px(0.055), py(0.70), px(0.89), py(0.12));
    proof.getText().setText(CONFIG.tagline);
    proof.getText().getTextStyle().setFontSize(px(0.036)).setForegroundColor(BRAND.navy).setFontFamily('Arial');

    var site = slide.insertTextBox(CONFIG.website.replace('https://', ''), px(0.055), py(0.898), px(0.60), py(0.05));
    site.getText().setText(CONFIG.website.replace('https://', ''));
    site.getText().getTextStyle().setFontSize(px(0.042)).setBold(true)
      .setForegroundColor('#FFFFFF').setFontFamily('Arial');

    var cta = slide.insertTextBox('Websites  .  Web apps  .  APIs  .  Dashboards', px(0.055), py(0.945), px(0.89), py(0.04));
    cta.getText().setText('Websites  .  Web apps  .  APIs  .  Dashboards');
    cta.getText().getTextStyle().setFontSize(px(0.026)).setForegroundColor('#DCE5E2').setFontFamily('Arial');

    presentation.saveAndClose();

    var pngBlob = exportSlide_(presentationId, pageId, 'png');
    var jpegBlob = null;
    var jpegIsReal = false;
    try {
      jpegBlob = exportSlide_(presentationId, pageId, 'jpeg');
      jpegIsReal = String(jpegBlob.getContentType()).indexOf('jpeg') !== -1 || String(jpegBlob.getContentType()).indexOf('jpg') !== -1;
    } catch (err) {
      jpegBlob = pngBlob;
    }

    var hostError = '';
    var pngUrl = '';
    var jpegUrl = '';

    if (ghToken_()) {
      try {
        pngUrl = hostOnPages_(pngBlob.setName('gahonsh-' + post.dateKey + '.png'), 'gahonsh-' + post.dateKey + '.png', 'image/png');
        var name = jpegIsReal ? 'gahonsh-' + post.dateKey + '.jpg' : 'gahonsh-' + post.dateKey + '.png';
        jpegUrl = hostOnPages_(jpegBlob.setName(name), name, jpegIsReal ? 'image/jpeg' : 'image/png');
        waitForPublicUrl_(jpegUrl, 8, 10000);
      } catch (err) {
        hostError = String(err && err.message ? err.message : err);
      }
    } else {
      hostError = 'missing GITHUB_TOKEN (media host)';
    }

    // Drive is only a fallback so a missing GitHub token never loses the card.
    var fileId = '';
    try {
      var folder = getOrCreateFolder_(prop_('DRIVE_FOLDER', CONFIG.driveFolder));
      var file = folder.createFile(pngBlob);
      file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      fileId = file.getId();
    } catch (ignored) {}

    if (!jpegUrl && fileId) jpegUrl = 'https://lh3.googleusercontent.com/d/' + fileId;

    return {
      ok: !!jpegUrl,
      url: pngUrl || jpegUrl,
      imageUrl: jpegUrl,
      fileId: fileId,
      warning: hostError
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    if (presentationId) {
      try { DriveApp.getFileById(presentationId).setTrashed(true); } catch (ignored) {}
    }
  }
}

/**
 * Today's video, from the public manifest the free GitHub Action refreshes.
 * A stale manifest is treated as "no video" so YouTube never re-posts yesterday.
 */
var POOL_URL = 'https://gahonsh-blip.github.io/social/videos.json';

/**
 * The pool: eight pre-rendered evergreen Shorts committed to the Pages repo.
 * If the daily renderer has not run yet (or GitHub Actions is unavailable),
 * YouTube still gets a Short today instead of nothing. The report always says
 * whether the video was fresh or pooled, so nothing is pretended.
 */
function fetchVideoPool_(reason) {
  try {
    var res = UrlFetchApp.fetch(POOL_URL + '?v=' + new Date().getTime(), { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) return { ok: false, error: 'pool_http_' + res.getResponseCode() };
    var data = JSON.parse(res.getContentText());
    var videos = (data && data.videos) || [];
    if (!videos.length) return { ok: false, error: 'pool_empty' };
    var pick = videos[dayIndex_(new Date(), videos.length) % videos.length];
    return {
      ok: true,
      url: pick.video_url,
      title: '',
      description: '',
      fresh: false,
      source: 'pool#' + pick.id,
      note: 'using rotating brand Short (' + (reason || 'no fresh render') + ')'
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  }
}

function fetchVideoManifest_() {
  var url = CONFIG.videoManifestUrl + '?v=' + new Date().getTime();
  var reason = '';
  try {
    var res = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) {
      reason = 'manifest_http_' + res.getResponseCode();
    } else {
      var data = JSON.parse(res.getContentText());
      var today = dateKey_(new Date());
      if (!data || !data.video_url) {
        reason = 'manifest_incomplete';
      } else if (data.date && data.date !== today) {
        reason = 'stale_manifest_' + data.date;
      } else {
        return { ok: true, url: data.video_url, title: data.title || '', description: data.description || '', date: data.date || today, fresh: true, source: 'daily-render' };
      }
    }
  } catch (err) {
    reason = String(err && err.message ? err.message : err);
  }
  return fetchVideoPool_(reason);
}

/* ======================= publishers.gs ======================= */

/**
 * Publishing adapters. Each one is independent: if a channel is not configured
 * or a channel fails, the others still post and the failure is recorded.
 *
 * Free, no app review, works today:
 *   Blogger      - the blog already exists, only the blog id is needed
 *   Telegram     - bot token from @BotFather, free forever
 *   Bluesky      - free account + app password, no developer app needed
 *   Mastodon     - free account + access token, no review
 *   Dev.to       - free account + api key, article publishing
 *
 * Free account, but needs a developer app or paid tier:
 *   Facebook Page - Meta app with pages_manage_posts
 *   Instagram     - Meta app + business account + business verification
 *   LinkedIn      - approved LinkedIn app (w_member_social)
 *   X / Twitter   - free tier posts are possible, needs a developer app with
 *                   OAuth 1.0a user keys (an app-only bearer token cannot post)
 */

function enabled_(name, fallback) {
  return String(prop_(name, fallback || 'no')).toLowerCase() === 'yes';
}

/** UTF-8 byte length, needed for Bluesky link facets. */
function utf8Len_(text) {
  var bytes = Utilities.newBlob(String(text)).getBytes();
  return bytes.length;
}

/** Short text used by the size limited networks. */
function shortText_(post) {
  return post.headline + '\n\n' + CONFIG.website;
}

/** Full caption used by the roomier networks. */
function fullText_(post) {
  return post.caption + '\n\n' + post.hashtags;
}

// ---------------------------------------------------------------------------
// Cross-system duplicate guards.
// The old automation may still be running while this one takes over, so before
// posting, look at the Page's own recent posts. If today's headline is already
// there, report it instead of posting a second copy.
// ---------------------------------------------------------------------------

function graphGet_(path) {
  try {
    var res = UrlFetchApp.fetch(graphUrl_(path), { muteHttpExceptions: true, followRedirects: true });
    if (res.getResponseCode() !== 200) return null;
    return JSON.parse(res.getContentText());
  } catch (err) {
    return null;
  }
}

function sameDay_(isoString, dateKey) {
  if (!isoString) return false;
  try {
    return Utilities.formatDate(new Date(isoString), CONFIG.timezone, 'yyyy-MM-dd') === dateKey;
  } catch (err) {
    return String(isoString).slice(0, 10) === dateKey;
  }
}

function headlineSeen_(text, post) {
  var needle = String(post.headline || '').slice(0, 32).toLowerCase();
  return !!needle && String(text || '').toLowerCase().indexOf(needle) !== -1;
}

function facebookAlreadyPosted_(pageId, token, post) {
  if (String(prop_('SKIP_IF_ALREADY_POSTED', 'yes')).toLowerCase() !== 'yes') return null;
  var data = graphGet_(pageId + '/posts?fields=message,created_time&limit=10&access_token=' + encodeURIComponent(token));
  var items = (data && data.data) || [];
  for (var i = 0; i < items.length; i++) {
    if (sameDay_(items[i].created_time, post.dateKey) && headlineSeen_(items[i].message, post)) return items[i].id;
  }
  return null;
}

function instagramAlreadyPosted_(igId, token, post) {
  if (String(prop_('SKIP_IF_ALREADY_POSTED', 'yes')).toLowerCase() !== 'yes') return null;
  var data = graphGet_(igId + '/media?fields=caption,timestamp&limit=10&access_token=' + encodeURIComponent(token));
  var items = (data && data.data) || [];
  for (var i = 0; i < items.length; i++) {
    if (sameDay_(items[i].timestamp, post.dateKey) && headlineSeen_(items[i].caption, post)) return items[i].id;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Blogger
// ---------------------------------------------------------------------------

function publishBlogger_(post, imageUrl) {
  var blogId = prop_('BLOGGER_BLOG_ID', CONFIG.defaultBlogId || '');
  if (!blogId) return { channel: 'blogger', ok: false, skipped: true, error: 'missing BLOGGER_BLOG_ID' };
  try {
    var body = {
      kind: 'blogger#post',
      title: post.title,
      content: postHtml_(post, imageUrl),
      labels: ['GAHONSH', post.type].concat(post.hashtags.split(' ').map(function (t) { return t.replace('#', ''); }))
    };
    var response = UrlFetchApp.fetch('https://www.googleapis.com/blogger/v3/blogs/' + blogId + '/posts/', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      var data = JSON.parse(response.getContentText());
      return { channel: 'blogger', ok: true, id: data.id, url: data.url };
    }
    // Apps Script cannot request a scope from code, so a missing blogger scope
    // only shows up as a 403 here. Say what to do instead of printing the body.
    if (code === 401 || code === 403) {
      return {
        channel: 'blogger',
        ok: false,
        error: 'http_' + code + ': the blogger scope is not granted. Paste appsscript.json ' +
          '(Project Settings -> "Show appsscript.json in editor") or run any function once and press ' +
          'Authorize, then retry. ' + response.getContentText().slice(0, 120)
      };
    }
    return { channel: 'blogger', ok: false, error: 'http_' + code + ': ' + response.getContentText().slice(0, 160) };
  } catch (err) {
    return { channel: 'blogger', ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Telegram
// ---------------------------------------------------------------------------

function publishTelegram_(post, imageUrl) {
  var token = prop_('TELEGRAM_BOT_TOKEN');
  var chatId = prop_('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return { channel: 'telegram', ok: false, skipped: true, error: 'missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID' };
  try {
    var text = fullText_(post);
    var endpoint = imageUrl
      ? 'https://api.telegram.org/bot' + token + '/sendPhoto'
      : 'https://api.telegram.org/bot' + token + '/sendMessage';
    var payload = imageUrl
      ? { chat_id: chatId, photo: imageUrl, caption: text.slice(0, 1020) }
      : { chat_id: chatId, text: text, disable_web_page_preview: false };
    var response = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      payload: payload,
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code === 200) {
      var data = JSON.parse(response.getContentText());
      return { channel: 'telegram', ok: true, id: data.result && data.result.message_id };
    }
    // A failed photo (bad url) must still deliver the text.
    if (imageUrl) {
      var retry = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'post',
        payload: { chat_id: chatId, text: text },
        muteHttpExceptions: true
      });
      if (retry.getResponseCode() === 200) return { channel: 'telegram', ok: true, note: 'text_only_after_photo_failure' };
    }
    return { channel: 'telegram', ok: false, error: 'http_' + code + ': ' + response.getContentText().slice(0, 120) };
  } catch (err) {
    return { channel: 'telegram', ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Bluesky (free, no developer app, no review)
// ---------------------------------------------------------------------------

function bskySession_(handle, appPassword) {
  var response = UrlFetchApp.fetch('https://bsky.social/xrpc/com.atproto.server.createSession', {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify({ identifier: handle, password: appPassword }),
    muteHttpExceptions: true
  });
  if (response.getResponseCode() !== 200) {
    throw new Error('bluesky_login_http_' + response.getResponseCode() + ': ' + response.getContentText().slice(0, 120));
  }
  return JSON.parse(response.getContentText());
}

function publishBluesky_(post, imageUrl) {
  var handle = propAny_(['BLUESKY_HANDLE', 'BSKY_HANDLE']);
  var appPassword = propAny_(['BLUESKY_APP_PASSWORD', 'BSKY_APP_PASSWORD']);
  if (!handle || !appPassword) return { channel: 'bluesky', ok: false, skipped: true, error: 'missing BLUESKY_HANDLE or BLUESKY_APP_PASSWORD' };
  try {
    var session = bskySession_(handle, appPassword);
    var text = (shortText_(post) + '\n' + post.hashtags).slice(0, 290);
    var record = { $type: 'app.bsky.feed.post', text: text, createdAt: new Date().toISOString() };

    // Make the website clickable inside the post.
    var start = utf8Len_(text.slice(0, text.indexOf(CONFIG.website)));
    var end = start + utf8Len_(CONFIG.website);
    if (text.indexOf(CONFIG.website) !== -1) {
      record.facets = [{
        index: { byteStart: start, byteEnd: end },
        features: [{ $type: 'app.bsky.richtext.facet#link', uri: CONFIG.website }]
      }];
    }

    if (imageUrl) {
      try {
        var blob = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true }).getBlob();
        var upload = UrlFetchApp.fetch('https://bsky.social/xrpc/com.atproto.repo.uploadBlob', {
          method: 'post',
          contentType: blob.getContentType() || 'image/png',
          headers: { Authorization: 'Bearer ' + session.accessJwt },
          payload: blob,
          muteHttpExceptions: true
        });
        if (upload.getResponseCode() === 200) {
          var ref = JSON.parse(upload.getContentText()).blob;
          record.embed = { $type: 'app.bsky.embed.images', images: [{ image: ref, alt: post.headline }] };
        }
      } catch (imgErr) {
        // Image is optional: post the text anyway.
      }
    }

    var response = UrlFetchApp.fetch('https://bsky.social/xrpc/com.atproto.repo.createRecord', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + session.accessJwt },
      payload: JSON.stringify({ repo: session.did, collection: 'app.bsky.feed.post', record: record }),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code === 200) {
      var data = JSON.parse(response.getContentText());
      return { channel: 'bluesky', ok: true, id: data.uri, url: 'https://bsky.app/profile/' + handle };
    }
    return { channel: 'bluesky', ok: false, error: 'http_' + code + ': ' + response.getContentText().slice(0, 160) };
  } catch (err) {
    return { channel: 'bluesky', ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Mastodon (free, no developer app, no review)
// ---------------------------------------------------------------------------

function publishMastodon_(post, imageUrl) {
  var instance = prop_('MASTODON_INSTANCE');
  var token = propAny_(['MASTODON_ACCESS_TOKEN', 'MASTODON_TOKEN']);
  if (!instance || !token) return { channel: 'mastodon', ok: false, skipped: true, error: 'missing MASTODON_INSTANCE or MASTODON_ACCESS_TOKEN' };
  try {
    var base = instance.replace(/\/+$/, '');
    if (base.indexOf('https://') !== 0) base = 'https://' + base;
    var mediaIds = [];
    if (imageUrl) {
      try {
        var blob = UrlFetchApp.fetch(imageUrl, { muteHttpExceptions: true }).getBlob();
        var media = UrlFetchApp.fetch(base + '/api/v2/media', {
          method: 'post',
          headers: { Authorization: 'Bearer ' + token },
          payload: { file: blob, description: post.headline },
          muteHttpExceptions: true
        });
        if (media.getResponseCode() < 300) mediaIds.push(JSON.parse(media.getContentText()).id);
      } catch (imgErr) {
        // Text only is fine.
      }
    }
    var status = fullText_(post);
    var response = UrlFetchApp.fetch(base + '/api/v1/statuses', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + token },
      payload: JSON.stringify({ status: status.slice(0, 480), visibility: 'public', media_ids: mediaIds }),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      var data = JSON.parse(response.getContentText());
      return { channel: 'mastodon', ok: true, id: data.id, url: data.url };
    }
    return { channel: 'mastodon', ok: false, error: 'http_' + code + ': ' + response.getContentText().slice(0, 160) };
  } catch (err) {
    return { channel: 'mastodon', ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Dev.to (free article publishing, good for search traffic)
// ---------------------------------------------------------------------------

function publishDevTo_(post, imageUrl) {
  var key = prop_('DEVTO_API_KEY');
  if (!key) return { channel: 'devto', ok: false, skipped: true, error: 'missing DEVTO_API_KEY' };
  try {
    var body = post.caption + '\n\n' +
      '**Work with us:** ' + CONFIG.website + '\n\n' +
      (imageUrl ? '![GAHONSH](' + imageUrl + ')\n\n' : '') +
      post.hashtags;
    var response = UrlFetchApp.fetch('https://dev.to/api/articles', {
      method: 'post',
      contentType: 'application/json',
      headers: { 'api-key': key },
      payload: JSON.stringify({
        article: {
          title: post.title,
          published: true,
          body_markdown: body,
          tags: post.hashtags.split(' ').map(function (t) { return t.replace('#', '').toLowerCase(); }).slice(0, 4),
          canonical_url: CONFIG.website,
          cover_image: imageUrl || undefined
        }
      }),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      var data = JSON.parse(response.getContentText());
      return { channel: 'devto', ok: true, id: data.id, url: data.url };
    }
    return { channel: 'devto', ok: false, error: 'http_' + code + ': ' + response.getContentText().slice(0, 160) };
  } catch (err) {
    return { channel: 'devto', ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Facebook Page
// ---------------------------------------------------------------------------

function publishFacebook_(post, imageUrl) {
  var pageId = propAny_(['META_PAGE_ID', 'FACEBOOK_PAGE_ID']);
  var token = propAny_(['META_PAGE_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN']);
  if (!pageId || !token) return { channel: 'facebook', ok: false, skipped: true, error: 'missing page id or token' };
  var alreadyFb = facebookAlreadyPosted_(pageId, token, post);
  if (alreadyFb) return { channel: 'facebook', ok: true, skipped: true, id: alreadyFb, note: 'already posted today on the page' };
  try {
    var endpoint = imageUrl
      ? graphUrl_(pageId + '/photos')
      : graphUrl_(pageId + '/feed');
    var payload = imageUrl
      ? { url: imageUrl, caption: fullText_(post), access_token: token }
      : { message: fullText_(post), link: CONFIG.website, access_token: token };
    var response = UrlFetchApp.fetch(endpoint, { method: 'post', payload: payload, muteHttpExceptions: true });
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      var data = JSON.parse(response.getContentText());
      return { channel: 'facebook', ok: true, id: data.id || data.post_id };
    }
    return { channel: 'facebook', ok: false, error: 'http_' + code + ': ' + response.getContentText().slice(0, 160) };
  } catch (err) {
    return { channel: 'facebook', ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// Instagram Business
// ---------------------------------------------------------------------------

function publishInstagram_(post, imageUrl) {
  var igId = propAny_(['META_IG_ID', 'INSTAGRAM_BUSINESS_ACCOUNT_ID']);
  var token = propAny_(['META_PAGE_TOKEN', 'INSTAGRAM_ACCESS_TOKEN']);
  if (!igId || !token) return { channel: 'instagram', ok: false, skipped: true, error: 'missing instagram ids' };
  if (!imageUrl) return { channel: 'instagram', ok: false, skipped: true, error: 'instagram requires an image url' };
  var alreadyIg = instagramAlreadyPosted_(igId, token, post);
  if (alreadyIg) return { channel: 'instagram', ok: true, skipped: true, id: alreadyIg, note: 'already posted today on instagram' };
  try {
    var create = UrlFetchApp.fetch(graphUrl_(igId + '/media'), {
      method: 'post',
      payload: { image_url: imageUrl, caption: fullText_(post), access_token: token },
      muteHttpExceptions: true
    });
    if (create.getResponseCode() >= 300) {
      return { channel: 'instagram', ok: false, error: 'container_http_' + create.getResponseCode() + ': ' + create.getContentText().slice(0, 120) };
    }
    var creationId = JSON.parse(create.getContentText()).id;
    var publish = UrlFetchApp.fetch(graphUrl_(igId + '/media_publish'), {
      method: 'post',
      payload: { creation_id: creationId, access_token: token },
      muteHttpExceptions: true
    });
    if (publish.getResponseCode() >= 300) {
      return { channel: 'instagram', ok: false, error: 'publish_http_' + publish.getResponseCode() };
    }
    return { channel: 'instagram', ok: true, id: JSON.parse(publish.getContentText()).id };
  } catch (err) {
    return { channel: 'instagram', ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// LinkedIn (current /rest/posts endpoint, ugcPosts as fallback)
// ---------------------------------------------------------------------------

function publishLinkedIn_(post, imageUrl) {
  var token = prop_('LINKEDIN_ACCESS_TOKEN');
  var author = prop_('LINKEDIN_AUTHOR_URN');
  if (!token || !author) return { channel: 'linkedin', ok: false, skipped: true, error: 'missing linkedin token or author urn' };
  var headers = {
    Authorization: 'Bearer ' + token,
    'LinkedIn-Version': linkedinVersion_(),
    'X-Restli-Protocol-Version': '2.0.0'
  };
  var modern = {
    author: author,
    commentary: fullText_(post).slice(0, 2900),
    visibility: 'PUBLIC',
    distribution: { feedDistribution: 'MAIN_FEED', targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { article: { source: CONFIG.website, title: post.headline, description: post.title } },
    lifecycleState: 'PUBLISHED',
    isReshareDisabledByAuthor: false
  };
  try {
    var response = UrlFetchApp.fetch('https://api.linkedin.com/rest/posts', {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(modern),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      return { channel: 'linkedin', ok: true, id: response.getHeaders()['x-restli-id'] || null };
    }
    // Older apps still accept the classic endpoint.
    var legacy = {
      author: author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: fullText_(post).slice(0, 2900) },
          shareMediaCategory: 'ARTICLE',
          media: [{ status: 'READY', originalUrl: CONFIG.website }]
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    };
    var old = UrlFetchApp.fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'post',
      contentType: 'application/json',
      headers: headers,
      payload: JSON.stringify(legacy),
      muteHttpExceptions: true
    });
    if (old.getResponseCode() >= 200 && old.getResponseCode() < 300) {
      return { channel: 'linkedin', ok: true, id: old.getHeaders()['x-restli-id'] || null, note: 'legacy_endpoint' };
    }
    return { channel: 'linkedin', ok: false, error: 'http_' + code + ': ' + response.getContentText().slice(0, 140) };
  } catch (err) {
    return { channel: 'linkedin', ok: false, error: String(err) };
  }
}

// ---------------------------------------------------------------------------
// X / Twitter. An app-only bearer token can never create a post, so this signs
// the request with OAuth 1.0a user credentials, which is what the free tier
// needs. Signing is deterministic and covered by the tests.
// ---------------------------------------------------------------------------

function oauthPercentEncode_(value) {
  return encodeURIComponent(String(value))
    .replace(/[!'()*]/g, function (c) { return '%' + c.charCodeAt(0).toString(16).toUpperCase(); });
}

function oauth1Header_(method, url, consumerKey, consumerSecret, token, tokenSecret) {
  var params = {
    oauth_consumer_key: consumerKey,
    oauth_nonce: (function () {
      var chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
      var out = '';
      for (var i = 0; i < 32; i++) out += chars.charAt(Math.floor(Math.random() * chars.length));
      return out;
    })(),
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(Math.floor(new Date().getTime() / 1000)),
    oauth_token: token,
    oauth_version: '1.0'
  };
  var pairs = Object.keys(params).sort().map(function (key) {
    return oauthPercentEncode_(key) + '=' + oauthPercentEncode_(params[key]);
  });
  var baseString = method.toUpperCase() + '&' + oauthPercentEncode_(url) + '&' + oauthPercentEncode_(pairs.join('&'));
  var signingKey = oauthPercentEncode_(consumerSecret) + '&' + oauthPercentEncode_(tokenSecret);
  var signature = Utilities.base64Encode(
    Utilities.computeHmacSignature(Utilities.MacAlgorithm.HMAC_SHA_1, baseString, signingKey)
  );
  var header = pairs.concat(['oauth_signature=' + oauthPercentEncode_(signature)]).join(', ');
  return 'OAuth ' + header;
}

function publishX_(post) {
  var key = propAny_(['X_API_KEY', 'X_CONSUMER_KEY']);
  var secret = propAny_(['X_API_SECRET', 'X_CONSUMER_SECRET']);
  var token = propAny_(['X_ACCESS_TOKEN']);
  var tokenSecret = propAny_(['X_ACCESS_SECRET', 'X_ACCESS_TOKEN_SECRET']);
  if (!key || !secret || !token || !tokenSecret) {
    return { channel: 'x', ok: false, skipped: true, error: 'missing OAuth 1.0a user keys (X_CONSUMER_KEY, X_CONSUMER_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET)' };
  }
  try {
    var url = 'https://api.twitter.com/2/tweets';
    var text = (shortText_(post)).slice(0, 275);
    var response = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: oauth1Header_('POST', url, key, secret, token, tokenSecret) },
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      return { channel: 'x', ok: true, id: JSON.parse(response.getContentText()).data.id };
    }
    return { channel: 'x', ok: false, error: 'http_' + code + ': ' + response.getContentText().slice(0, 160) };
  } catch (err) {
    return { channel: 'x', ok: false, error: String(err) };
  }
}


// ---------------------------------------------------------------------------
// YouTube Shorts (YouTube Data API v3 through the built-in advanced service).
// The video itself is rendered by the free GitHub Action and fetched from the
// public manifest, because Apps Script cannot encode video and every paid or
// "free trial" video API eventually asks for a card.
// ---------------------------------------------------------------------------

function publishYouTube_(post, imageUrl, media) {
  if (typeof YouTube === 'undefined' || !YouTube.Videos) {
    return { channel: 'youtube', ok: false, skipped: true, error: 'advanced service not added: Services (+) -> YouTube Data API v3' };
  }
  var video = media && media.video;
  if (!video || !video.url) {
    return { channel: 'youtube', ok: false, skipped: true, error: 'no video for ' + post.dateKey + ' (manifest empty or stale)' };
  }
  try {
    var download = UrlFetchApp.fetch(video.url, { muteHttpExceptions: true, followRedirects: true });
    if (download.getResponseCode() !== 200) {
      return { channel: 'youtube', ok: false, error: 'video_download_http_' + download.getResponseCode() };
    }
    var blob = download.getBlob();
    if (blob.getBytes().length < 20000) {
      return { channel: 'youtube', ok: false, error: 'video_too_small_' + blob.getBytes().length };
    }
    blob.setContentType('video/mp4');

    var tags = String(post.hashtags || '').split(/\s+/)
      .filter(function (tag) { return tag.charAt(0) === '#'; })
      .map(function (tag) { return tag.slice(1); })
      .slice(0, 12);

    var resource = {
      snippet: {
        title: truncate_(video.title || post.headline, 95),
        description: truncate_((video.description || post.caption) + '\n\n' + CONFIG.website, 4900),
        tags: tags,
        categoryId: '22'
      },
      status: { privacyStatus: 'public', embeddable: true, selfDeclaredMadeForKids: false }
    };

    var created = YouTube.Videos.insert(resource, 'snippet,status', blob);
    var id = created.id;

    // An unaudited Google project can be forced to private. Verify, do not assume.
    var privacy = '';
    try {
      var check = YouTube.Videos.list('status', { id: id });
      if (check && check.items && check.items.length) privacy = check.items[0].status.privacyStatus;
    } catch (ignored) {}

    return {
      channel: 'youtube',
      ok: true,
      id: id,
      url: 'https://www.youtube.com/shorts/' + id,
      note: privacy && privacy !== 'public' ? 'uploaded but privacy=' + privacy + ' (project needs YouTube API audit)' : 'public'
    };
  } catch (err) {
    return { channel: 'youtube', ok: false, error: String(err && err.message ? err.message : err) };
  }
}

// ---------------------------------------------------------------------------
// Channel registry
// ---------------------------------------------------------------------------

/** The YouTube Data API v3 advanced service, if the owner added it. */
function hasYouTubeService_() {
  return typeof YouTube !== 'undefined' && !!YouTube.Videos;
}

/** Every channel, whether it can run right now, and what it still needs. */
function channelMatrix() {
  var rows = [
    { name: 'blogger', enabled: true, needs: ['blogger OAuth scope (paste appsscript.json or Authorize once)'] },
    {
      name: 'youtube',
      enabled: hasYouTubeService_(),
      needs: ['Services (+) -> YouTube Data API v3', 'fresh entry in the video manifest'],
      why: 'needs the YouTube Data API v3 service'
    },
    { name: 'telegram', enabled: hasTelegram_(), needs: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] },
    { name: 'facebook', enabled: hasFacebook_(), needs: ['META_PAGE_ID', 'META_PAGE_TOKEN'] },
    { name: 'instagram', enabled: hasInstagram_(), needs: ['META_IG_ID', 'META_PAGE_TOKEN'] },
    { name: 'linkedin', enabled: hasLinkedIn_(), needs: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_AUTHOR_URN'] },
    { name: 'x', enabled: hasX_(), needs: ['X_API_KEY', 'X_API_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_SECRET'] },
    { name: 'bluesky', enabled: hasBluesky_(), needs: ['BSKY_HANDLE', 'BSKY_APP_PASSWORD'] },
    { name: 'mastodon', enabled: hasMastodon_(), needs: ['MASTODON_INSTANCE', 'MASTODON_TOKEN'] },
    { name: 'devto', enabled: hasDevTo_(), needs: ['DEVTO_API_KEY'] }
  ];
  return rows.map(function (row) {
    var off = channelDisabled_(row.name);
    var on = row.enabled && !off;
    return {
      channel: row.name,
      enabled: on,
      ready: on,
      needs: off ? [] : row.needs,
      status: off
        ? 'switched off (DISABLE_' + row.name.toUpperCase() + '=yes)'
        : (on ? 'on' : (row.why || 'waiting for keys'))
    };
  });
}

/** Which channels to attempt today, in order. Every one is failure isolated. */
function adapters_() {
  var all = [
    { name: 'blogger', enabled: true, run: publishBlogger_, needsImage: false },
    { name: 'telegram', enabled: hasTelegram_(), run: publishTelegram_, needsImage: false },
    { name: 'facebook', enabled: hasFacebook_(), run: publishFacebook_, needsImage: false },
    { name: 'instagram', enabled: hasInstagram_(), run: publishInstagram_, needsImage: true },
    { name: 'linkedin', enabled: hasLinkedIn_(), run: publishLinkedIn_, needsImage: false },
    { name: 'x', enabled: hasX_(), run: publishX_, needsImage: false },
    { name: 'bluesky', enabled: hasBluesky_(), run: publishBluesky_, needsImage: false },
    { name: 'mastodon', enabled: hasMastodon_(), run: publishMastodon_, needsImage: false },
    { name: 'devto', enabled: hasDevTo_(), run: publishDevTo_, needsImage: false },
    // Last on purpose: downloading and uploading a video is the slowest step and
    // the one most likely to hit the 6 minute Apps Script execution limit. If the
    // run is cut short, only YouTube is lost, not the text channels.
    { name: 'youtube', enabled: true, run: publishYouTube_, needsImage: false, needsVideo: true }
  ];
  return all.filter(function (adapter) { return adapter.enabled && !channelDisabled_(adapter.name); });
}

/**
 * One free retry, only for errors that are worth retrying. A 400 or a 401 is a
 * configuration problem and retrying it just wastes the quota.
 */
function withRetry_(fn) {
  var first = fn();
  if (!first || first.ok || first.skipped) return first;
  var message = String(first.error || first.note || '');
  if (!/http_(429|500|502|503|504)|timeout|timed out|try again|temporar/i.test(message)) return first;
  sleepMs_(3000);
  var second = fn();
  if (second) second.retried = true;
  return second || first;
}

/**
 * Publish to every enabled channel. A thrown error inside one adapter can never
 * stop the others, and every result carries the channel name so the log is useful.
 */
function publishAll_(post, imageUrl, media) {
  var results = [];
  adapters_().forEach(function (adapter) {
    if (adapter.needsImage && !imageUrl) {
      results.push({ channel: adapter.name, ok: false, skipped: true, error: 'needs a public image url' });
      return;
    }
    if (adapter.needsVideo && !(media && media.video && media.video.url)) {
      results.push({ channel: adapter.name, ok: false, skipped: true, error: 'no video for today' });
      return;
    }
    var result;
    try {
      result = withRetry_(function () { return adapter.run(post, imageUrl, media); });
    } catch (err) {
      result = { channel: adapter.name, ok: false, error: String(err && err.message ? err.message : err) };
    }
    if (!result) result = { channel: adapter.name, ok: false, error: 'adapter returned nothing' };
    if (!result.channel) result.channel = adapter.name;
    results.push(result);
  });
  return results;
}

/* ======================= code.gs ======================= */

/**
 * GAHONSH social autopilot - entry points.
 *
 * Run these from the Apps Script editor:
 *   setupAll()          one-time setup: holiday calendar + daily trigger + log sheet
 *   channelCheck()      what is on, what is waiting for a key (publishes nothing)
 *   tokenHealth()       are the expiring tokens still valid (one GET per service)
 *   dryRun()            builds today's post, card and video links, publishes nothing
 *   runDailyPost()      publishes today's post everywhere, exactly once per channel
 *   testAllChannels()   one clearly marked test post to every configured channel
 *   resetToday()        clears today's "already done" marks so a fixed channel retries
 */

/** Per day, per channel idempotency marker. */
function doneKey_(dateKey, channel) {
  return 'done_' + dateKey + '_' + channel;
}

/** How many times a channel has been attempted today (stops a broken key from hammering). */
function triesKey_(dateKey, channel) {
  return 'tries_' + dateKey + '_' + channel;
}

/** Kept for older installs that only used the day level marker. */
function postedKey_(key) {
  return 'posted_' + key;
}

/**
 * Drop per-day markers older than STATE_KEEP_DAYS.
 *
 * Script Properties hold 500 KB for the whole project. Ten channels a day write
 * three keys each, so the quota fills in a few years and then every setProperty
 * throws - the daily run dies with no obvious cause. Keeping a month of history
 * is enough for resetToday and for reading yesterday's status.
 */
function pruneStateKeys_(props, keepDays) {
  var keep = Number(keepDays || prop_('STATE_KEEP_DAYS', '30'));
  var cutoff = dateKey_(new Date(new Date().getTime() - keep * 86400000));
  var removed = 0;
  var all = props.getProperties();
  Object.keys(all).forEach(function (name) {
    var match = name.match(/^(?:done|tries)_(\d{4}-\d{2}-\d{2})_/) || name.match(/^posted_(\d{4}-\d{2}-\d{2})$/);
    if (!match) return;
    if (match[1] < cutoff) {
      props.deleteProperty(name);
      removed++;
    }
  });
  return removed;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

function installTriggers() {
  var existing = ScriptApp.getProjectTriggers();
  existing.forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'runDailyPost') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('runDailyPost')
    .timeBased()
    .atHour(Number(prop_('POST_HOUR', '8')))
    .nearMinute(Number(prop_('POST_MINUTE', '30')))
    .everyDays(1)
    .inTimezone(CONFIG.timezone)
    .create();
  return 'daily trigger set for ' + prop_('POST_HOUR', '8') + ':' + prop_('POST_MINUTE', '30') + ' ' + CONFIG.timezone;
}

/**
 * One-time setup. Safe to run again at any time.
 */
function setupAll() {
  var report = { at: new Date().toISOString() };

  report.calendar = ensureHolidayCalendar_();
  try { report.logSheet = getLogSheet_().getParent().getUrl(); } catch (err) { report.logSheet = String(err); }
  try { report.trigger = installTriggers(); } catch (err) { report.trigger = 'failed: ' + err; }
  report.channels = channelMatrix();

  var on = report.channels.filter(function (row) { return row.ready; }).map(function (row) { return row.channel; });
  var waiting = report.channels.filter(function (row) { return !row.ready; }).map(function (row) { return row.channel; });
  report.summary = 'live now: ' + (on.join(', ') || 'none') + ' | waiting for keys: ' + (waiting.join(', ') || 'none');

  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * Check the credentials that expire without warning.
 *
 * Meta long-lived tokens last about 60 days, LinkedIn tokens 60 days, GitHub
 * personal access tokens expire on their own schedule, and a revoked bot token
 * simply stops working. None of that shows up until the 08:30 run, so this
 * function answers "is today going to work?" with one cheap GET per service.
 */
function tokenHealth() {
  var checks = [];

  function probe(channel, fn) {
    try {
      checks.push(fn());
    } catch (err) {
      checks.push({ channel: channel, ok: false, detail: String(err && err.message ? err.message : err) });
    }
  }

  probe('github', function () {
    var token = ghToken_();
    if (!token) return { channel: 'github', ok: false, detail: 'missing GITHUB_TOKEN (the card cannot be hosted)' };
    var repo = CONFIG.mediaRepo;
    var res = UrlFetchApp.fetch('https://api.github.com/repos/' + repo.owner + '/' + repo.repo, {
      headers: { Authorization: 'Bearer ' + token, 'User-Agent': 'gahonsh-autopilot', Accept: 'application/vnd.github+json' },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    return {
      channel: 'github',
      ok: code === 200,
      detail: code === 200 ? 'token works' : 'http_' + code + ' - regenerate the token, media hosting is down'
    };
  });

  probe('meta', function () {
    var token = propAny_(['META_PAGE_TOKEN', 'FACEBOOK_PAGE_ACCESS_TOKEN']);
    if (!token) return { channel: 'meta', ok: false, detail: 'missing META_PAGE_TOKEN' };
    var res = UrlFetchApp.fetch(graphUrl_('me?fields=id,name'), {
      headers: { Authorization: 'Bearer ' + token },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    return {
      channel: 'meta',
      ok: code === 200,
      detail: code === 200 ? 'page token works' : 'http_' + code + ' - long-lived tokens last about 60 days, generate a new one'
    };
  });

  probe('linkedin', function () {
    var token = prop_('LINKEDIN_ACCESS_TOKEN');
    if (!token) return { channel: 'linkedin', ok: false, detail: 'missing LINKEDIN_ACCESS_TOKEN' };
    var res = UrlFetchApp.fetch('https://api.linkedin.com/v2/userinfo', {
      headers: { Authorization: 'Bearer ' + token, 'LinkedIn-Version': linkedinVersion_() },
      muteHttpExceptions: true
    });
    var code = res.getResponseCode();
    return {
      channel: 'linkedin',
      ok: code === 200,
      detail: code === 200 ? 'token works' : 'http_' + code + ' - token expired or version ' + linkedinVersion_() + ' sunset'
    };
  });

  probe('telegram', function () {
    var token = prop_('TELEGRAM_BOT_TOKEN');
    if (!token) return { channel: 'telegram', ok: false, detail: 'missing TELEGRAM_BOT_TOKEN' };
    var res = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/getMe', { muteHttpExceptions: true });
    var code = res.getResponseCode();
    return { channel: 'telegram', ok: code === 200, detail: code === 200 ? 'bot works' : 'http_' + code };
  });

  probe('youtube', function () {
    var ready = hasYouTubeService_();
    return {
      channel: 'youtube',
      ok: ready,
      detail: ready ? 'service added' : 'Services (+) -> YouTube Data API v3'
    };
  });

  var problems = checks.filter(function (c) { return !c.ok; }).map(function (c) { return c.channel + ': ' + c.detail; });
  var report = { at: new Date().toISOString(), ok: problems.length === 0, checks: checks, problems: problems };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

// ---------------------------------------------------------------------------
// Logging
// ---------------------------------------------------------------------------
function getLogSheet_() {
  var props = PropertiesService.getScriptProperties();
  var sheetId = props.getProperty('POSTLOG_SHEET_ID');
  var spreadsheet = null;
  if (sheetId) {
    try { spreadsheet = SpreadsheetApp.openById(sheetId); } catch (err) { spreadsheet = null; }
  }
  if (!spreadsheet) {
    spreadsheet = SpreadsheetApp.create(CONFIG.logSheetName);
    props.setProperty('POSTLOG_SHEET_ID', spreadsheet.getId());
  }
  var sheet = spreadsheet.getSheetByName(CONFIG.logTabName);
  if (!sheet) {
    sheet = spreadsheet.insertSheet(CONFIG.logTabName);
    sheet.appendRow(['timestamp', 'date', 'channel', 'status', 'headline', 'id_or_url', 'detail']);
  }
  return sheet;
}

function logRow_(entry) {
  try {
    getLogSheet_().appendRow([
      new Date(),
      entry.dateKey || '',
      entry.channel || '',
      entry.status || '',
      entry.headline || '',
      entry.idOrUrl || '',
      truncate_(entry.detail || '', 600)
    ]);
  } catch (err) {
    Logger.log('log_failed: ' + err);
  }
}

// ---------------------------------------------------------------------------
// Media
// ---------------------------------------------------------------------------

/**
 * Build the card and pick up today's video. Only the parts that are needed are
 * built, so a text only day never pays for a slide export.
 */
function prepareMedia_(post, pending) {
  var needsImage = pending.some(function (adapter) { return adapter.needsImage || adapter.name === 'blogger' || adapter.name === 'telegram'; });
  var needsVideo = pending.some(function (adapter) { return adapter.needsVideo; });

  var image = { ok: false, skipped: true };
  if (needsImage && String(prop_('PUBLISH_IMAGE', 'yes')).toLowerCase() === 'yes') {
    image = buildBrandImage(post);
  }

  var video = { ok: false, skipped: true };
  if (needsVideo) video = fetchVideoManifest_();

  var imageUrl = post.imageUrl || image.imageUrl || image.url || '';
  if (!imageUrl) {
    var fallbackCard = prop_('FALLBACK_CARD_URL', CONFIG.fallbackCardUrl || '');
    if (fallbackCard) {
      imageUrl = fallbackCard;
      image.fallback = true;
      image.fallbackUrl = fallbackCard;
    }
  }

  return {
    image: image,
    imageUrl: imageUrl,
    video: video.ok ? video : null,
    videoStatus: video.ok ? 'ready' : (video.error || 'not requested')
  };
}

// ---------------------------------------------------------------------------
// Daily run
// ---------------------------------------------------------------------------

/**
 * Publish today's post to every configured channel.
 *
 * Idempotent per channel: a channel that already succeeded today is skipped, so
 * running this twice (trigger plus a manual run, or a retry after fixing a key)
 * can never double post anything.
 */
function runDailyPost(options) {
  var opts = options || {};
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return { ok: false, error: 'another run is in progress' };
  }
  try {
    var now = new Date();
    var key = dateKey_(now);
    var props = PropertiesService.getScriptProperties();
    var post = buildDailyPost(now);

    var adapters = adapters_();
    var maxTries = Number(prop_('MAX_TRIES_PER_DAY', '3'));
    var pending = adapters.filter(function (adapter) {
      if (opts.force === true) return true;
      if (props.getProperty(doneKey_(key, adapter.name))) return false;
      return Number(props.getProperty(triesKey_(key, adapter.name)) || '0') < maxTries;
    });

    if (!pending.length) {
      return { ok: true, skipped: true, reason: 'all_channels_done_for_today', dateKey: key };
    }

    var media = prepareMedia_(post, pending);
    var results = [];

    pending.forEach(function (adapter) {
      if (adapter.needsImage && !media.imageUrl) {
        results.push({ channel: adapter.name, ok: false, skipped: true, error: 'no public image url' });
        return;
      }
      if (adapter.needsVideo && !media.video) {
        results.push({ channel: adapter.name, ok: false, skipped: true, error: 'video: ' + media.videoStatus });
        return;
      }
      var result;
      try {
        result = withRetry_(function () { return adapter.run(post, media.imageUrl, media); });
      } catch (err) {
        result = { channel: adapter.name, ok: false, error: String(err && err.message ? err.message : err) };
      }
      if (!result) result = { channel: adapter.name, ok: false, error: 'no result' };
      if (!result.channel) result.channel = adapter.name;

      var tries = Number(props.getProperty(triesKey_(key, adapter.name)) || '0') + 1;
      props.setProperty(triesKey_(key, adapter.name), String(tries));

      if (result.ok) props.setProperty(doneKey_(key, adapter.name), new Date().toISOString());
      if (result.skipped && !result.error) result.error = 'skipped';
      results.push(result);

      logRow_({
        dateKey: key,
        channel: result.channel,
        status: result.ok ? 'ok' : (result.skipped ? 'skipped' : 'failed'),
        headline: post.headline,
        idOrUrl: result.url || result.id || '',
        detail: result.error || result.note || ''
      });
    });

    // One summary row so the sheet reads like a diary, not a stack of noise.
    var okChannels = results.filter(function (r) { return r.ok; }).map(function (r) { return r.channel; });
    logRow_({
      dateKey: key,
      channel: 'SUMMARY',
      status: okChannels.length ? 'posted' : 'nothing_posted',
      headline: post.headline,
      idOrUrl: okChannels.join(','),
      detail: 'occasion=' + (post.occasion || '-') + ' source=' + post.source + ' video=' + media.videoStatus
    });

    props.setProperty(postedKey_(key), JSON.stringify({ at: now.toISOString(), channels: okChannels }));
    try { pruneStateKeys_(props); } catch (ignored) {}

    var onlySkips = okChannels.length === 0;
    return {
      ok: okChannels.length > 0,
      skipped: onlySkips,
      reason: onlySkips ? 'nothing_posted_only_skips' : '',
      dateKey: key,
      headline: post.headline,
      type: post.type,
      occasion: post.occasion,
      imageUrl: media.imageUrl,
      imageWarning: media.image ? media.image.warning : '',
      video: media.videoStatus,
      channelsOk: okChannels,
      channelsFailed: results.filter(function (r) { return !r.ok; }).map(function (r) { return r.channel; }),
      results: results
    };
  } catch (err) {
    // Without this, a throw before the channel loop (topic build, properties,
    // sheet) aborts the whole run and leaves no trace in the log sheet.
    var failure = String(err && err.message ? err.message : err);
    var failedKey = dateKey_(new Date());
    logRow_({
      dateKey: failedKey,
      channel: 'SUMMARY',
      status: 'crashed',
      headline: '',
      idOrUrl: '',
      detail: 'run aborted before any channel: ' + failure
    });
    return {
      ok: false,
      error: failure,
      dateKey: failedKey,
      channelsOk: [],
      channelsFailed: CHANNELS.slice()
    };
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

/** Clear today's marks so failed channels are tried again. */
function resetToday() {
  var props = PropertiesService.getScriptProperties();
  var key = dateKey_(new Date());
  var all = props.getProperties();
  var cleared = [];
  Object.keys(all).forEach(function (name) {
    if (name.indexOf('done_' + key) === 0 || name.indexOf('tries_' + key) === 0 || name === postedKey_(key)) {
      props.deleteProperty(name);
      cleared.push(name);
    }
  });
  return { dateKey: key, cleared: cleared };
}

// ---------------------------------------------------------------------------
// Inspection
// ---------------------------------------------------------------------------

/** What every channel needs right now. Publishes nothing. */
function channelCheck() {
  var report = {
    at: new Date().toISOString(),
    calendar: ensureHolidayCalendar_(),
    channels: channelMatrix()
  };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function previewToday() {
  var post = buildDailyPost(new Date());
  Logger.log(JSON.stringify(post, null, 2));
  return post;
}

function previewNextWeek() {
  return upcomingDays_(7);
}

/**
 * The mock test: builds the real post, the real card and the real video lookup,
 * and reports exactly what each channel would receive. Publishes nothing.
 */
function dryRun() {
  var now = new Date();
  var post = buildDailyPost(now);
  var adapters = adapters_();
  var media = prepareMedia_(post, adapters);

  var plan = adapters.map(function (adapter) {
    var text = '';
    try {
      if (adapter.name === 'x') text = truncate_(shortText_(post), CONFIG.limits.x);
      else text = fullText_(post);
    } catch (err) { text = post.caption; }
    return {
      channel: adapter.name,
      needsImage: !!adapter.needsImage,
      needsVideo: !!adapter.needsVideo,
      characters: text.length,
      preview: truncate_(text.replace(/\n+/g, ' '), 160)
    };
  });

  var report = {
    at: now.toISOString(),
    dateKey: post.dateKey,
    type: post.type,
    source: post.source,
    occasion: post.occasion,
    headline: post.headline,
    imageUrl: media.imageUrl,
    imageError: media.image && media.image.error ? media.image.error : '',
    imageWarning: media.image && media.image.warning ? media.image.warning : '',
    video: media.videoStatus,
    plan: plan
  };
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

/**
 * A real, clearly marked test post to every configured channel.
 * Useful once after setup; it does not touch today's daily markers.
 */
function testAllChannels() {
  var post = buildDailyPost(new Date());
  post.type = 'test';
  post.title = 'GAHONSH autopilot test - ' + post.dateKey;
  post.headline = 'Autopilot test post';
  post.occasion = '';
  post.caption = 'This is a test post from the GAHONSH social autopilot. If you can read this, the channel works.\n\nWebsites, web apps and APIs, built properly.\n\n' + CONFIG.website;
  post.hashtags = '#GAHONSH #WebDevelopment #NodeJS #Automation';

  var adapters = adapters_();
  var media = prepareMedia_(post, adapters);
  var results = adapters.map(function (adapter) {
    if (adapter.needsImage && !media.imageUrl) return { channel: adapter.name, ok: false, skipped: true, error: 'no public image url' };
    if (adapter.needsVideo && !media.video) return { channel: adapter.name, ok: false, skipped: true, error: 'no video today' };
    try {
      var result = adapter.run(post, media.imageUrl, media);
      if (result) result.channel = result.channel || adapter.name;
      return result || { channel: adapter.name, ok: false, error: 'no result' };
    } catch (err) {
      return { channel: adapter.name, ok: false, error: String(err && err.message ? err.message : err) };
    }
  });

  var report = {
    at: new Date().toISOString(),
    imageUrl: media.imageUrl,
    video: media.videoStatus,
    ok: results.filter(function (r) { return r.ok; }).map(function (r) { return r.channel; }),
    failed: results.filter(function (r) { return !r.ok && !r.skipped; }).map(function (r) { return r.channel; }),
    skipped: results.filter(function (r) { return r.skipped; }).map(function (r) { return r.channel; }),
    results: results
  };
  results.forEach(function (result) {
    logRow_({
      dateKey: post.dateKey,
      channel: result.channel,
      status: result.ok ? 'test_ok' : (result.skipped ? 'test_skipped' : 'test_failed'),
      headline: post.headline,
      idOrUrl: result.url || result.id || '',
      detail: result.error || result.note || ''
    });
  });
  Logger.log(JSON.stringify(report, null, 2));
  return report;
}

function sendTestToTelegram() {
  var post = buildDailyPost(new Date());
  post.headline = 'Test post from ' + CONFIG.brand;
  post.caption = 'Test of the GAHONSH autopilot. ' + CONFIG.website;
  return publishTelegram_(post, '');
}

/* ======================= backfill.gs ======================= */

/**
 * Backfill the blog so it does not look empty on day one.
 * Publishes the same deterministic posts the daily job would have published,
 * oldest first. Blogger only by design: backfilling social feeds is spammy.
 */
function backfillBlog(days) {
  var count = Math.min(Math.max(Number(days || 7), 1), 60);
  var published = [];
  for (var i = count; i >= 1; i--) {
    var date = new Date(new Date().getTime() - i * 86400000);
    var post = buildDailyPost(date);
    // Backdated titles keep the blog readable; Blogger stamps publish time now.
    var result = publishBlogger_(post, '');
    published.push({ dateKey: post.dateKey, ok: result.ok, error: result.error || null });
    Utilities.sleep(1200);
  }
  Logger.log(JSON.stringify(published, null, 2));
  return published;
}
