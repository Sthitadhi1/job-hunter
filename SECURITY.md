# Security and privacy

job-hunter is a set of Markdown skill files plus a few plain Node.js scripts. There is no build
step, no dependency tree, no install script, and no binary. Everything below can be checked by
reading the files in `skills/*/scripts/` (about 2,100 lines in total).

## What runs on your machine

| Script | What it does | Network | Runs other programs |
|---|---|---|---|
| `job-search/scripts/search_jobs.mjs` | Fetches public job listings, scores them, writes `job-hunt/jobs.*` | Yes, public job APIs and career pages (list below) | No |
| `linkedin-leads/scripts/email_finder.mjs` | Guesses work-email formats, checks a domain's MX record, reads the company's own site for a published careers@ address | DNS lookups, the company website, Hunter.io only if you set `HUNTER_API_KEY` | No |
| `linkedin-leads/scripts/check_leads.mjs` | Checks every target job has a contact in `leads.csv` | No | No |
| `job-evaluate/scripts/rank.mjs` | Ranks evaluated jobs by interview chance | No | No |
| `resume-review/scripts/resume_gaps.mjs` | Compares your resume text with matched jobs | No | No |
| `tailor-cv/scripts/make_pdf.mjs` | Builds CV/cover-letter PDFs with a fact check | No | Your installed Chrome/Edge/Chromium in headless mode to print the PDF; a TeX engine only with `--latex` and only if installed |
| `job-tracker/scripts/tracker.mjs` | Tracker, follow-ups, analytics, dashboard HTML | No | Your default browser, only with `--open` |
| `offer-compare/scripts/offer_calc.mjs` | Offer arithmetic | No | No |
| `install.mjs` | Copies skills into another agent's folder (optional, for Codex etc.) | No | No |

Programs are always started with an argument list (`execFile`), never through a shell string.

## Sites the scripts contact

Only public, unauthenticated endpoints, plus three optional keyed APIs you'd have to set up yourself:

- **LinkedIn public job listings:** `www.linkedin.com/jobs-guest/...` (the logged-out job search
  anyone can see; no account, no cookies). Paced with pauses between requests.
- **Company ATS boards:** `boards-api.greenhouse.io`, `api.lever.co`, `api.ashbyhq.com`,
  `api.smartrecruiters.com`, `apply.workable.com`, `<company>.recruitee.com`, `ats.rippling.com`,
  `api.gem.com`, `<company>.teamtailor.com`, `<company>.jobs.personio.de`,
  `<company>.bamboohr.com`, `<company>.breezy.hr`, `<company>.pinpointhq.com`.
- **Big-employer career APIs:** `www.amazon.jobs`, `apply.careers.microsoft.com`,
  `careers.qualcomm.com`, `jpmc.fa.oraclecloud.com`.
- **Job boards:** `himalayas.app`, `jobicy.com`, `weworkremotely.com`, `www.workingnomads.com`,
  `nodesk.co`, `remotive.com`, `remoteok.com`, `www.arbeitnow.com`, `hn.algolia.com`.
- **Telegram public channel previews:** `t.me/s/<channel>` for the job channels in
  `skills/job-search/data/telegram.json` (plus any you add). This is the public web view; no
  Telegram account is used.
- **Fresher-job sites (RSS):** `offcampusjobs4u.com`, `www.freshersnow.com`, `fresherjobinfo.in`,
  `www.enggwave.com` (`skills/job-search/data/feeds.json`, plus any you add).
- **Apply links found in those posts:** the top results' links are opened once to follow
  shorteners (tinyurl, bit.ly, partner redirects) to the real careers page and check the job is
  still open.
- **Company websites:** a careers page you or the skill names (`--crawl`/`--detect`), to find
  which job board it uses; for email formats, the company's home/careers/contact pages.
- **Optional, only if you set the key:** `jsearch.p.rapidapi.com` (`RAPIDAPI_KEY`),
  `api.adzuna.com` (`ADZUNA_APP_ID`/`ADZUNA_APP_KEY`), `api.hunter.io` (`HUNTER_API_KEY`;
  sends a name + company domain to look up an email).

**Your resume is never uploaded by the scripts.** Search requests contain only job titles,
skills and locations from your profile. Nothing is sent to the plugin author or any analytics
service; there is no telemetry.

## What Claude does with the skills

The skill files instruct Claude (in your session, with your permissions) to:
- **Read** LinkedIn through *your* signed-in browser to find contacts. It's read-only: it never
  clicks Connect, Message or Follow, caps page loads (about 40 per run, `linkedin_page_budget`), and
  stops at any security checkpoint or CAPTCHA instead of trying to get past it. Automated
  browsing is against LinkedIn's terms, so lower the budget or set it to 0 (web search only) if
  you're cautious about your account.
- **Read** Instagram job pages (and Wellfound, Instahyre, Cutshort, Naukri) in your browser
  when you use the `social-jobs` skill. It's read-only (no likes, follows, comments or DMs),
  capped (about 30 Instagram page loads per run, `instagram_page_budget`, 0 to skip), stops at
  any checkpoint, and keeps a job only after finding it on the company's official careers page.
  Posts asking for any fee are dropped and flagged as likely scams.
- **Never send** emails, LinkedIn messages or connection requests. It writes drafts; you send them.
- **Never submit** a job application unless you approve it in the conversation (or pass `--submit`).
- **Never enter passwords**, create accounts, solve CAPTCHAs or handle verification codes. Those
  are handed back to you.
- **Never invent** experience: the CV builder refuses to produce a PDF containing numbers,
  employers, titles or skills that aren't in your original resume.

## Your data

Everything is written to a `job-hunt/` folder in the directory you run Claude from: your resume
text, profile, jobs, contacts, CVs and tracker. It stays on your machine. The repo's
`.gitignore` excludes `job-hunt/` so it can't be committed by accident. Delete the folder to
remove it all.

## Reporting a problem

If you find a security or privacy issue, please open a GitHub issue (for anything sensitive, ask
for a private contact in the issue rather than posting details). Each release is tagged; pin a
tag (`Sthitadhi1/job-hunter#v3.2.0`) if you want to install exactly the version you reviewed.
