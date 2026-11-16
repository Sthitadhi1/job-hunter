---
name: resume-profile
description: Turn a resume (PDF, DOCX, TXT or Markdown) into a structured candidate profile (profile.json) with target titles, skills, seniority, locations and quantified highlights that the job search and outreach skills use. Use this whenever the user uploads, attaches or points to a resume or CV, asks to "analyze my resume", "what jobs fit my resume", or starts any job hunt, even if they don't mention a profile. Run it before job-search if job-hunt/profile.json doesn't exist yet or the resume has changed.
---

# Resume → candidate profile

The rest of the job-hunter plugin (job-search, linkedin-leads, cold-outreach) reads one file:
`job-hunt/profile.json` in the current working directory. This skill creates it. A good profile is
the single biggest lever on result quality: the search script matches job titles and skills
literally, so vague or padded entries produce noisy results.

## 1. Read the resume

- **PDF**: read it directly with the Read tool (use `pages` for long files).
- **DOCX**: it's a zip. Extract the text:
  - Windows / macOS: `tar -xOf "<resume.docx>" word/document.xml`
  - Linux: `unzip -p "<resume.docx>" word/document.xml`
  Then strip the XML tags (paragraphs end at `</w:p>`). A one-line Node command is fine for that.
- **TXT / MD**: read directly.
- **Attached in chat** but no path: use the content you were given.
- **No path given**: look for one before asking: `job-hunt/resume.*`, then `*resume*`/`*cv*` files
  (pdf, docx, txt, md) in the current folder, then the user's Downloads and Desktop. Use the most
  recent match and say which file you used.
- **No resume anywhere**: build the profile from a short interview (current role, years, top
  skills, target roles, locations).

Save the extracted plain text to `job-hunt/resume.txt` (and copy the original file to
`job-hunt/resume.<ext>`). The CV fact check and the job evaluations treat `resume.txt` as the
source of truth for what the user has actually done.

## 2. Extract the profile

Write `job-hunt/profile.json` (create the folder) with this shape. Every field except
`target_titles` and `skills.primary` is optional, but fill what the resume supports.

```json
{
  "name": "Full Name",
  "email": "from resume",
  "phone": "",
  "linkedin": "https://linkedin.com/in/...",
  "github": "",
  "portfolio": "",
  "headline": "Backend engineer, 3 yrs, Python/FastAPI, payments",
  "years_experience": 3,
  "seniority": "mid",
  "current_role": "Software Engineer at Acme",
  "target_titles": ["Backend Engineer", "Software Engineer", "Python Developer"],
  "skills": {
    "primary": ["Python", "FastAPI", "PostgreSQL", "Docker"],
    "secondary": ["AWS", "Redis", "React"]
  },
  "keywords": ["payments", "microservices", "REST APIs"],
  "industries": ["fintech", "developer tools"],
  "locations": ["Bangalore", "India", "Remote"],
  "country_code": "in",
  "remote_ok": true,
  "open_to_relocate": false,
  "target_companies": [],
  "exclude_companies": ["Current Employer"],
  "exclude_keywords": ["intern"],
  "highlights": [
    "Cut p95 API latency from 900ms to 180ms by adding Redis caching (Acme, 2025)",
    "Built payment reconciliation service handling 2M txns/day"
  ],
  "projects": [{"name": "", "one_liner": "", "url": ""}],
  "education": "B.Tech CSE, XYZ University, 2022",
  "notice_period": "",
  "work_authorization": ""
}
```

How to fill the tricky fields:

- **seniority**: one of `intern`, `junior`, `mid`, `senior`, `staff`, `lead`. Base it on years and
  scope, not the title alone. Roughly: 0–1 yrs junior/intern, 2–4 mid, 5–8 senior, 8+ staff/lead.
  The scorer penalizes jobs that are clearly above or below this level.
- **target_titles**: 3–5 job titles as employers actually write them ("Backend Engineer",
  "Software Engineer II", "Data Analyst"), not personal branding ("Code Craftsman"). Include the
  current title if the user wants a similar role, plus 1–2 natural next steps.
- **skills.primary**: the 4–8 skills the person is strongest in *and* that appear in job posts.
  Use canonical spellings (`PostgreSQL`, `Node.js`, `React`, `C++`, `Kubernetes`). These drive
  scoring, so don't dump every tool ever touched here; put the rest in `secondary`.
- **locations**: cities/countries the person can work in, plus `"Remote"` if they want remote.
  `country_code` is the ISO-2 code for the main country (used by Adzuna, e.g. `in`, `us`, `gb`).
- **highlights**: 3–6 quantified achievements, rewritten as one-liners. Cold emails lean on these,
  so keep the numbers and keep them truthful; never invent metrics that aren't in the resume.
- **exclude_companies**: the current employer, plus anything the user mentions.

## 3. Fill gaps with sensible defaults, then keep going

Don't stop to confirm. Preferences the resume can't tell you get defaults: `locations` = the
resume's city + country + "Remote"; `remote_ok` = true; `open_to_relocate` = false;
`exclude_companies` = the current employer. Fold in anything the user said in their request
("remote only", "no fintech", "Bangalore or Pune"). Show a compact summary (headline, seniority,
target titles, primary skills, locations) and mention that they can correct it anytime by
telling you or editing `job-hunt/profile.json`, then continue with the next step.

Optional extra fields used later: `salary_floor` (job-evaluate), `linkedin_page_budget`
(linkedin-leads), `requires_sponsorship` (job-evaluate, auto-apply).

Keep personal data local: profile.json stays on disk in `job-hunt/`. Don't paste the user's
phone or email into web searches.
