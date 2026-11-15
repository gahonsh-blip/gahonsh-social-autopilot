# Channels: what exists, what is missing, what each one needs

Checked on 15 Nov 2026. Account existence was verified by reading the profiles and
the public blog feed, not from memory.

## Already exists (do not create again)

| Channel | Account | State | What publishing needs |
| --- | --- | --- | --- |
| Blogger | https://gahonsh.blogspot.com | live, blog id `4592871834916952562`, last post 7 Sep 2026 | one authorisation click. No app, no review |
| Instagram | https://www.instagram.com/gahonsh/ | live | Meta app + Instagram Business account + business verification |
| LinkedIn | https://www.linkedin.com/in/gahonsh-company-b05528311/ | live, personal profile | LinkedIn developer app with `w_member_social` |
| X | https://x.com/GahonshC93491 | live | developer app, OAuth 1.0a user keys. Free tier allows posting |
| Facebook | https://www.facebook.com/gopinath.patar.73 | personal profile only | a **Page** is still needed, then a Page access token |
| WhatsApp | business chat | live | manual sharing of the daily post |

## Missing (create these)

| Channel | Why it is worth 5 minutes | Cost |
| --- | --- | --- |
| Telegram channel + bot | fully free, instant, no approval, image + text both work | free |
| Bluesky | free, no developer app, app password posts directly with image | free |
| Mastodon | free, no review, API token from the account settings | free |
| Dev.to | free article publishing, each post becomes a Google indexable page | free |
| Facebook Page | required before any Facebook automation is possible | free |
| YouTube channel | the website already links to youtube.com with no channel behind it | free |

## Order that gets real posts fastest

1. **Telegram** (2 min). In Telegram open @BotFather, `/newbot`, copy the token.
   Create a channel, add the bot as an administrator, then read the channel id at
   `https://api.telegram.org/bot<token>/getUpdates` after posting anything in it.
   Script properties: `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`.
2. **Bluesky** (2 min). Sign up at https://bsky.app, then Settings, App Passwords,
   Add App Password. Properties: `BLUESKY_HANDLE`, `BLUESKY_APP_PASSWORD`.
3. **Blogger** (0 min of creation). The blog already exists. The blog id is built
   into `config.gs`, so the first `runDailyPost` publishes to it once you approve
   the Blogger scope.
4. **Dev.to** (3 min). Sign up, then Settings, Extensions, DEV Community API Keys,
   generate. Property: `DEVTO_API_KEY`.
5. **Mastodon** (3 min). Sign up on any instance, Preferences, Development, New
   application, scope `write:statuses`. Properties: `MASTODON_INSTANCE`,
   `MASTODON_ACCESS_TOKEN`.

Instagram, Facebook Page, LinkedIn and X all need a developer app. They are coded
and error-isolated, and their endpoints are verified live, but they stay off until
the app exists. Nothing breaks while they are off.

## Endpoint verification (15 Nov 2026)

Every adapter was called for real from this machine without credentials. All the
endpoints answered with the expected authentication error, which proves the URL
and the payload are right and that the only missing piece is the token:

| Endpoint | Answer |
| --- | --- |
| Blogger `/blogs/4592871834916952562` | 403, needs Google token |
| Telegram `getMe` | 401 Unauthorized |
| Bluesky `createSession` | 401 Invalid identifier or password |
| Dev.to `/articles/me` | 403, needs api key |
| X `POST /2/tweets` | 403 "OAuth 2.0 Application-Only is forbidden for this endpoint" (this is the bug that was fixed) |
| LinkedIn `POST /rest/posts` | 401 INVALID_ACCESS_TOKEN |
| Facebook `/me/feed` | 190 Invalid OAuth access token |
| Mastodon public API | 200, instance reachable |
