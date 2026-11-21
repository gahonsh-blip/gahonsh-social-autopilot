/**
 * GAHONSH social autopilot - entry points.
 *
 * Run these from the Apps Script editor:
 *   setupAll()          one-time setup: holiday calendar + daily trigger + log sheet
 *   channelCheck()      what is on, what is waiting for a key (publishes nothing)
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
