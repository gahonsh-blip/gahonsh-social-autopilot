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
  try {
    presentation = SlidesApp.create('GAHONSH post ' + post.dateKey + ' ' + new Date().getTime());
    presentation.setPageWidth(810);   // 1080 px at 96 dpi
    presentation.setPageHeight(810);

    var slide = presentation.getSlides()[0];
    slide.getPageElements().forEach(function (element) { element.remove(); });

    var width = 810;
    var height = 810;

    var bg = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, width, height);
    bg.getFill().setSolidFill(post.type === 'festival' ? '#FFF8EC' : BRAND.bg);
    bg.getBorder().setTransparent();

    var bar = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, width, 36);
    bar.getFill().setSolidFill(post.type === 'festival' ? BRAND.amber : BRAND.teal);
    bar.getBorder().setTransparent();

    var footer = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, height - 40, width, 40);
    footer.getFill().setSolidFill(BRAND.navy);
    footer.getBorder().setTransparent();

    var mark = slide.insertTextBox(CONFIG.brand, 45, 70, 500, 50);
    mark.getText().setText(CONFIG.brand);
    mark.getText().getTextStyle().setFontSize(24).setBold(true).setForegroundColor(BRAND.teal).setFontFamily('Arial');

    var dateText = slide.insertTextBox(post.dateKey, 560, 74, 205, 40);
    dateText.getText().setText(post.dateKey);
    dateText.getText().getTextStyle().setFontSize(12).setForegroundColor(BRAND.navy).setFontFamily('Arial');
    dateText.getText().getParagraphStyle().setParagraphAlignment(SlidesApp.ParagraphAlignment.END);

    var chipTop = 140;
    if (post.occasion) {
      var chip = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, 45, chipTop, Math.min(520, 30 + String(post.occasion).length * 9), 34);
      chip.getFill().setSolidFill(BRAND.amber);
      chip.getBorder().setTransparent();
      chip.getText().setText(String(post.occasion).toUpperCase());
      chip.getText().getTextStyle().setFontSize(11).setBold(true).setForegroundColor('#FFFFFF').setFontFamily('Arial');
      chipTop += 54;
    }

    var headline = slide.insertTextBox(post.headline, 45, chipTop + 14, 720, 240);
    headline.getText().setText(post.headline);
    var size = post.headline.length > 90 ? 26 : post.headline.length > 60 ? 32 : post.headline.length > 40 ? 38 : 44;
    headline.getText().getTextStyle().setFontSize(size).setBold(true).setForegroundColor(BRAND.ink).setFontFamily('Arial');

    var rule = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 45, chipTop + 268, 120, 5);
    rule.getFill().setSolidFill(BRAND.amber);
    rule.getBorder().setTransparent();

    var proof = slide.insertTextBox(CONFIG.tagline, 45, chipTop + 292, 720, 70);
    proof.getText().setText(CONFIG.tagline);
    proof.getText().getTextStyle().setFontSize(16).setForegroundColor(BRAND.navy).setFontFamily('Arial');

    var site = slide.insertTextBox(CONFIG.website.replace('https://', ''), 45, height - 132, 500, 44);
    site.getText().setText(CONFIG.website.replace('https://', ''));
    site.getText().getTextStyle().setFontSize(20).setBold(true).setForegroundColor(BRAND.teal).setFontFamily('Arial');

    var cta = slide.insertTextBox('Websites  •  Web apps  •  APIs  •  Dashboards', 45, height - 92, 720, 34);
    cta.getText().setText('Websites  •  Web apps  •  APIs  •  Dashboards');
    cta.getText().getTextStyle().setFontSize(12).setForegroundColor(BRAND.navy).setFontFamily('Arial');

    presentation.saveAndClose();

    var pageId = slide.getObjectId();
    var pngBlob = exportSlide_(presentation.getId(), pageId, 'png');
    var jpegBlob = null;
    try { jpegBlob = exportSlide_(presentation.getId(), pageId, 'jpeg'); } catch (err) { jpegBlob = pngBlob; }

    var hostError = '';
    var pngUrl = '';
    var jpegUrl = '';

    if (ghToken_()) {
      try {
        pngUrl = hostOnPages_(pngBlob.setName('gahonsh-' + post.dateKey + '.png'), 'gahonsh-' + post.dateKey + '.png', 'image/png');
        jpegUrl = hostOnPages_(jpegBlob.setName('gahonsh-' + post.dateKey + '.jpg'), 'gahonsh-' + post.dateKey + '.jpg', 'image/jpeg');
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
      imageUrl: jpegUrl,   // Instagram requires JPEG
      fileId: fileId,
      warning: hostError
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    if (presentation) {
      try { DriveApp.getFileById(presentation.getId()).setTrashed(true); } catch (ignored) {}
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
