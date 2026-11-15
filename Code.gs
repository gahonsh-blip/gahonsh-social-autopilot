/**
 * GAHONSH social autopilot - entry points.
 *
 * runDailyPost()   builds and publishes today's post, exactly once per day
 * previewToday()   shows what would be posted, publishes nothing
 * installTriggers()creates the daily 08:30 Asia/Kolkata trigger
 * sendTestToTelegram() proves the Telegram channel works
 * backfillBlog(n)  fills the blog with the last n days
 */

/** Idempotency key for a given day. */
function postedKey_(key) {
  return 'posted_' + key;
}

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
  return 'trigger installed: runDailyPost daily at ' + prop_('POST_HOUR', '8') + ':' + prop_('POST_MINUTE', '30') + ' ' + CONFIG.timezone;
}

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
    sheet.appendRow(['timestamp', 'date', 'type', 'occasion', 'headline', 'channels_ok', 'channels_failed', 'image', 'detail']);
  }
  return sheet;
}

function logRun_(entry) {
  try {
    getLogSheet_().appendRow([
      new Date(),
      entry.dateKey,
      entry.type,
      entry.occasion || '',
      entry.headline || '',
      entry.ok || '',
      entry.failed || '',
      entry.image || '',
      entry.detail || ''
    ]);
  } catch (err) {
    Logger.log('log_failed: ' + err);
  }
}

/**
 * Build the post, generate the branded image if any channel needs one, publish
 * everywhere enabled, and record the result. Safe to call twice: the second
 * call the same day does nothing.
 */
function runDailyPost() {
  var now = new Date();
  var key = dateKey_(now);
  var props = PropertiesService.getScriptProperties();

  if (props.getProperty(postedKey_(key))) {
    Logger.log('already posted for ' + key);
    return { ok: true, skipped: true, reason: 'already_posted_today', dateKey: key };
  }

  var post = buildDailyPost(now);
  var image = { ok: false, skipped: true };
  if (prop_('PUBLISH_IMAGE', 'yes') === 'yes') {
    image = buildBrandImage(post);
  }
  var imageUrl = post.imageUrl || (image.ok ? image.url : '');

  var results = publishAll_(post, imageUrl);
  var okChannels = results.filter(function (r) { return r.ok; }).map(function (r) { return r.channel; });
  var failedChannels = results.filter(function (r) { return !r.ok; }).map(function (r) {
    return r.channel + (r.skipped ? '(skipped)' : '');
  });

  // Mark the day as done when at least one real channel succeeded, so a network
  // glitch can be retried later the same day instead of silently losing the post.
  if (okChannels.length > 0) {
    props.setProperty(postedKey_(key), JSON.stringify({ at: now.toISOString(), channels: okChannels }));
  }

  logRun_({
    dateKey: post.dateKey,
    type: post.type,
    occasion: post.occasion,
    headline: post.headline,
    ok: okChannels.join(','),
    failed: failedChannels.join(','),
    image: image.ok ? image.fileId : (image.skipped ? 'skipped' : 'failed:' + image.error),
    detail: JSON.stringify(results).slice(0, 4000)
  });

  return {
    ok: okChannels.length > 0,
    dateKey: post.dateKey,
    headline: post.headline,
    channelsOk: okChannels,
    channelsFailed: failedChannels,
    imageUrl: imageUrl,
    results: results
  };
}

function previewToday() {
  var post = buildDailyPost(new Date());
  Logger.log(JSON.stringify(post, null, 2));
  return post;
}

function previewNextWeek() {
  return upcomingDays_(7);
}

function sendTestToTelegram() {
  var post = buildDailyPost(new Date());
  post.headline = 'Test post from ' + CONFIG.brand;
  post.caption = 'This is a test of the GAHONSH autopilot. Website: ' + CONFIG.website;
  return publishTelegram_(post, '');
}
