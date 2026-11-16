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

  limits: { x: 275, bluesky: 290, mastodon: 480, telegram: 1000, instagram: 2100, linkedin: 2900, facebook: 5000 }
};

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
