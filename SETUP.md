# GAHONSH Social Autopilot - setup

Ek hi jagah se roz ka post: Google Apps Script. Free APIs only, koi paid service nahi,
koi phone approval nahi, koi manual post nahi.

## What runs every day

| Time (IST) | What | Where |
|---|---|---|
| 08:00 | Short render (Pillow + ffmpeg) | GitHub Action in `gahonsh-blip.github.io` |
| 08:30 | Post + card + upload | This Apps Script |

The Apps Script decides the topic from Google's "Holidays in India" calendar and the
weekday rhythm, draws a 1080x1080 branded card in Google Slides, hosts it on GitHub
Pages (Instagram needs a public JPEG), then posts to every channel whose keys exist.

## Channels and what each one needs

| Channel | Cost | What you need |
|---|---|---|
| Blogger | free | nothing extra, Google login is enough |
| YouTube (Shorts) | free | Services (+) -> YouTube Data API v3 |
| Facebook Page | free | META_PAGE_ID, META_PAGE_TOKEN |
| Instagram | free | META_IG_ID, META_PAGE_TOKEN (same token) |
| Telegram | free | TELEGRAM_BOT_TOKEN, TELEGRAM_CHAT_ID |
| Bluesky | free | BSKY_HANDLE, BSKY_APP_PASSWORD |
| Mastodon | free | MASTODON_INSTANCE, MASTODON_TOKEN |
| dev.to | free | DEVTO_API_KEY |
| LinkedIn | free | LINKEDIN_ACCESS_TOKEN, LINKEDIN_AUTHOR_URN |
| X | free tier | X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_SECRET |
| media host | free | GITHUB_TOKEN (repo scope) - needed for Instagram |

A channel turns itself on the moment its keys exist. `DISABLE_<CHANNEL>=yes` turns it
off without deleting anything. Nothing has to be configured twice.

## Install (5 minutes, once)

1. Open `script.google.com` -> **New project**, name it `GAHONSH Social`.
2. Delete the sample code. Paste the whole `GAHONSH_AUTOPILOT.gs` file into `Code.gs`.
3. Left sidebar **Services (+)** -> **YouTube Data API v3** -> **Add**.
4. **Project Settings** -> Time zone: `(GMT+05:30) India Standard Time`.
5. **Project Settings -> Script properties**: add the keys from your channel list
   (or paste the private `keys.gs` file and run `applyKeys()` once, then delete it).
6. Select the function **setupAll** and press **Run**. Approve the Google prompt.
   This subscribes the Indian holiday calendar, creates the log sheet and installs the
   daily 08:30 trigger.
7. Select **dryRun** and press **Run** in the editor. It builds everything and publishes
   nothing - you get the exact preview per channel plus the card URL.
8. Optional, once: run **testAllChannels** for a clearly marked test post everywhere.

From then on it posts by itself at 08:30 IST, every day, festival-aware.

## Health and repair

```
channelCheck()   what is on, what is still waiting for a key
dryRun()         today's preview, publishes nothing
runDailyPost()   post now (skips channels already done today)
resetToday()     clear today's marks so failed channels retry
```

Every run writes one row per channel to the `GAHONSH Social Post Log` sheet, so
"did it post?" is answerable from the sheet instead of from memory.

## Why these routes

* **Instagram can fetch only a public URL.** A Drive link fails. The card is committed to
  the Pages repo (`social/media/`) and served from `https://gahonsh-blip.github.io`, which
  is public, permanent and free.
* **Instagram needs JPEG.** The card is exported twice, PNG for Facebook/Blogger and JPEG
  for Instagram.
* **Instagram needs two calls.** Create the container, wait for it, then publish. The code
  does that in order and never publishes without a container id.
* **Apps Script cannot encode video.** No free video API gives one public video a day
  forever, so the Short is rendered by ffmpeg on a free GitHub runner and this script
  uploads it through the YouTube API. If the render is late, the script falls back to the
  pre-rendered pool in `social/videos.json`, so YouTube still gets a Short today, and the
  report says whether it was fresh or pooled.
* **Duplicate guard.** Before posting to Facebook or Instagram it reads the Page's recent
  posts. If today's headline is already there (from the old automation, or a manual run),
  it reports that instead of posting twice.
* **Unaudited YouTube project.** Google can force API uploads to private. The script reads
  the privacy status back and says so in the report instead of claiming success.
