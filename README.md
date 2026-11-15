# GAHONSH Social Autopilot

A free, private daily posting machine for the GAHONSH freelancing brand. It runs
inside your own Google account with Google Apps Script: no server, no subscription,
no AI API bill, no third-party scheduler.

Every day at 08:30 IST it:

1. reads your Google Calendar for today, so a festival or an all-day event becomes the post,
2. otherwise picks the day's business topic from a 24 topic bank,
3. writes a professional English caption (plus a Hindi line for festivals) and always ends with the website link,
4. draws a branded 1080-style post image with the GAHONSH wordmark and the website URL,
5. publishes to every channel you have switched on, each one isolated so a failure cannot block the rest,
6. records the result in a `PostLog` spreadsheet so you can see what went out and what failed.

Nothing is ever posted twice in one day: the run marks the date in Script Properties.

## What is free and what is not

| Channel | Cost today | What you need |
| --- | --- | --- |
| Blogger (real blog post, image, hashtags) | Free | a Blogger blog + one authorisation click |
| Telegram channel | Free | a bot token from @BotFather and a channel id |
| Facebook Page | Free, but needs a Meta app | Page access token; Meta app review for `pages_manage_posts` |
| Instagram Business | Free, needs a Meta app + business verification | IG business account id + token |
| LinkedIn | Free, needs an approved LinkedIn app | access token + author URN |
| X / Twitter | **Paid** since the API v2 revamp | paid API tier, bearer token |

Blogger and Telegram are the two channels that work today with zero cost and zero
app review, so the project is useful immediately. The rest are written and tested
for failure isolation; switch them on when you have the tokens.

## Setup, step by step

1. **Create the Apps Script project.** Go to https://script.google.com, New project, name it `GAHONSH Social Autopilot`.
2. **Add the files.** For each `.gs` file in this repo, create a script file with the same name and paste its contents: `config.gs`, `calendar.gs`, `content.gs`, `image.gs`, `publishers.gs`, `Code.gs`, `backfill.gs`. Then open Project Settings and tick *Show `appsscript.json` manifest file*, and replace the manifest with the one from this repo. Save.
   With the CLI instead: `npm i -g @google/clasp && clasp login && clasp clone <scriptId>` once the project exists, then copy the files in and `clasp push`.
3. **Create the blog.** If you do not have one, go to https://blogger.com and create a blog (free, e.g. `gahonsh.blogspot.com`). Open it, look at the URL bar: the long number in `blogID=` is your `BLOGGER_BLOG_ID`.
4. **Set Script Properties.** Project Settings, Script Properties, add:
   - `BLOGGER_BLOG_ID` = the number from step 3
   - `PUBLISH_BLOGGER` = `yes`
   - `PUBLISH_TELEGRAM` = `no` (until you have the two Telegram values)
   - `PUBLISH_IMAGE` = `yes`
   - optional `POST_HOUR` = `8`, `POST_MINUTE` = `30`
5. **Authorise.** In the editor select the function `previewToday` and Run. Google asks for permission: Calendar read, Drive files, Slides, Sheets, Blogger, external requests. Approve all of them (they are the scopes in `appsscript.json`).
6. **Check the output.** The execution log shows the caption and hashtags that will be posted. If the words are wrong, edit `content.gs` and run again.
7. **Install the schedule.** Run `installTriggers`. It creates one daily trigger at 08:30 Asia/Kolkata and removes any older duplicate.
8. **First real run.** Run `runDailyPost`. Open your blog and the `GAHONSH Social Post Log` spreadsheet that was created in your Drive. The log row tells you which channel succeeded.
9. **Optional: telegram.** Create a bot with @BotFather, add it as an admin of your channel, put `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in Script Properties, set `PUBLISH_TELEGRAM` = `yes`, then run `sendTestToTelegram`.
10. **Optional: fill the blog.** Run `backfillBlog` with a number, e.g. edit the call to `backfillBlog(10)` in a temporary function, or run it from the editor console as `backfillBlog(10)`. It publishes the last 10 daily posts so the blog does not look empty.

## Script Properties reference

| Property | Default | Meaning |
| --- | --- | --- |
| `BLOGGER_BLOG_ID` | none | target blog |
| `PUBLISH_BLOGGER` | `yes` | switch Blogger on/off |
| `PUBLISH_TELEGRAM` | `yes` | switch Telegram on/off |
| `PUBLISH_FACEBOOK` | `no` | needs `FACEBOOK_PAGE_ID`, `FACEBOOK_PAGE_ACCESS_TOKEN` |
| `PUBLISH_INSTAGRAM` | `no` | needs `INSTAGRAM_BUSINESS_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN` |
| `PUBLISH_LINKEDIN` | `no` | needs `LINKEDIN_ACCESS_TOKEN`, `LINKEDIN_AUTHOR_URN` |
| `PUBLISH_X` | `no` | needs paid `TWITTER_BEARER_TOKEN` |
| `PUBLISH_IMAGE` | `yes` | build the branded image with Slides |
| `BILINGUAL_HINDI` | `yes` | add a Hindi line to festival posts |
| `POST_HOUR`, `POST_MINUTE` | `8`, `30` | daily run time, Asia/Kolkata |
| `CONTENT_CALENDAR_SHEET_ID` | none | optional sheet of date overrides |
| `POSTLOG_SHEET_ID` | auto | created on first run |
| `DRIVE_FOLDER` | `GAHONSH Social` | where images are saved |

## Content calendar sheet (optional)

Make a Google Sheet with one row per special day, headers in row 1:

```
date        | type     | topic                                 | caption            | imageUrl
2026-12-31  | occasion | Year end audit of your website        | (leave empty)      |
2027-01-05  | business | New year, new landing page            | (leave empty)      |
```

Share nothing; just paste the sheet id from the URL into `CONTENT_CALENDAR_SHEET_ID`.
A row here always wins over the built-in calendar.

## What the image looks like

`image.gs` builds it with Google Slides: off-white background, teal top bar, the
GAHONSH wordmark, the headline, an amber chip with the occasion, the tagline, and
the website URL. It exports a PNG, saves it to Drive and shares it read-only so
Facebook, Instagram and Telegram can fetch it. The temporary presentation is moved
to trash. No logo file is needed; the wordmark is drawn in text so it always
renders.

## Tests

```bash
node tests/local-test.js
```

The harness loads the real `.gs` files into a Node VM with stubbed Google services
and asserts ten behaviours, including: the website link on every generated post,
Diwali 2026 detected as a festival, a Google Calendar all-day event detected as a
festival, one run per day, and a failing channel not blocking the others.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| `png_export_failed_401` | Slides scope not authorised | re-run authorisation, approve all scopes |
| Blogger `http_401` | wrong blog id or Blogger scope removed | re-check `BLOGGER_BLOG_ID`, re-authorise |
| Blogger `http_403` | blog not created yet or not owned by this account | create the blog with the same Google account |
| Telegram `http_400` | bot is not an admin of the channel | add the bot as channel admin |
| Telegram photo fails but text arrives | Drive image URL not publicly fetchable | keep `PUBLISH_IMAGE` = `yes`; the adapter retries as text |
| Nothing runs at 08:30 | trigger not installed, or project paused | run `installTriggers` again, check Triggers page |
| Two posts in a day | someone ran `runDailyPost` manually after the cron | harmless, the log shows both; the day key stops the cron from repeating |
| Calendar festival not detected | event is not all-day or title has no festival word | add the date to the Content Calendar sheet |

## Honest limits

- Festival dates for lunar festivals change every year. Only 2026 is built in; from 2027 the reliable source is your Google Calendar, which is why the code reads it first.
- Apps Script has a 6 minute execution limit per run. The daily job takes a few seconds; the image export is the slowest part.
- Instagram requires a publicly reachable image URL and a business account. The Drive link normally works, but if Meta rejects it, host the same PNG on the site and use that URL.
- Poetry-level copywriting is not what this does. It composes clear, honest, professional posts from a curated bank, which is what actually converts for a services business.

See `docs/ROADMAP.md` for moving this to the Vercel + Supabase stack later.

MIT licensed. Built for GAHONSH Company, Bundu, Ranchi, Jharkhand, India.
