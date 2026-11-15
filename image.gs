/**
 * Branded post image, generated for free with Google Slides.
 * A slide is drawn with brand colours and exported as PNG, then saved to Drive
 * and shared read-only so social platforms can fetch the URL.
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

function buildBrandImage(post) {
  var presentation = null;
  try {
    presentation = SlidesApp.create('GAHONSH post ' + post.dateKey + ' ' + new Date().getTime());
    var slide = presentation.getSlides()[0];
    slide.getPageElements().forEach(function (element) { element.remove(); });

    var width = presentation.getPageWidth();
    var height = presentation.getPageHeight();

    // Background band
    var bg = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, width, height);
    bg.getFill().setSolidFill(BRAND.bg);
    bg.getBorder().setTransparent();

    // Top accent bar
    var bar = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, 0, width, height * 0.045);
    bar.getFill().setSolidFill(BRAND.teal);
    bar.getBorder().setTransparent();

    // Brand wordmark built from text, so no logo file is required
    var mark = slide.insertTextBox(CONFIG.brand, width * 0.07, height * 0.10, width * 0.7, height * 0.10);
    mark.getText().getTextStyle().setFontSize(26).setBold(true).setForegroundColor(BRAND.teal);
    mark.getText().getTextStyle().setFontFamily('Arial');

    // Headline
    var headline = slide.insertTextBox(post.headline, width * 0.07, height * 0.26, width * 0.86, height * 0.34);
    var hText = headline.getText();
    hText.getTextStyle().setFontSize(post.headline.length > 60 ? 22 : 28).setBold(true).setForegroundColor(BRAND.ink);
    hText.getTextStyle().setFontFamily('Arial');

    // Occasion chip
    if (post.occasion) {
      var chip = slide.insertShape(SlidesApp.ShapeType.ROUND_RECTANGLE, width * 0.07, height * 0.20, width * 0.36, height * 0.05);
      chip.getFill().setSolidFill(BRAND.amber);
      chip.getBorder().setTransparent();
      var chipText = chip.getText();
      chipText.setText(post.occasion);
      chipText.getTextStyle().setFontSize(11).setBold(true).setForegroundColor('#FFFFFF').setFontFamily('Arial');
    }

    // One line of proof
    var proof = slide.insertTextBox(CONFIG.tagline, width * 0.07, height * 0.64, width * 0.86, height * 0.09);
    proof.getText().getTextStyle().setFontSize(14).setForegroundColor(BRAND.navy).setFontFamily('Arial');

    // Website, always visible on the image as well as in the caption
    var site = slide.insertTextBox(CONFIG.website.replace('https://', ''), width * 0.07, height * 0.80, width * 0.86, height * 0.08);
    site.getText().getTextStyle().setFontSize(16).setBold(true).setForegroundColor(BRAND.teal).setFontFamily('Arial');

    var footer = slide.insertShape(SlidesApp.ShapeType.RECTANGLE, 0, height * 0.955, width, height * 0.045);
    footer.getFill().setSolidFill(BRAND.navy);
    footer.getBorder().setTransparent();

    presentation.saveAndClose();

    var exportUrl = 'https://docs.google.com/presentation/d/' + presentation.getId() +
      '/export/png?pageid=' + slide.getObjectId();
    var response = UrlFetchApp.fetch(exportUrl, {
      headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() },
      muteHttpExceptions: true
    });
    if (response.getResponseCode() !== 200) {
      throw new Error('png_export_failed_' + response.getResponseCode());
    }

    var folder = getOrCreateFolder_(prop_('DRIVE_FOLDER', CONFIG.driveFolder));
    var blob = response.getBlob().setName('gahonsh-' + post.dateKey + '.png');
    var file = folder.createFile(blob);
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

    return {
      ok: true,
      fileId: file.getId(),
      // lh3 form renders inline and works with Meta/LinkedIn fetchers
      url: 'https://lh3.googleusercontent.com/d/' + file.getId(),
      downloadUrl: 'https://drive.google.com/uc?export=download&id=' + file.getId()
    };
  } catch (err) {
    return { ok: false, error: String(err && err.message ? err.message : err) };
  } finally {
    if (presentation) {
      try { DriveApp.getFileById(presentation.getId()).setTrashed(true); } catch (ignored) {}
    }
  }
}
