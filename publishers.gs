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
    var res = UrlFetchApp.fetch('https://graph.facebook.com/v20.0/' + path, { muteHttpExceptions: true, followRedirects: true });
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
  var igId = propAny_(['META_IG_ID', 'INSTAGRAM_BUSINESS_ACCOUNT_ID']);
  var token = propAny_(['META_PAGE_TOKEN', 'INSTAGRAM_ACCESS_TOKEN']);
  if (!igId || !token) return { channel: 'instagram', ok: false, skipped: true, error: 'missing instagram ids' };
  if (!imageUrl) return { channel: 'instagram', ok: false, skipped: true, error: 'instagram requires an image url' };
  var alreadyIg = instagramAlreadyPosted_(igId, token, post);
  if (alreadyIg) return { channel: 'instagram', ok: true, skipped: true, id: alreadyIg, note: 'already posted today on instagram' };
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
    { name: 'youtube', enabled: true, run: publishYouTube_, needsImage: false, needsVideo: true },
    { name: 'bluesky', enabled: hasBluesky_(), run: publishBluesky_, needsImage: false },
    { name: 'mastodon', enabled: hasMastodon_(), run: publishMastodon_, needsImage: false },
    { name: 'devto', enabled: hasDevTo_(), run: publishDevTo_, needsImage: false }
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
