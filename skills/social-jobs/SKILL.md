---
name: social-jobs
description: Collect job openings that never reach job boards. They're posted on Instagram job pages, Telegram channels, LinkedIn posts, WhatsApp-forwarded links, Wellfound, Instahyre, Cutshort, Naukri and startup directories (YC, Indian startup lists). Claude reads them in the user's own browser, extracts each opening, verifies it on the company's official careers page, filters scams and wrong batches, and adds the real ones to the job list. Use this whenever the user mentions Instagram job pages, Telegram job channels, "jobs posted on social media", off-campus drives, startup jobs in specific Indian cities (Bengaluru, Pune, Hyderabad, Chennai, Mumbai, Delhi NCR, Noida, Kochi …), Wellfound/AngelList, or pastes a job post or screenshot.
---

# Jobs from social media and startup sites

Job boards miss a lot of openings, especially for freshers and startups in India: off-campus
drives, startup roles and referral posts shared by Instagram pages and Telegram channels. This
skill brings them into the same ranked list as everything else (`job-hunt/jobs.json`) via
`job-hunt/inbox-jobs.json`.

## What's already automatic

The job-search script reads **11 Telegram job channels** (the same posts most Instagram job pages
publish) and **4 fresher-job sites** on every run, with no browser needed. Add more channels with
`"telegram_channels": ["handle", …]` and feeds with `"job_feeds": ["https://…/feed/"]` in
`profile.json`. For startups across Indian cities, run the search with
`--cities india` (Bengaluru, Hyderabad, Pune, Chennai, Mumbai, Delhi, Gurugram, Noida, Kochi,
Ahmedabad, Jaipur, Kolkata, Coimbatore, Thiruvananthapuram) or `--cities "Pune,Kochi"`.

This skill covers what needs a browser or the user's eyes.

## 1. Sources to read

Use the user's browser (Claude in Chrome preferred, it has their sign-ins; else the built-in
browser). Read-only: never like, follow, comment, DM or apply from these pages.

- **Instagram job pages**: the handles in `profile.instagram_pages`; if none, ask the user which
  pages they follow (one question) and save them. Open `https://www.instagram.com/<handle>/` and
  read the latest 12–20 posts (caption + the image text, which you can read from a screenshot).
  Instagram requires sign-in for most of this; if it shows a login wall, ask the user to sign in
  in that browser once. Cap: ~30 Instagram page loads per run, human pace (3–5 s), and stop at any
  "unusual activity", checkpoint or CAPTCHA screen. Automated browsing is against Instagram's
  terms, so keep it light; the user can set `"instagram_page_budget": 0` to skip.
- **Wellfound** (`wellfound.com/jobs`, filter by role + city), **Instahyre**, **Cutshort**,
  **Hirist**, **Naukri** (CAPTCHA-protected for scripts, fine in a real browser): search the user's
  target titles for their cities; read the listing pages.
- **Startup directories**: `ycombinator.com/companies` filtered to India + hiring, Inc42/Tracxn
  city lists. Collect the company names, then let the job-search script find their boards:
  `--detect "Name1,Name2,…"` (boards found are remembered).
- **Anything the user pastes or screenshots** (a WhatsApp forward, a post): extract it the same way.

## 2. Extract each opening

From each post: company, role, location / remote, batch or years required, stipend/CTC if stated,
apply link, deadline, and the post URL. One post can list several roles; make one entry each.
"Link in bio" means: open the profile's bio link and find the specific role there.

## 3. Verify before keeping (this is what makes it worth doing)

Social job posts are often stale, reposted, affiliate-linked or fake. For each opening:
1. **Find the official posting**: the company's careers site / ATS (Greenhouse, Lever, Workday,
   Keka, Darwinbox…) or the company's own LinkedIn job. Search
   `"<Company>" careers "<role>"` if the post only has a shortener or an aggregator link. Use the
   official URL as `url`; keep the post as `via`.
2. **Drop it** if it's closed, older than ~30 days, for a batch the user isn't in (compare with
   `profile.graduation`), or not findable anywhere official. In that case keep it only if the
   post itself is from the company's own verified account, and say so.
3. **Scam check: drop and warn** if it asks for any payment (registration/training/"refundable"
   fee), asks to apply only via WhatsApp/Telegram DM, promises a guaranteed job or "direct
   joining", uses a free email domain for a big company, or the company can't be found at all.

## 4. Add to the inbox

Append verified openings to `job-hunt/inbox-jobs.json` (a JSON array; create it if missing):

```json
[{ "title": "Software Engineer Intern", "company": "Acme", "location": "Bengaluru",
   "url": "https://jobs.lever.co/acme/…", "via": "https://www.instagram.com/p/…",
   "source": "instagram:<handle>", "posted_at": "2026-11-18",
   "description": "<the post text + key requirements from the official page>" }]
```

`source` is `instagram:<handle>`, `wellfound`, `instahyre`, `cutshort`, `naukri`, `yc`, or
`pasted`. Then re-run the job search (`search_jobs.mjs`; `--sources ats` is enough if the other
sources ran today). It merges the inbox, scores everything the same way (including the batch
check), assigns stable IDs and dedupes against jobs already found.

## 5. Report

Per source: posts read, openings found, verified and added, dropped as stale / wrong batch / scam
(name the scams so the user can avoid those pages). Then show the newly added jobs that score
well and offer to evaluate them (job-evaluate) and find contacts (linkedin-leads).
