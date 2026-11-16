# job-hunter

**Upload your resume. Get the jobs most likely to call you back, and a real person to message
at each one.**

A Claude Code plugin that turns your resume into a complete job hunt:

1. **Finds relevant jobs everywhere.** LinkedIn's public listings, 137 company career boards
   (including Amazon, Microsoft, Qualcomm and JPMorgan), any company's careers page, and 12 job
   boards. About 15,000 postings scanned per run, with no API keys.
2. **Ranks them by your chance of an interview call**, not just keyword match: fit with your
   resume (requirement by requirement), eligibility blockers, how many people already applied,
   how fresh the posting is, and whether you can reach someone there. It names **the single best
   fit to apply to first**.
3. **Finds a LinkedIn contact for every job you apply to, without exception:** the job poster,
   hiring manager, a team member, a recruiter or an alumnus. A gate check won't let the pipeline
   move on until each target has one, so your application doesn't sit unseen in an ATS.
4. **Reviews your resume against the jobs you want:** keywords those jobs ask for that your
   resume is missing (with % demand), weak bullets, ATS problems, before/after rewrites, and a plan
   to close real skill gaps.

Plus fact-checked tailored CV PDFs, cold email and LinkedIn-note drafts, filled applications,
interview prep, offer comparison and a tracker dashboard.

```
/job-hunter:hunt path/to/resume.pdf remote or Bangalore
```

```
resume ─► profile ─► ~15k jobs scanned ─► resume gaps ─► fit + interview-chance ranking ─► best bets
                                                                                             │
 dashboard ◄─ applications filled ◄─ outreach drafts ◄─ tailored CVs ◄─ LinkedIn lead for EVERY job
```

## Install

You need [Claude Code](https://claude.com/claude-code) and Node.js 18+. Nothing else: no
`npm install`, no Playwright, no config files. In Claude Code:

```
/plugin marketplace add Sthitadhi1/job-hunter
/plugin install job-hunter@job-hunter-marketplace
```

Restart Claude Code, then run `/job-hunter:hunt` with your resume (PDF, DOCX, TXT or Markdown).
If you don't give a path, it looks for one in the current folder, Downloads and Desktop.

For LinkedIn lead finding and form filling, connect **Claude in Chrome** (it uses the Chrome
you're already signed in to). Without it, the plugin uses Claude's built-in browser (sign in
once) or falls back to web search.

## What you get (in `./job-hunt/`)

| File | |
|---|---|
| `evals/README.md` | **Best bets**: jobs ranked by interview chance, with the reasons |
| `leads.csv` | At least one LinkedIn contact per target job, with likely email and a personal hook |
| `resume-review.md` | Your resume's score, keyword gaps vs your target jobs, fixes and rewrites |
| `jobs.md` | Every matched job (🆕 = new since your last run) |
| `cv/*.pdf` | A tailored, fact-checked CV per target job |
| `outreach/*.md` | Email, LinkedIn note and two follow-ups per contact (you send them) |
| `dashboard.html` | Jobs, pipeline, contacts and follow-ups in one page |

## Commands

| Command | What it does |
|---|---|
| `/job-hunter:hunt [resume] [prefs] [--top N] [--submit]` | Everything, start to finish |
| `/job-hunter:scan [--evaluate] [companies]` | Daily: only jobs new since last run, plus follow-ups due |
| `/job-hunter:followups` | Draft today's follow-ups |

Or just talk: "find jobs for my resume", "should I apply to J012?", "find recruiters at Razorpay",
"tailor my CV for J003", "apply to J003 and J007", "Jane replied", "what's due today?".

## Skills

| Skill | Does |
|---|---|
| `resume-profile` | Reads PDF/DOCX/TXT (finds it in Downloads/Desktop if no path), builds `profile.json` + `resume.txt` |
| `job-search` | LinkedIn public jobs + 137 verified company boards (incl. Amazon, Microsoft, Qualcomm, JPMorgan APIs) + any careers page + 10 job boards + web search; liveness check; stable IDs; new-since-last-run |
| `resume-review` | Keyword gaps vs your matched jobs (demand %), ATS and bullet checks, prioritized fixes, before/after rewrites, gap-closing plan |
| `job-evaluate` | Requirement-by-requirement fit, eligibility blockers, comp, scam/legitimacy check, 1–5 verdict, then ranks by **interview chance** (fit, applicant count, freshness, reachability) |
| `linkedin-leads` | **Mandatory** contact per job via a 9-rung ladder (job poster → hiring manager → team member → recruiter → … → agency recruiter) in your logged-in browser, enforced by `check_leads.mjs`; email pattern + MX + careers inbox |
| `tailor-cv` | Job-specific ATS-friendly CV and cover-letter PDFs via your installed Chrome/Edge, with a **fail-closed** fact check |
| `cold-outreach` | Email + LinkedIn note + 2 follow-ups per lead; Gmail drafts if connected |
| `auto-apply` | Fills Greenhouse/Lever/Ashby/Workable/SmartRecruiters/Easy Apply forms with a reusable answers bank; submits on your go-ahead |
| `job-tracker` | Statuses, follow-up scheduling, funnel stats, outcome analytics (what's working, verdict calibration), single-file HTML dashboard |
| `reply-triage` | Classifies employer replies (pasted or from your inbox) into tracker updates, pulls deadlines, drafts responses, flags scams |
| `interview-prep` | Company/process research, likely questions, resume deep-dives, reusable STAR story bank, live mock interviews with scoring, debriefs |
| `offer-compare` | Year-1 and multi-year comparison incl. RSU/ESOP scenarios, cliffs, Indian CTC breakdown; negotiation plan and counter-offer draft |

## Output (`./job-hunt/`)

`profile.json`, `resume.txt`, `jobs.json`/`jobs.md` (ranked, 🆕 marks new), `jobs-archive.json`,
`companies.json` (boards it discovered for you), `evals/<id>.md`, `leads.csv`, `cv/*.pdf`,
`cover/*.pdf`, `outreach/*.md`, `answers.json`, `tracker.csv`, `dashboard.html`, `analytics.md`,
`interview/<id>.md` + `interview/stories.md`, `replies/`, `offers.json`/`offers.md`.

## Other AI agents (Codex, OpenCode, Cursor, Gemini CLI, Amp …)

The skills are plain Markdown and the scripts plain Node, so they work outside Claude Code too:

```bash
node install.mjs --codex                  # copies the skills into ~/.codex/skills
node install.mjs --workspace ~/job-hunt   # AGENTS.md + GEMINI.md workspace for any agent that reads them
node install.mjs --skills-dir <path>      # any other agent's skills folder
```

Then open that folder in your agent and say "here's my resume, run the job hunt". Browser steps
(LinkedIn leads, filling forms) need the agent to have a browser tool; without one they fall back
to web search and checklists. Not yet tested inside each of those agents.

## Tests

```bash
node --test tests/run.mjs
```

Offline (no network): plugin structure, search scoring/filters/dedupe/stable IDs, the CV fact check
(blocks invented numbers, titles and skills), LaTeX escaping, email patterns and CSV handling,
tracker dates/due/analytics/dashboard, offer math, and the installer. CI runs it on Windows, macOS
and Linux with Node 18 and 22 (`.github/workflows/test.yml`).

## Compared with career-ops

[career-ops](https://github.com/santifer/career-ops) is a large, capable, widely used system
(40+ modes). job-hunter goes for doing the whole loop automatically with zero setup. Comparison
based on career-ops' README (not a head-to-head benchmark):

| | career-ops | job-hunter |
|---|---|---|
| Setup | `npx … init`, `npm install`, `npx playwright install chromium`, YAML profile + portals, write `cv.md` | Install the plugin. Give it your resume file. |
| Profile | `intake` builds it from files you put in `documents/` (confirms before writing); you also keep a `cv.md` | Parsed from your existing PDF/DOCX, found automatically in Downloads/Desktop |
| LinkedIn jobs | Paste alert emails / `linkedin-import.mjs` | Searched directly (public listings, full descriptions) |
| Preconfigured companies | 100+ | **137 verified live**, incl. Amazon, Microsoft, Qualcomm, JPMorgan search APIs |
| Source/provider modules | **55+** (ATS APIs, board feeds, RSS, local parsers) | ~30: 13 ATS types, 3 big-employer APIs, 12 job boards/feeds, careers-page JSON-LD crawler |
| Finding a company's board | `discover` maps names to ATS boards | `--detect` (ATS probe + careers-page crawl, flags Workday/iCIMS/Taleo sites for the browser), remembered for next time |
| Finding people | `contacto` finds hiring manager / recruiter / peer and drafts a ≤300-char LinkedIn note | Same roles, plus "Meet the hiring team" and the company People tab in your signed-in browser |
| Emails | No email-address finding mentioned in its README | Pattern + MX check + company's published careers inbox, confidence-labelled |
| CV PDF | Playwright + Chromium download; fact check warns, not fail-closed | Your installed Chrome/Edge; fact check **blocks** invented numbers, skills, employers |
| Outreach | Draft in chat | Files per lead + Gmail drafts + follow-up dates scheduled |
| Applications | Fills, never submits | Fills, and submits when you say so (`--submit` or one batch "yes") |
| Daily use | Run `scan`, review pipeline | `/job-hunter:scan` shows only new jobs + due follow-ups; schedulable |
| Dashboard | Go TUI (needs Go to build) | Single HTML file, opens in any browser |
| Pipeline | Several commands with checkpoints | One command, runs end to end |
| Interview prep / mock interviews | Yes (plan, practice, debrief, red flags) | Yes (research, questions, story bank, scored mocks, debrief) |
| Offer comparison | `ofertas`, `offer-prep` | `offer-compare` with a multi-year equity-scenario calculator + negotiation drafts |
| Reply classification | `reply-watch` | `reply-triage` (paste or inbox), scam flagging |
| LaTeX CV | Yes | Yes (`--latex`; compiles if a TeX engine is installed, else Overleaf-ready `.tex`) |
| Outcome analytics | Rejection patterns, channel advance rates, score calibration | By source, score, verdict (calibration), channel and contact type, with recommendations |
| Other AI CLIs | ~10 agents with native configs | AGENTS.md/GEMINI.md workspace + Codex skills installer (not yet tested in each agent) |
| Automated tests | Yes | 10 offline tests, CI on 3 OSes |

Still ahead in career-ops: about twice as many source providers, batch workers, extra modes
(upskill/training plans, unposted-role pitches, regional calibration), native configs for each
CLI, and a large real-world user base. job-hunter is new: its browser steps (LinkedIn leads,
form filling) are only now being run end to end.

## Where jobs come from

No keys needed: LinkedIn public job search · ATS boards: Greenhouse, Lever, Ashby,
SmartRecruiters, Workable, Recruitee, Rippling, Gem, Teamtailor, Personio, BambooHR, Breezy,
Pinpoint · big-employer APIs: Amazon, Eightfold (Microsoft, Qualcomm), Oracle HCM (JPMorgan) ·
company careers pages (embedded boards + schema.org JobPosting) · Himalayas · Jobicy ·
WeWorkRemotely · Working Nomads · NoDesk · Remotive · RemoteOK · Arbeitnow · HN "Who is hiring?" ·
YC startup job posts · web search and your browser (Naukri, Wellfound, Instahyre, Cutshort,
Workday/iCIMS/Taleo career sites…).

Workday sites block scripted requests, so they're read through the browser. Every provider except
BambooHR, Breezy and Pinpoint has been run against a live board. Those three follow their APIs'
documented formats, but no bundled company uses them yet.

Optional keys for more: `RAPIDAPI_KEY` (JSearch: Indeed, Glassdoor, Naukri via Google for
Jobs), `ADZUNA_APP_ID`/`ADZUNA_APP_KEY`, `HUNTER_API_KEY` (verified emails).

## Things to know

- **LinkedIn**: lead finding browses LinkedIn in *your* signed-in browser, paced like a person
  (~40 pages/run cap). Automated browsing is against LinkedIn's terms, so there's some risk to the
  account; it stops at any security checkpoint rather than trying to get around it. Lower the cap
  with `"linkedin_page_budget"` in `profile.json`, or set it to 0 to use web search only.
- **Nothing is sent for you.** Emails and LinkedIn notes are drafted; you send them.
- **You handle** ATS passwords/account creation, CAPTCHAs and verification codes.
- Personal data stays in `./job-hunt/` on your machine.

## Scripts (usable directly)

```bash
node skills/job-search/scripts/search_jobs.mjs --profile job-hunt/profile.json --detect "Razorpay,Swiggy"
node skills/linkedin-leads/scripts/email_finder.mjs --leads job-hunt/leads.csv
node skills/tailor-cv/scripts/make_pdf.mjs --cv job-hunt/cv/J003.json --source job-hunt/resume.txt --out job-hunt/cv/J003.pdf
node skills/job-tracker/scripts/tracker.mjs dashboard --open
```

## Contributing

Issues and pull requests are welcome. Good first contributions:
- **Add a company:** append `{ "name", "ats", "token" }` to `skills/job-search/data/companies.json`
  after checking the board returns jobs (`--detect "Company"` prints the token).
- **Add a source:** a new `case` in `fetchAts` or an entry in `sources` in `search_jobs.mjs`, plus a
  fixture-based test.
- Run `node --test tests/run.mjs` before opening a PR.

## Disclaimer

job-hunter helps you search and apply, but you're responsible for how you use it. Respect the
terms of the sites it reads (LinkedIn especially: keep the page budget low), only send
outreach you'd be comfortable receiving, and never let it claim experience you don't have.
Licensed under MIT.
