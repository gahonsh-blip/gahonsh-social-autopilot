/**
 * Publishing adapters. Each one is independent: if Blogger is not configured or
 * a channel fails, the others still post and the failure is recorded.
 *
 * Free today: Blogger, Telegram.
 * Needs a Meta app + business verification: Facebook Page, Instagram.
 * Needs a paid API tier: X (Twitter).
 * Needs an approved LinkedIn app: LinkedIn.
 */

function enabled_(name, fallback) {
  return String(prop_(name, fallback || 'no')).toLowerCase() === 'yes';
}

function publishBlogger_(post, imageUrl) {
  var blogId = prop_('BLOGGER_BLOG_ID');
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
    return { channel: 'blogger', ok: false, error: 'http_' + code + ': ' + response.getContentText().slice(0, 160) };
  } catch (err) {
    return { channel: 'blogger', ok: false, error: String(err) };
  }
}

function publishTelegram_(post, imageUrl) {
  var token = prop_('TELEGRAM_BOT_TOKEN');
  var chatId = prop_('TELEGRAM_CHAT_ID');
  if (!token || !chatId) return { channel: 'telegram', ok: false, skipped: true, error: 'missing TELEGRAM_BOT_TOKEN or TELEGRAM_CHAT_ID' };
  try {
    var text = post.caption + '\n\n' + post.hashtags;
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
    // A failed photo (bad url) must still deliver the text
    if (imageUrl) {
      var retry = UrlFetchApp.fetch('https://api.telegram.org/bot' + token + '/sendMessage', {
        method: 'post',
        payload: { chat_id: chatId, text: text },
        muteHttpExceptions: true
      });
      if (retry.getResponseCode() === 200) return { channel: 'telegram', ok: true, note: 'text_only_after_photo_failure' };
    }
    return { channel: 'telegram', ok: false, error: 'http_' + code };
  } catch (err) {
    return { channel: 'telegram', ok: false, error: String(err) };
  }
}

function publishFacebook_(post, imageUrl) {
  var pageId = prop_('FACEBOOK_PAGE_ID');
  var token = prop_('FACEBOOK_PAGE_ACCESS_TOKEN');
  if (!pageId || !token) return { channel: 'facebook', ok: false, skipped: true, error: 'missing page id or token' };
  try {
    var endpoint = imageUrl
      ? 'https://graph.facebook.com/v20.0/' + pageId + '/photos'
      : 'https://graph.facebook.com/v20.0/' + pageId + '/feed';
    var payload = imageUrl
      ? { url: imageUrl, caption: post.caption + '\n\n' + post.hashtags, access_token: token }
      : { message: post.caption + '\n\n' + post.hashtags, link: CONFIG.website, access_token: token };
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

function publishInstagram_(post, imageUrl) {
  var igId = prop_('INSTAGRAM_BUSINESS_ACCOUNT_ID');
  var token = prop_('INSTAGRAM_ACCESS_TOKEN');
  if (!igId || !token) return { channel: 'instagram', ok: false, skipped: true, error: 'missing instagram ids' };
  if (!imageUrl) return { channel: 'instagram', ok: false, skipped: true, error: 'instagram requires an image url' };
  try {
    var create = UrlFetchApp.fetch('https://graph.facebook.com/v20.0/' + igId + '/media', {
      method: 'post',
      payload: { image_url: imageUrl, caption: post.caption + '\n\n' + post.hashtags, access_token: token },
      muteHttpExceptions: true
    });
    if (create.getResponseCode() >= 300) {
      return { channel: 'instagram', ok: false, error: 'container_http_' + create.getResponseCode() };
    }
    var creationId = JSON.parse(create.getContentText()).id;
    var publish = UrlFetchApp.fetch('https://graph.facebook.com/v20.0/' + igId + '/media_publish', {
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

function publishLinkedIn_(post, imageUrl) {
  var token = prop_('LINKEDIN_ACCESS_TOKEN');
  var author = prop_('LINKEDIN_AUTHOR_URN');
  if (!token || !author) return { channel: 'linkedin', ok: false, skipped: true, error: 'missing linkedin token or author urn' };
  try {
    var body = {
      author: author,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: post.caption + '\n\n' + post.hashtags },
          shareMediaCategory: 'ARTICLE',
          media: [{ status: 'READY', originalUrl: CONFIG.website }]
        }
      },
      visibility: { 'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC' }
    };
    var response = UrlFetchApp.fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'post',
      contentType: 'application/json',
      headers: {
        Authorization: 'Bearer ' + token,
        'X-Restli-Protocol-Version': '2.0.0'
      },
      payload: JSON.stringify(body),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      return { channel: 'linkedin', ok: true, id: response.getHeaders()['x-restli-id'] || null };
    }
    return { channel: 'linkedin', ok: false, error: 'http_' + code + ': ' + response.getContentText().slice(0, 160) };
  } catch (err) {
    return { channel: 'linkedin', ok: false, error: String(err) };
  }
}

function publishX_(post) {
  var bearer = prop_('TWITTER_BEARER_TOKEN');
  if (!bearer) return { channel: 'x', ok: false, skipped: true, error: 'missing TWITTER_BEARER_TOKEN' };
  try {
    var text = (post.headline + '\n\n' + CONFIG.website + '\n' + post.hashtags).slice(0, 275);
    var response = UrlFetchApp.fetch('https://api.twitter.com/2/tweets', {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + bearer },
      payload: JSON.stringify({ text: text }),
      muteHttpExceptions: true
    });
    var code = response.getResponseCode();
    if (code >= 200 && code < 300) {
      return { channel: 'x', ok: true, id: JSON.parse(response.getContentText()).data.id };
    }
    return { channel: 'x', ok: false, error: 'http_' + code };
  } catch (err) {
    return { channel: 'x', ok: false, error: String(err) };
  }
}

/** Which channels to attempt, in order. Every one is failure isolated. */
function adapters_() {
  var all = [
    { name: 'blogger', enabled: enabled_('PUBLISH_BLOGGER', 'yes'), run: publishBlogger_ },
    { name: 'telegram', enabled: enabled_('PUBLISH_TELEGRAM', 'yes'), run: publishTelegram_ },
    { name: 'facebook', enabled: enabled_('PUBLISH_FACEBOOK', 'no'), run: publishFacebook_ },
    { name: 'instagram', enabled: enabled_('PUBLISH_INSTAGRAM', 'no'), run: publishInstagram_ },
    { name: 'linkedin', enabled: enabled_('PUBLISH_LINKEDIN', 'no'), run: publishLinkedIn_ },
    { name: 'x', enabled: enabled_('PUBLISH_X', 'no'), run: publishX_ }
  ];
  return all.filter(function (adapter) { return adapter.enabled; });
}

/**
 * Publish to every enabled channel. Returns per channel results.
 * A thrown error inside one adapter can never stop the others.
 */
function publishAll_(post, imageUrl) {
  var results = [];
  adapters_().forEach(function (adapter) {
    var result;
    try {
      result = adapter.run(post, imageUrl);
    } catch (err) {
      result = { channel: adapter.name, ok: false, error: String(err) };
    }
    results.push(result);
  });
  return results;
}
