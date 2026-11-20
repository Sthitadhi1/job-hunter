---
description: Full automatic job hunt from your resume — matching jobs ranked by interview chance, the best fit, a guaranteed LinkedIn contact per job, resume gaps and fixes, tailored CVs, outreach drafts, filled applications
argument-hint: "[resume path] [preferences, e.g. 'remote or Bangalore, no fintech'] [--top N] [--submit]"
---

Run the whole job-hunter pipeline for the user, start to finish, without stopping for
confirmations. Arguments: $ARGUMENTS

Work in `./job-hunt/`. Track the steps with your task list. Each step uses the plugin skill of
the same name; follow that skill's instructions.

0. **Preflight**: run `node --version`. If Node.js 18+ is missing, follow `/job-hunter:setup`
   (offer to install it) before continuing. The user may be new to all of this, so keep
   explanations plain and short.

1. **resume-profile**: use the resume path in the arguments, an attached resume, or find one
   (job-hunt/, current folder, Downloads, Desktop). Reuse `job-hunt/profile.json` if it exists and
   no new resume was given. Fold the preferences from the arguments into the profile.
2. **job-search**: run the aggregator (pass any company names from the arguments via `--detect`),
   widen with web search for the user's region, sanity-check the top results.
3. **resume-review**: run the gap analysis against the matched jobs and write
   `resume-review.md` (gaps vs market demand, fixes, before/after rewrites).
4. **job-evaluate**: evaluate the top 10 not yet evaluated (with `Blocker:` lines), then
   `rank.mjs --top N` (default 5) to rank by **interview chance** and write `targets.json`.
5. **linkedin-leads**: find people for every target via the user's logged-in browser (web-search
   fallback). **Gate:** `check_leads.mjs` must pass, meaning every target has at least one LinkedIn
   contact. Work down the lead ladder until it does. Then re-run `rank.mjs`.
6. **tailor-cv**: a fact-checked CV PDF per target job, applying the resume-review fixes that are
   true (and a cover letter where the posting asks for one).
7. **cold-outreach**: draft email + LinkedIn note + follow-ups for every lead, record them in the
   tracker, and save email drafts to Gmail if a Gmail connector is available. Never send.
8. **auto-apply**: fill each target job's application with the tailored CV. If the arguments
   include `--submit` or the user's request says to submit, submit them; otherwise stop at the
   review step and ask once, for the whole batch, which to submit.
9. **job-tracker**: `dashboard --open`.

Only pause mid-run for things the user must do personally (signing in to LinkedIn in the browser
pane, an ATS account password, a CAPTCHA). Hand those back in one line and carry on with
everything that doesn't depend on them.

Finish with a short report, in this order:
1. **Best fit to apply to first**: one job, why, its interview chance, and who to message there.
2. **Best bets**: the ranked targets (role, company, interview chance, verdict, LinkedIn contact).
3. **Resume**: score, the top 3 fixes, and the top keyword gaps.
4. What was made: PDFs, filled applications (submitted or waiting), outreach drafts ready to send,
   today's follow-ups.
Suggest `/job-hunter:scan` daily to catch new postings while they're fresh.
