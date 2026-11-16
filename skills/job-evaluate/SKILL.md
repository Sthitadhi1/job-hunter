---
name: job-evaluate
description: Deeply evaluate how well specific jobs fit the user's resume, requirement by requirement, with level, location, work-authorization, compensation and legitimacy checks, give each a 1–5 verdict, then rank them by the chance of actually getting an interview call (fit, competition from LinkedIn applicant counts, posting freshness, reachable contacts) and pick the best bets. Writes job-hunt/evals/<id>.md, evals/README.md and targets.json. Use this whenever the user asks "should I apply", "how good a fit is this job", "rank/compare these jobs", pastes a job link or description, or after a job search to pick which jobs to pursue.
---

# Job evaluation

The search score is keyword matching. This skill is the judgment pass: read the actual job
description against the actual resume and decide whether applying is worth the user's time.

Inputs: `job-hunt/profile.json`, `job-hunt/resume.txt` (source of truth for claims), and jobs from
`job-hunt/jobs.json` / `jobs-archive.json`. A pasted URL or description works too: fetch the
posting (not LinkedIn pages, unless in the user's browser), give it the next free `J###` id, and
add it to `jobs-archive.json`.

Default batch: when called without specific jobs, evaluate the top 10 by score that don't already
have an eval file. Evaluate jobs independently; for 6+ jobs you can split them across parallel
subagents, each writing its own files.

## Per-job report: `job-hunt/evals/<id>.md`

```markdown
# <id> · <title> @ <company>
<location> · <source> · posted <date> · <url>

Verdict: <x.x>/5 · <Apply now | Apply | Stretch | Skip> · <one-line reason>
Blocker: <none | the hard blocker, e.g. "requires 2028 graduates", "no visa sponsorship">

## Requirements
| Requirement | Weight | Evidence from resume | Fit |
|---|---|---|---|
| 3+ yrs backend Python | must | 3 yrs, Acme (FastAPI services) | ✅ |
| Kafka / event streaming | nice | none | ❌ gap |

## Level, location, eligibility
## Compensation
## Legitimacy
## Angle
- Top 3 talking points (resume highlight → requirement it proves)
- Gaps and how to address them honestly
- Keywords to mirror in the CV (only ones the resume can back)
```

How to fill it:

- **Requirements**: list every distinct requirement. Weight = `must` when the JD says required /
  must / minimum or lists it first under requirements; `nice` for preferred / bonus / plus; mark
  your own inference as `inferred` and never let an inferred requirement sink the verdict. Evidence
  must quote or paraphrase something actually in `resume.txt`; if it isn't there, it's a gap.
- **Level / location / eligibility**: years asked vs the user's, title level, on-site/hybrid/remote
  vs `profile.locations`, time-zone limits, and hard blockers: "no visa sponsorship" when the user
  needs it, security clearance, required language, citizenship. A hard blocker caps the verdict
  at 2.0.
- **Compensation**: what the posting says; otherwise a quick web search for the company + role +
  city range (Levels.fyi, Glassdoor, AmbitionBox for India). Compare with `profile.salary_floor`
  if set. Say when it's an estimate.
- **Legitimacy**: is it still open (the search script checked most; re-check if unsure), reposted
  many times, vague or copy-pasted description, a recruiter agency with no client named, requests
  for payment or moving to Telegram/WhatsApp (scam: say so plainly and verdict 1.0).
- **Verdict**: start from the share of `must` requirements met, then adjust for level, location,
  comp and legitimacy. Rough scale: 4.5+ apply now (strong fit, act today); 3.5–4.4 apply; 3.0–3.4
  stretch (apply only with a referral or if the user really wants it); below 3.0 skip.

- **Blocker line**: always write it (`Blocker: none` when there isn't one). Eligibility rules
  in the posting (graduation year, campus-only, CGPA cut-off, years required beyond a stretch,
  citizenship, clearance, sponsorship) are blockers. The ranker zeroes the interview chance for
  any blocker, so be precise.

## Rank by interview chance

After writing the eval files, run:

```bash
node "<this skill's base directory>/scripts/rank.mjs" [--top 5] [--min-verdict 3.5]
```

It scores each job's **chance of an interview call** (0–100: 55% fit verdict, 15% competition
from LinkedIn's applicant count, 15% posting freshness, 10% reachability through LinkedIn leads,
5% applying via the company's own ATS), writes `job-hunt/targets.json` (the best bets) and
`job-hunt/evals/README.md` (a ranked table with reasons). Show the user the best-bets table and
name the single best fit to apply to first, with why. Applying in the first few days and reaching
a person matter as much as fit, so say that when a strong fit is old or crowded.

In the hunt pipeline the targets flow on to linkedin-leads (which re-runs the ranker once
contacts are found), CV tailoring, outreach and apply without asking.
