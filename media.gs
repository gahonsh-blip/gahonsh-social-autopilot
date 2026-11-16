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
