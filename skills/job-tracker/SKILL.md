---
name: job-tracker
description: Track job applications and outreach (applied, sent, replied, interview, offer, rejected), compute and list follow-ups that are due, show funnel stats, and build a single-file HTML dashboard of jobs, pipeline, leads and follow-ups. Use this whenever the user reports progress ("I applied to J003", "Jane replied", "got an interview at Stripe"), asks what follow-ups are due, wants their job hunt status or stats, or wants the dashboard.
---

# Job tracker

All state lives in `job-hunt/tracker.csv` (one row per application and per outreach thread).
The script keeps dates consistent, so use it rather than editing the CSV by hand:

```bash
T="<this skill's base directory>/scripts/tracker.mjs"
node "$T" set --job J003 --status applied                                  # application row
node "$T" set --job J003 --lead "Jane Doe" --channel email --status sent --email jane@acme.com
node "$T" set --job J003 --lead "Jane Doe" --status replied --note "call Thursday"
node "$T" due                      # follow-ups due today or overdue
node "$T" stats                    # funnel: applications, outreach sent, reply rate, interviews, offers
node "$T" analyze                  # what's working: by source, score, verdict, channel, contact type -> analytics.md
node "$T" dashboard --open         # job-hunt/dashboard.html, opens in the browser
```

Statuses: `drafted`, `ready`, `applied`, `sent`, `follow-up-1`, `follow-up-2`, `replied`,
`interview`, `offer`, `rejected`, `ghosted`, `withdrawn`, `do-not-contact`.

- Marking outreach `sent` schedules follow-up 1 (+4 business days) and follow-up 2 (+9).
  Marking an application `applied` schedules a check-in at +7 business days.
- Map what the user says to statuses: "I sent the emails" → `sent` for each drafted email
  lead; "no reply after 2 follow-ups" → `ghosted`; "they said don't contact me" → `do-not-contact`
  (never draft to them again).

## Follow-ups due

Run `due`. For each item, draft the follow-up: use the one already in
`job-hunt/outreach/<file>.md` if present, adjusted for anything new; otherwise write a 2–3
sentence reply on the same thread that adds one new thing (a relevant project, a thought about
their product) and restates the ask. After the user sends them, set `follow-up-1`/`follow-up-2`.

## Analytics

Run `analyze` once there are 10+ jobs with outcomes, or whenever the user asks what's working. It
writes `job-hunt/analytics.md`: funnel, response/interview rates by job source, search score,
evaluation verdict and outreach channel/contact type, median time to first response, silent
threads, and recommendations (only for groups with 5+ data points). Act on them: if verdicts
don't predict interviews, say what to change in how jobs are chosen; if a channel or source
underperforms, shift effort. Employer replies feed these numbers, so run **reply-triage** first if
there are unprocessed replies.

## Dashboard

`dashboard --open` regenerates the HTML from `jobs.json`, `evals/`, `tracker.csv` and `leads.csv`:
KPIs, then tabs for jobs (with verdicts), pipeline, follow-ups due, and leads, all filterable and
sortable. Regenerate it after any pipeline run or status change.
