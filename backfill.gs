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
