---
name: linkedin-leads
description: Guarantee at least one LinkedIn contact for every job the user is applying to (mandatory lead gate with a 9-rung search ladder), so no application goes unnoticed. Finds the right people (the job poster, hiring manager, team member, recruiter, alumni, founder) by browsing LinkedIn with the user's own logged-in browser (company People tab, "Meet the hiring team", hiring posts), falling back to web search, then work out each person's work email from the company's email pattern. Writes job-hunt/leads.csv. Use this whenever the user wants LinkedIn leads, contacts, recruiters, hiring managers, referrals, "who should I reach out to", or emails at companies they're applying to, even if they only say "find people at Stripe" or "get me contacts for these jobs".
---

# LinkedIn leads (automated)

Goal: **every target job gets at least one real person on LinkedIn** to reach out to, so the
application doesn't sit unseen in an ATS. Aim for 2–3 per job, each currently employed there,
with a LinkedIn profile URL, their role relative to the job, a best-guess work email with an
honest confidence label, and a personal hook, all saved to `job-hunt/leads.csv`. Run end to end
without stopping to ask; report at the end.

Inputs: the targets in `job-hunt/targets.json` (written by job-evaluate's `rank.mjs`), or job IDs
the user names. Job details come from `job-hunt/jobs-archive.json` / `jobs.json`.

## The lead gate: this step isn't done until it passes

```bash
node "<this skill's base directory>/scripts/check_leads.mjs"
```

Exit 0 means every target has a lead with a `linkedin.com/in/` URL. Exit 1 lists the jobs
without one and the `next_rungs` still untried. Keep going down the ladder (section 4) for those
jobs and re-run the check until it passes. Outreach, CV tailoring and auto-apply wait for this
gate. A job can be waived only when every rung was genuinely tried: record it in
`job-hunt/lead-exceptions.json` as `{"J012": {"tried": "job_poster,hiring_manager,...all rungs", "why": "..."}}`.
That should be rare. Almost every employer has *someone* on LinkedIn, and confidential postings
have an agency recruiter.

## 1. Pick a browser

LinkedIn shows the most when signed in, so use the user's own logged-in browser:

1. **Claude in Chrome** (tools `mcp__claude-in-chrome__*`): the user's real Chrome, usually already
   signed in to LinkedIn. Load the tools in one ToolSearch call:
   `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__get_page_text,mcp__claude-in-chrome__find,mcp__claude-in-chrome__read_page`.
   Work in a new tab you create, not the user's open tabs.
2. **Built-in browser** (tools `mcp__Claude_Browser__*`): if Chrome isn't connected. If LinkedIn
   shows a sign-in page there, ask the user once to sign in in the browser pane (it stays signed
   in for next time), then continue.
3. **No browser**: use the web-search method in step 3b only.

Pace it like a person: wait ~3–5 seconds between LinkedIn page loads and cap a run at about 40
LinkedIn page loads (`profile.linkedin_page_budget` overrides). This protects the user's account,
because LinkedIn restricts accounts that browse at machine speed. If LinkedIn shows a security
checkpoint, CAPTCHA, or an "unusual activity" warning, stop using LinkedIn for this run, tell the
user, and finish the remaining jobs with web search. Don't try to get past those screens.

Read-only on LinkedIn: don't click Connect, Message, Follow or Apply here. Sending is the user's
step (cold-outreach drafts the text).

## 2. Find people in the browser (preferred)

For each job, in this order, stopping once you have 2–3 good leads:

1. **The job poster.** For LinkedIn jobs, open `https://www.linkedin.com/jobs/view/<id>` (the
   job's `url`). Signed-in pages often show **"Meet the hiring team"** with the person who posted
   it. That's the single best lead; take name, title and profile link.
2. **Company People tab (current employees only).** Find the company's LinkedIn slug (the
   company link on the job page, or search `site:linkedin.com/company "<Company>"`), then open
   `https://www.linkedin.com/company/<slug>/people/?keywords=<term>` with terms that match the
   job, for example:
   - hiring manager: `engineering manager <team>`, `head of <function>`, `<team> lead`
   - recruiter: `technical recruiter`, `talent acquisition`, `recruiter <city>`
   - peer: the target job title, or the user's university / past employer (warm connection)
   Read the result cards with `get_page_text` (or `find` for profile links). Prefer people in the
   job's region and team.
3. **Hiring posts.** `https://www.linkedin.com/search/results/content/?keywords=<Company> hiring <title>&datePosted=%22past-month%22`.
   People posting "we're hiring" for this role are the warmest leads, and the post is the hook.
4. Open a lead's profile only when you need to confirm their team or find a hook (recent post,
   shared school or employer). Keep profile visits few; each one notifies the person.

## 3b. Web-search fallback (no browser, or LinkedIn blocked)

Use WebSearch and read titles/snippets (don't fetch linkedin.com pages):
- `site:linkedin.com/in "<Company>" ("engineering manager" OR "head of engineering") "<team or skill>"`
- `site:linkedin.com/in "<Company>" ("technical recruiter" OR "talent acquisition") "<city or country>"`
- `site:linkedin.com/in "<Company>" (founder OR co-founder OR CTO)` for startups
- `site:linkedin.com/posts "<Company>" hiring "<title>"`
Result titles look like `Jane Doe - Engineering Manager - Stripe | LinkedIn`. Keep a lead only if
the snippet shows they **currently** work there; otherwise mark `notes: verify current role`.
Team pages, engineering blogs, GitHub org members and conference talks also name team leads and
give good hooks.

## 4. The lead ladder (work down it until the job has a lead)

| Rung (`role_type`) | Where to look |
|---|---|
| `job_poster` | "Meet the hiring team" on the LinkedIn job page; names in the posting itself |
| `hiring_manager` | People tab: `engineering manager <team>`, `head of <function>`, `<team> lead` |
| `team_member` | People tab: the job's title or team name; best referral path |
| `recruiter` | People tab: `technical recruiter`, `talent acquisition`, `campus recruiter` (for intern/new-grad roles), `recruiter <city>` |
| `hiring_post` | LinkedIn content search: `<Company> hiring <title>` (past month) |
| `alumni` | People tab: the user's college or past employer (from profile.json): warmest hook |
| `any_engineer` | People tab: `software engineer`, `developer`, `tech lead` at that office |
| `founder_or_exec` | Founder, CTO, VP/head of engineering (small companies especially) |
| `agency_recruiter` | Confidential/agency postings (e.g. "for one of our clients"): the agency's recruiter for that role |

Each rung has a web-search fallback (`site:linkedin.com/in "<Company>" "<term>"`) when the browser
can't be used. Keep the best 2–3 per job, highest rung first. More people at the same company
dilutes every message and looks like spam when they compare notes.

## 5. Email pattern and leads.csv

1. Domain: from the job/careers URL or company site. Watch for mail domains that differ from the
   marketing site.
2. Pattern: WebSearch `"@<domain>" email format` or `"<Company>" email format first.last`. Sites like
   RocketReach, LeadIQ and Prospeo show the dominant pattern in their snippets ("first.last (78%)").
   Convert to the script syntax: `{first}.{last}`, `{f}{last}`, `{first}`, `{first}{l}`, …
3. Write/append `job-hunt/leads.csv` (no duplicate people):
   ```
   job_id,company,job_title,domain,pattern,name,first_name,last_name,title,role_type,linkedin_url,location,hook,source,notes
   ```
   `role_type` is the ladder rung the person came from (`job_poster`, `hiring_manager`,
   `team_member`, `recruiter`, `hiring_post`, `alumni`, `any_engineer`, `founder_or_exec`,
   `agency_recruiter`). `hook` is one specific, true
   thing to open with; leave it blank rather than invent one. `source` is where you found them.
4. Fill emails in place (MX check, Hunter if `HUNTER_API_KEY` is set, pattern ranking, and the
   company's published hiring inbox as a fallback):
   ```bash
   node "<this skill's base directory>/scripts/email_finder.mjs" --leads job-hunt/leads.csv
   ```
   Confidence labels: `hunter score N` (verified by Hunter), `pattern (...)` (from a found pattern,
   usually right), `guess (common pattern, unverified)` (often wrong: prefer LinkedIn for these
   people), `no-mx` (wrong domain). `hiring_inbox` is a careers@/jobs@ address when the company
   publishes one.

## 6. Gate, re-rank, report

1. Run `check_leads.mjs` until it passes (see the top of this skill).
2. Re-rank, since reachable jobs have better odds:
   `node "<job-evaluate base>/scripts/rank.mjs"` (the sibling `job-evaluate` skill folder).
3. Report per job: name (linked), title, rung, email + confidence, hook, and the updated interview
   chance. Say which browser was used, how many LinkedIn pages were loaded, and anything that
   stopped early (checkpoint, sign-in needed). Then continue to **cold-outreach** if running
   inside the hunt pipeline.
