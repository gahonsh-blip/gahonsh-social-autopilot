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
  var handle = prop_('BLUESKY_HANDLE');
  var appPassword = prop_('BLUESKY_APP_PASSWORD');
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
  var token = prop_('MASTODON_ACCESS_TOKEN');
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
  var pageId = prop_('FACEBOOK_PAGE_ID');
  var token = prop_('FACEBOOK_PAGE_ACCESS_TOKEN');
  if (!pageId || !token) return { channel: 'facebook', ok: false, skipped: true, error: 'missing page id or token' };
  try {
    var endpoint = imageUrl
      ? 'https://graph.facebook.com/v20.0/' + pageId + '/photos'
      : 'https://graph.facebook.com/v20.0/' + pageId + '/feed';
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
  var igId = prop_('INSTAGRAM_BUSINESS_ACCOUNT_ID');
  var token = prop_('INSTAGRAM_ACCESS_TOKEN');
  if (!igId || !token) return { channel: 'instagram', ok: false, skipped: true, error: 'missing instagram ids' };
  if (!imageUrl) return { channel: 'instagram', ok: false, skipped: true, error: 'instagram requires an image url' };
  try {
    var create = UrlFetchApp.fetch('https://graph.facebook.com/v20.0/' + igId + '/media', {
      method: 'post',
      payload: { image_url: imageUrl, caption: fullText_(post), access_token: token },
      muteHttpExceptions: true
    });
    if (create.getResponseCode() >= 300) {
      return { channel: 'instagram', ok: false, error: 'container_http_' + create.getResponseCode() + ': ' + create.getContentText().slice(0, 120) };
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

// ---------------------------------------------------------------------------
// LinkedIn (current /rest/posts endpoint, ugcPosts as fallback)
// ---------------------------------------------------------------------------

function publishLinkedIn_(post, imageUrl) {
  var token = prop_('LINKEDIN_ACCESS_TOKEN');
  var author = prop_('LINKEDIN_AUTHOR_URN');
  if (!token || !author) return { channel: 'linkedin', ok: false, skipped: true, error: 'missing linkedin token or author urn' };
  var headers = {
    Authorization: 'Bearer ' + token,
    'LinkedIn-Version': prop_('LINKEDIN_VERSION', '202405'),
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
  var key = prop_('X_CONSUMER_KEY');
  var secret = prop_('X_CONSUMER_SECRET');
  var token = prop_('X_ACCESS_TOKEN');
  var tokenSecret = prop_('X_ACCESS_TOKEN_SECRET');
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
// Channel registry
// ---------------------------------------------------------------------------

/** Every channel, whether it is switched on, and what it still needs. */
function channelMatrix() {
  var rows = [
    { name: 'blogger', switch: 'PUBLISH_BLOGGER', on: 'yes', needs: ['BLOGGER_BLOG_ID'] },
    { name: 'telegram', switch: 'PUBLISH_TELEGRAM', on: 'yes', needs: ['TELEGRAM_BOT_TOKEN', 'TELEGRAM_CHAT_ID'] },
    { name: 'bluesky', switch: 'PUBLISH_BLUESKY', on: 'yes', needs: ['BLUESKY_HANDLE', 'BLUESKY_APP_PASSWORD'] },
    { name: 'mastodon', switch: 'PUBLISH_MASTODON', on: 'yes', needs: ['MASTODON_INSTANCE', 'MASTODON_ACCESS_TOKEN'] },
    { name: 'devto', switch: 'PUBLISH_DEVTO', on: 'yes', needs: ['DEVTO_API_KEY'] },
    { name: 'facebook', switch: 'PUBLISH_FACEBOOK', on: 'no', needs: ['FACEBOOK_PAGE_ID', 'FACEBOOK_PAGE_ACCESS_TOKEN'] },
    { name: 'instagram', switch: 'PUBLISH_INSTAGRAM', on: 'no', needs: ['INSTAGRAM_BUSINESS_ACCOUNT_ID', 'INSTAGRAM_ACCESS_TOKEN'] },
    { name: 'linkedin', switch: 'PUBLISH_LINKEDIN', on: 'no', needs: ['LINKEDIN_ACCESS_TOKEN', 'LINKEDIN_AUTHOR_URN'] },
    { name: 'x', switch: 'PUBLISH_X', on: 'no', needs: ['X_CONSUMER_KEY', 'X_CONSUMER_SECRET', 'X_ACCESS_TOKEN', 'X_ACCESS_TOKEN_SECRET'] }
  ];
  return rows.map(function (row) {
    var missing = row.needs.filter(function (key) { return !prop_(key); });
    return {
      channel: row.name,
      enabled: enabled_(row.switch, row.on),
      configured: missing.length === 0,
      missing: missing,
      ready: enabled_(row.switch, row.on) && missing.length === 0
    };
  });
}

/** Which channels to attempt, in order. Every one is failure isolated. */
function adapters_() {
  var all = [
    { name: 'blogger', enabled: enabled_('PUBLISH_BLOGGER', 'yes'), run: publishBlogger_ },
    { name: 'telegram', enabled: enabled_('PUBLISH_TELEGRAM', 'yes'), run: publishTelegram_ },
    { name: 'bluesky', enabled: enabled_('PUBLISH_BLUESKY', 'yes'), run: publishBluesky_ },
    { name: 'mastodon', enabled: enabled_('PUBLISH_MASTODON', 'yes'), run: publishMastodon_ },
    { name: 'devto', enabled: enabled_('PUBLISH_DEVTO', 'yes'), run: publishDevTo_ },
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
