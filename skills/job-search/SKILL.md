---
name: job-search
description: Search the internet for open jobs that match the user's resume profile across LinkedIn's public job search, 137 verified company career boards (Greenhouse, Lever, Ashby, SmartRecruiters, Workable, Recruitee, Rippling, Gem, Teamtailor, Personio, BambooHR, Breezy, Pinpoint), big-employer career APIs (Amazon, Microsoft, Qualcomm, JPMorgan), any company's own careers page, Himalayas, Jobicy, WeWorkRemotely, Working Nomads, NoDesk, Remotive, RemoteOK, Arbeitnow, Hacker News Who's Hiring, YC startup job posts and targeted web searches; checks postings are still open, scores, dedupes, flags what's new since the last run and ranks everything into job-hunt/jobs.md. No API keys needed. Use this whenever the user wants to find jobs, openings, roles or positions that fit their resume or skills, asks "who is hiring for X", wants jobs at specific companies, or wants to refresh or check for new job matches.
---

# Job search

Goal: a ranked, deduplicated list of real, currently open jobs that fit the candidate, with
direct apply links, in `job-hunt/jobs.json` + `job-hunt/jobs.md`. Run it end to end without asking.

Prerequisite: `job-hunt/profile.json`. If it's missing, run **resume-profile** first.

## 1. Run the aggregator

From the user's working directory (where `job-hunt/` lives):

```bash
node "<this skill's base directory>/scripts/search_jobs.mjs" --profile job-hunt/profile.json
```

It takes 1–2 minutes and prints a JSON summary per source. What it does by itself:
- Searches LinkedIn's public job listings for each target title × location (with full
  descriptions), all 137 bundled company boards (including Amazon, Microsoft, Qualcomm and JPMorgan search APIs), and the remote/HN/YC boards.
- Drops postings that say they're closed, and re-checks the top results from feeds that can go stale.
- Keeps **stable job IDs** across runs (`J003` stays `J003`) and marks jobs first seen this run as
  `new` (🆕 in jobs.md). `jobs-archive.json` keeps every job ever matched.

Flags:

| Flag | Default | Use |
|---|---|---|
| `--detect "A,B"` | | Find these companies' job boards by name (ATS probe + careers-page crawl) |
| `--crawl "url,url"` | | Crawl careers page URLs for embedded boards / JobPosting data |
| `--min-score N` | 35 | Raise to 50 for a tighter list, lower to 25 when results are thin |
| `--days N` | 45 | Max posting age (also sets LinkedIn's date filter) |
| `--sources a,b` | all | Subset of `linkedin,ats,himalayas,jobicy,wwr,workingnomads,nodesk,remotive,remoteok,arbeitnow,hn,ycjobs,jsearch,adzuna` |
| `--linkedin-pages N` | 3 | LinkedIn result pages per query × location (10–25 jobs each) |
| `--no-verify` | | Skip the liveness re-check |
| `--verbose` | | Show which company boards failed |

Companies found with `--detect`/`--crawl` are saved to `job-hunt/companies.json` and searched
automatically on every later run.

**Companies the user names**: pass them all to `--detect`. For any reported "not found", WebSearch
`"<Company>" careers jobs` to get the careers URL and rerun with `--crawl <url>`. If the crawl
still finds nothing, or reports a Workday/iCIMS/Taleo/SuccessFactors/Darwinbox/Keka site (these block scripts or need JavaScript), open the careers page in the browser
(Claude in Chrome or the built-in browser), read the listings with `get_page_text`, and add
matching jobs to `jobs.json` yourself (same fields, `source: "careers-page"`, next free `J###`
from `job-hunt/.seen.json`'s `next`).

Optional keys add even more coverage if the user has them: `RAPIDAPI_KEY` (JSearch / Google for
Jobs: Indeed, Glassdoor, Naukri…) and `ADZUNA_APP_ID`+`ADZUNA_APP_KEY`. Mention them once, at
most.

## 2. Widen with web search and the browser

Sources with no public feed (Naukri, Instahyre, Wellfound, Cutshort, Workday sites, Indeed) are
reached by web search, or by the user's browser when it's connected. Run the 4–8 most relevant
queries from `references/web-search-playbook.md` for the user's region and level. For good hits,
prefer the employer's own posting URL, skip stale ones, and add them to `jobs.json` as above with
`source: "web:<site>"`. Naukri blocks scripts with a CAPTCHA, so read it through the browser or
web search only.

## 3. Review and present

Sanity-check the top ~25: keyword scoring can't tell a "Software Engineer" title that's really
sales engineering, a location the user can't work in, or a stack only mentioned in passing.
Re-rank or drop those. Show the top 10–15 (new ones marked) as:

| ID | Score | Role | Company | Location | Why it fits | Gaps |

Then continue: inside the hunt pipeline, go straight to **job-evaluate** on the top 10. On its
own, offer evaluation, leads and outreach as next steps.
