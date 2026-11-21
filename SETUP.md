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
3. Paste the manifest: **Project Settings** -> tick **Show "appsscript.json" in editor**,
   open the `appsscript.json` tab, and replace its contents with this repo's
   `appsscript.json`. This is what requests the Blogger, Slides, Drive, Sheets,
   Calendar and YouTube upload scopes. Skipping this step is the most common reason
   a channel fails with `http_403`.
4. Left sidebar **Services (+)** -> **YouTube Data API v3** -> **Add**.
5. **Project Settings** -> Time zone: `(GMT+05:30) India Standard Time`.
6. **Project Settings -> Script properties**: add the keys from your channel list
   (or paste the private `keys.gs` file and run `applyKeys()` once, then delete it).
7. Select the function **setupAll** and press **Run**. Approve the Google prompt.
   This subscribes the Indian holiday calendar, creates the log sheet and installs the
   daily 08:30 trigger.
8. Select **dryRun** and press **Run** in the editor. It builds everything and publishes
   nothing - you get the exact preview per channel plus the card URL.
9. Optional, once: run **testAllChannels** for a clearly marked test post everywhere.

From then on it posts by itself at 08:30 IST, every day, festival-aware.

## After an update: authorize again

Pasting a new `GAHONSH_AUTOPILOT.gs` that uses a scope the project did not use before
makes every run fail with `Authorization is required to perform that action` until the
owner approves it once. The daily trigger cannot show a prompt, so it just fails quietly
in **Executions**.

After every update:

1. Open the editor and pick any function (for example `channelCheck`).
2. Press **Run** and approve the prompt.
3. Run `dryRun()` to confirm all channels are happy.

## Troubleshooting

| Symptom | Check |
|---|---|
| Nothing posted, sheet has no rows at all | **Executions** page: a failed run means the script could not start (usually authorization) |
| Sheet row with status `crashed` | The run died before any channel; `detail` holds the error |
| Blogger row `http_403: the blogger scope is not granted` | Paste `appsscript.json`, then authorize again (see above) |
| YouTube row `advanced service not added` | **Services (+)** -> **YouTube Data API v3** -> **Add** |
| Instagram `no public image url` | `GITHUB_TOKEN` missing, so the card never reached GitHub Pages |

`channelCheck()` prints one row per channel with `ready` and the keys it still needs;
`youtube` now reports `needs the YouTube Data API v3 service` instead of pretending to
be ready.

## What expires

Every one of these fails silently at 08:30, so check them when posting stops.
`tokenHealth()` tests the four that are cheap to test and prints one line per service.

| Thing | Lifetime | Fix | Symptom when it lapses |
|---|---|---|---|
| Meta Graph API version | ~2 years (v20.0 ended 2026-09-24) | set `META_GRAPH_VERSION` (default `v25.0`, good to 2028) | Facebook and Instagram fail, error mentions an unsupported version |
| LinkedIn API version | 1 year (latest `202611`) | set `LINKEDIN_VERSION` | LinkedIn fails with 400/426 |
| Meta page token | ~60 days for a long-lived user token | generate a new one, update `META_PAGE_TOKEN` | Facebook and Instagram return `190` |
| LinkedIn access token | ~60 days | update `LINKEDIN_ACCESS_TOKEN` | LinkedIn returns `401` |
| GitHub token | whatever you chose at creation | regenerate, update `GITHUB_TOKEN` | the card is not hosted, so Instagram has no image |
| X free tier | monthly cap | nothing to fix, it resets | X returns `429` |
| Apps Script execution | 6 minutes per run | keep the run lean | the run is killed mid-way, which is why YouTube runs last |
| GitHub scheduled workflow | disabled after 60 days with no repository activity | push anything, or re-enable it in the Actions tab | the preview page stops updating |

Versions are Script Properties on purpose: when Meta or LinkedIn retires a version,
change the property instead of waiting for a code release.

## Health and repair

```
channelCheck()   what is on, what is still waiting for a key
tokenHealth()    are the expiring tokens still valid (one GET per service)
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
