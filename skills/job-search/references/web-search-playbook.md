# Web search playbook for jobs

Substitute `<title>` (a target title in quotes), `<skill>` (a primary skill), `<city>` and
`<company>`. Add the current month/year or "hiring" to bias toward fresh posts. Run the queries
that match the user's region and seniority; you don't need all of them.

## Global job boards and ATS pages

- `site:linkedin.com/jobs/view "<title>" "<city>"`: LinkedIn job pages (read the snippet, don't fetch)
- `site:boards.greenhouse.io OR site:job-boards.greenhouse.io "<title>" "<city>"`
- `site:jobs.lever.co "<title>" "<city>"`
- `site:jobs.ashbyhq.com "<title>" "<city>"`
- `site:myworkdayjobs.com "<title>" "<city>"`: large enterprises on Workday
- `site:jobs.smartrecruiters.com "<title>" "<city>"`
- `site:apply.workable.com "<title>"`
- `site:wellfound.com/jobs "<title>"`: startups (formerly AngelList)
- `site:ycombinator.com/companies "<title>" jobs`: YC startups
- `site:builtin.com/job "<title>"`: US tech
- `"<title>" "<skill>" "remote" jobs <month year>`

## India

- `site:naukri.com "<title>" "<city>"`
- `site:instahyre.com "<title>"`
- `site:cutshort.io/job "<title>"`
- `site:hirist.tech "<title>"`
- `site:iimjobs.com "<title>"` (management / analytics roles)
- `site:foundit.in "<title>" "<city>"`
- `"<company>" careers "<title>" Bangalore OR Bengaluru OR Hyderabad OR Pune OR Gurugram`

## Europe / UK

- `site:otta.com OR site:welcometothejungle.com "<title>"`
- `site:stepstone.de "<title>"` / `site:totaljobs.com "<title>"`
- `site:eu-startups.com jobs "<title>"`

## Finding a specific company's careers page or ATS

- `"<company>" careers "<title>"`
- `"<company>" site:boards.greenhouse.io OR site:jobs.lever.co OR site:jobs.ashbyhq.com`

If the result shows an ATS URL like `jobs.lever.co/<token>` or `boards.greenhouse.io/<token>`,
add `{ "name": "<company>", "ats": "lever", "token": "<token>" }` to `profile.target_companies` so
the script pulls that company's full board next time.

## Signals a posting is stale or low quality

- "No longer accepting applications", "This job has expired", or a 404 on the employer page
- Aggregator copies with no employer name, or "confidential client" with no details
- Postings that ask for payment, or ask you to move the conversation to Telegram/WhatsApp
  (common job scams: warn the user)
