---
name: tailor-cv
description: Produce a job-specific, ATS-friendly CV PDF (and an optional cover letter PDF) from the user's resume for each target job, reordering and rewording real experience to mirror the posting, with a fail-closed fact check that blocks any number, employer, title or skill not in the original resume. Uses the Chrome/Edge already installed, with no extra setup. Use this whenever the user wants to tailor, customize or optimize their resume/CV for a job, make it ATS-friendly, generate a resume PDF, or write a cover letter.
---

# Tailored CV + cover letter

Inputs: `job-hunt/resume.txt` (original resume text, the source of truth), `job-hunt/profile.json`,
the job (from `jobs.json`/`jobs-archive.json`) and its evaluation `job-hunt/evals/<id>.md` if it
exists (its "Angle" section says what to emphasize). Run for every target job without asking.

## 1. Write the tailored CV as JSON: `job-hunt/cv/<id>.json`

```json
{
  "name": "", "headline": "Backend Engineer · Python, FastAPI, PostgreSQL",
  "contact": {"email": "", "phone": "", "location": "", "linkedin": "", "github": "", "portfolio": ""},
  "summary": "2–3 lines aimed at this role",
  "skills": [{"group": "Backend", "items": ["Python", "FastAPI"]}],
  "experience": [{"company": "", "title": "", "location": "", "start": "2023", "end": "Present",
                  "bullets": ["Action + what + **measurable result**"]}],
  "projects": [{"name": "", "tech": "", "url": "", "bullets": [""]}],
  "education": [{"school": "", "degree": "", "start": "", "end": "", "details": ""}],
  "certifications": [], "extras": []
}
```

Tailoring rules. These are what make it pass both ATS keyword filters and a human skim:
- **Mirror the posting's language** where the resume supports it: if the JD says "PostgreSQL"
  and the resume says "Postgres", use "PostgreSQL". Put the job's must-have skills first in the
  skills list and the most relevant bullets first in each role.
- **Headline and summary** name the target role and the 3–4 skills the job cares most about.
- **Bullets**: action verb + what + result with the resume's real numbers. Bold (`**…**`) the
  one key result per bullet at most. 3–5 bullets for recent roles, 1–2 for old ones.
- **Cut** what doesn't help this application: unrelated old roles shrink to a line, irrelevant
  skills go. Aim for 1 page (under ~5 years' experience) or 2 pages max.
- **Never add** a skill, tool, number, employer, title or credential that isn't in `resume.txt`.
  The script enforces this; don't fight it by rephrasing a fabricated claim.
- Plain structure, no tables or columns: that's what keeps it ATS-parsable.

## 2. Build the PDF (fact-checked)

```bash
node "<this skill's base directory>/scripts/make_pdf.mjs" --cv job-hunt/cv/<id>.json --source job-hunt/resume.txt --out job-hunt/cv/<Name>_<Company>_<id>.pdf
```

- Exit code 3 = fact check blocked it. The JSON output lists each issue. Fix the CV (remove or
  reword to match the resume) and rerun. If you believe an item is true but just phrased
  differently in the resume (e.g. "Postgres" vs "PostgreSQL"), prefer the resume's wording. Use
  `--allow "item;item"` only when the user has confirmed the fact in this conversation, and
  suggest adding it to their resume.
- Output reports `pages`; if over 2, trim and rerun.
- If no Chrome/Edge is found it writes the HTML instead; tell the user to print it to PDF or set
  `CHROME_PATH`.
- **LaTeX**: add `--latex` when the user wants a LaTeX CV (or an Overleaf-editable one). It writes
  `<name>.tex` with the same fact check, and compiles it to the PDF if `tectonic`, `xelatex` or
  `pdflatex` is installed; otherwise point them to the `.tex` for Overleaf.

## 3. Cover letter (when the application asks for one, or the user wants it)

Write `job-hunt/cover/<id>.md`: 180–250 words, 3–4 short paragraphs: why this team/product
(specific, from the JD or company news), the two strongest matching proof points with numbers,
what you'd contribute, a simple close. No "I am writing to express my interest". Then:

```bash
node "<this skill's base directory>/scripts/make_pdf.mjs" --cover job-hunt/cover/<id>.md --cv job-hunt/cv/<id>.json --out job-hunt/cover/<Name>_<Company>_<id>_cover.pdf
```

Report the PDF paths. The auto-apply skill uploads them.
