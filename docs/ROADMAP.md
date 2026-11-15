# Moving the autopilot to the Vercel + Supabase stack

Apps Script is the right home for this today: free, always on, already inside the
Google account that owns the Calendar and the blog. Move only when you outgrow it.

Signs you have outgrown it: you want scheduled video, per-platform captions, A/B
testing, analytics on what earns enquiries, or posting more than once a day.

## Target architecture

```
Vercel cron (08:30 IST)  ->  /api/social/daily
        |                        |
        |                        +-> Supabase: posts table (date, channel, status, error)
        |                        +-> Google Calendar API (festival events)
        +-> image render (satori / resvg on Vercel, or pre-rendered PNGs in Supabase storage)
```

## Which adapters keep working

| Channel | Works unchanged | Note |
| --- | --- | --- |
| Blogger | yes | same Blogger API v3 call, normal OAuth refresh token |
| Telegram | yes | same Bot API |
| Facebook Page | yes | same Graph API |
| Instagram | yes | same two step container flow |
| LinkedIn | yes | same UGC posts call |
| X | yes | still paid |
| Branded image | replaced | Slides export is Apps Script only; use satori + resvg or a stored template |

## Steps

1. Create the `social_posts` table in Supabase: `id, run_date, channel, status, external_id, url, error, created_at`. Unique index on `(run_date, channel)` gives the same once-per-day guarantee as the day key.
2. Move `content.gs` and `calendar.gs` into a Node module nearly as-is; swap `PropertiesService` for `process.env` and `CalendarApp` for the Calendar REST API.
3. Add `/api/social/daily` with `CRON_SECRET` bearer auth, `maxDuration` 60, and one try/catch per channel.
4. Replace the Slides image with a static template plus text overlay, or pre-generate a month of PNGs and rotate them.
5. Keep Apps Script running for a week in parallel and compare the PostLog with the Supabase table before switching the cron off.
