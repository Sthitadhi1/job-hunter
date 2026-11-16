---
name: resume-review
description: Review the user's resume against the jobs they're actually targeting and tell them exactly what to fix. Covers skills and keywords the market asks for that the resume lacks (with demand % across their matched jobs), ATS problems, weak or unquantified bullets, missing sections and links, length, then gives prioritized improvements with before/after rewrites and a plan to close real skill gaps. Use this whenever the user asks to review, improve, critique or score their resume/CV, asks "what's missing from my resume", "why am I not getting calls", "what skills should I learn", or uploads a resume as part of a job hunt.
---

# Resume review: gaps and improvements

Inputs: `job-hunt/resume.txt` and `profile.json` (from **resume-profile**), and ideally matched
jobs in `job-hunt/jobs.json` (from **job-search**) so the advice is based on real demand, not
generic tips. Without jobs, run a quick search first. Inside the hunt pipeline, this runs right
after the search.

## 1. Measure

```bash
node "<this skill's base directory>/scripts/resume_gaps.mjs"
```

It compares the resume with up to 40 matched jobs (targets first) and writes
`job-hunt/resume-gaps.json`:
- `gaps`: skills/keywords in ≥10% of those jobs that the resume never mentions, with demand %
- `strengths`: in-demand skills the resume already shows
- `resume_skills_not_in_demand`: listed skills none of the jobs ask for (candidates to trim)
- `checks`: sections, contact links, length/pages, quantified-bullet %, weak phrases ("responsible
  for", "worked on"…), buzzwords, first-person pronouns, overlong bullets

Then read the resume yourself. The script can't judge clarity, ordering, impact or truthfulness of
emphasis.

## 2. Sort each gap honestly

For every high-demand gap, decide which kind it is, because the fix differs:
- **Hidden**: the user has it but the resume doesn't say it (e.g. lists TypeScript/Next.js but never
  "JavaScript"; uses MongoDB but never says "NoSQL"). Fix: add the keyword where it's true.
- **Adjacent**: close to something they have (Java → Spring Boot, AWS → GCP, Docker → Kubernetes).
  Fix: a small project or course that creates real evidence, then add it.
- **Missing**: genuinely absent. Fix: learn it only if it shows up in many target jobs, otherwise
  target roles that don't need it.

When it's unclear whether the user has a skill, ask in one grouped question. Never add a skill,
number or title to the resume that the user doesn't have; the tailor-cv fact check will block it
anyway.

## 3. Write `job-hunt/resume-review.md`

```markdown
# Resume review · <date> · compared with <N> matched jobs

## Score: <x>/10 for <target role>. <one-line verdict>

## Fix first (biggest impact on getting calls)
1. <issue> → <exact fix> (why it matters, e.g. "ATS keyword in 60% of your jobs")

## Keyword gaps vs your target jobs
| Skill | In % of jobs | Type (hidden/adjacent/missing) | What to do |

## Bullet rewrites (before → after, same facts)
- Before: "Worked on backend APIs for the platform"
  After: "Built 15+ FastAPI endpoints serving <the resume's real metric>"

## Structure and ATS
## Trim (low-value lines and unused skills)
## 2–4 week plan to close the real gaps (project ideas tied to target jobs)
```

Rules for rewrites: start with a strong verb, say what you built and the result, keep the
resume's real numbers, one line where possible. If a bullet has no number and one would help,
ask the user for it rather than estimating. Order sections by what target jobs value (new grads:
education, skills and projects early; experienced: experience first). For India new-grad roles,
CGPA and graduation year should be visible; for most other markets they're optional.

## 4. Offer the fix

Show the "Fix first" list and the keyword table in chat. Offer to apply the improvements: update
`resume.txt` only with facts the user confirms, rebuild `cv/master.json`, and regenerate the PDF
with **tailor-cv** (fact-checked). Re-run `resume_gaps.mjs` afterwards to show the gap list shrinking.
