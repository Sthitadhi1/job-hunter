---
description: Quick daily scan, showing only jobs that are new since the last run, plus follow-ups due today
argument-hint: "[--evaluate] [extra companies to check]"
---

Daily check for the user's job hunt. Arguments: $ARGUMENTS

1. If `job-hunt/profile.json` doesn't exist, run the full `/job-hunter:hunt` flow instead.
2. Run the **job-search** aggregator (pass any company names in the arguments via `--detect`).
   Don't do the web-search widening unless fewer than 5 new jobs turned up.
3. Show only jobs with `"new": true` in `job-hunt/jobs.json`, as a compact table (ID, score,
   role, company, location, link). If there are none, say so in one line.
4. If the arguments include `--evaluate`, run **job-evaluate** on the new jobs scoring 50+.
5. Run the **job-tracker** `due` command and list follow-ups due today, with the drafted follow-up
   text for each (from `job-hunt/outreach/`).
6. Regenerate the dashboard (`tracker.mjs dashboard`), without opening it.

Keep the output short; this is meant to be run every morning. To run it automatically, the user
can schedule it, e.g. with `/schedule` "every weekday at 9am run /job-hunter:scan".
