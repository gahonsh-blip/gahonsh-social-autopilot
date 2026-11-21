# GAHONSH Social Autopilot

Free, daily, hands-off posting for GAHONSH: one Google Apps Script posts to
Blogger, Facebook Page, Instagram, LinkedIn, X, YouTube (Shorts), Telegram,
Bluesky, Mastodon and dev.to, from a content calendar that knows Indian festivals.

No paid API, no phone approval, no manual daily work.

## Install

See **[SETUP.md](SETUP.md)**. Short version: paste `GAHONSH_AUTOPILOT.gs` into
script.google.com, add the YouTube Data API v3 service, add your keys as Script
Properties, run `setupAll()` once.

## What it does each morning

1. Reads Google's "Holidays in India" calendar (subscribed once) plus your own
   calendars, so a festival day becomes a festival post with no date list to maintain.
2. Picks the day's topic from a 24-topic bank on the weekday rhythm, or your own
   `ContentCalendar` sheet row if you want to override a date.
3. Draws a 1080x1080 branded card in Google Slides and commits it to
   `gahonsh-blip.github.io/social/media/` so Instagram has a public JPEG URL.
4. Posts to every channel whose keys exist, one retry on transient errors,
   failure isolated per channel, never twice for the same day.
5. Uploads the day's Short to YouTube (rendered free by ffmpeg on a GitHub runner;
   falls back to the pre-rendered pool so a Short still goes up).
6. Writes one row per channel to the `GAHONSH Social Post Log` sheet.

## Files

| File | Purpose |
|---|---|
| `config.gs` | brand, endpoints, key names, channel auto-detection |
| `calendar.gs` | holiday calendar, festivals, fixed observances, sheet overrides |
| `content.gs` | topic bank, captions, hashtags, Hindi festival greeting |
| `media.gs` | Slides card, JPEG/PNG export, GitHub Pages hosting, video manifest + pool |
| `publishers.gs` | one adapter per channel, duplicate guards, retry |
| `code.gs` | orchestrator, triggers, setup, dry run, log |
| `backfill.gs` | fill the blog with past days |
| `GAHONSH_AUTOPILOT.gs` | generated single-file build (`node build-bundle.js`) |

## Tests

```
npm run check     # every .gs file parses
npm test          # 38 mock tests, Google services stubbed
```

The suite proves the parts that actually break: festival detection, the link on
every post, per-channel idempotency, failure isolation, the Instagram
container-then-publish order, YouTube privacy verification, the media host
updating an existing file, X OAuth 1.0a signing, and that `dryRun()` posts nothing.

## Daily preview workflow

`.github/workflows/daily-post.yml` renders today's real post into `docs/` at
03:00 UTC (08:30 IST) and commits the page, so `docs/today.html` always shows
what the Apps Script will publish. It needs no secrets.

Trigger it by hand from **Actions -> Daily post preview -> Run workflow** (the
`workflow_dispatch:` trigger), or re-run any failed run from the Actions tab.

Keep the source list in `render-today.js` in sync with the files on disk. Linux
runners are case-sensitive: `media.gs` and `code.gs` are lowercase in this repo,
so `image.gs` or `Code.gs` fails the job with `ENOENT`. The workflow now checks
for every source file before rendering and fails with the missing name instead.

## Why not just a "free AI video API"

None exists at one-video-per-day volume: free tiers end, watermarks appear, or a
card is required. Pillow and ffmpeg are already on the GitHub runner and cost
nothing, so the Short is composed from branded cards plus a free neural voice.
`social/render.py` in the website repo does that at 08:00 IST.
