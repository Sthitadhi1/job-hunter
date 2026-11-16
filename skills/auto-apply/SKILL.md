---
name: auto-apply
description: Fill out job applications automatically in the user's browser (Greenhouse, Lever, Ashby, Workable, SmartRecruiters, LinkedIn Easy Apply and company forms), using the profile, a reusable answers bank and the tailored CV/cover letter, then submit them once the user has approved. Use this whenever the user wants to apply to jobs, fill application forms, "apply for me", do Easy Apply, or finish applications for jobs found by the job-hunter plugin.
---

# Auto-apply

Inputs: `job-hunt/profile.json`, the target job IDs, tailored PDFs from **tailor-cv**
(`job-hunt/cv/*.pdf`, `job-hunt/cover/*.pdf`; generate them first if missing), and
`job-hunt/answers.json` (create it if missing; see below).

## Submitting needs the user's go-ahead

Filling is automatic. Pressing the final **Submit** sends the user's personal data to an employer
in their name, so do it only when the user has approved it in chat: either in the original
request ("apply and submit", `/job-hunter:hunt … --submit`), or by answering the batch summary
below. When it's approved, submit without further questions. Without it, fill everything, stop on
the review/submit step, and ask once for the whole batch.

Things the user does themselves (hand back with a one-line explanation, then continue with other
jobs): creating an account or entering a password on an ATS (common on Workday/Taleo/iCIMS),
CAPTCHAs, email/SMS verification codes, and legal attestations they haven't seen.

## Browser

Prefer **Claude in Chrome** (`mcp__claude-in-chrome__*`), which has the user's sessions and the
`file_upload` tool for the CV. Load in one ToolSearch call:
`select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__read_page,mcp__claude-in-chrome__find,mcp__claude-in-chrome__form_input,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__file_upload,mcp__claude-in-chrome__get_page_text`.
Otherwise use the built-in browser (`mcp__Claude_Browser__*`); if it can't upload a file, fill
everything else and tell the user which file to attach.

## answers.json: answer once, reuse everywhere

```json
{
  "notice_period": "30 days", "current_ctc": "", "expected_ctc": "", "salary_expectation_usd": "",
  "work_authorization": {"IN": "Citizen", "US": "Requires sponsorship"}, "requires_sponsorship": true,
  "willing_to_relocate": false, "earliest_start": "", "years_experience": 3,
  "gender": "Prefer not to say", "race_ethnicity": "Prefer not to say", "veteran": "Prefer not to say", "disability": "Prefer not to say",
  "how_did_you_hear": "Company careers page", "pronouns": "",
  "custom": {"Why do you want to work here?": "<per-job, generated>"}
}
```

Fill what the profile already tells you. For questions the profile can't answer, such as current
salary or sponsorship, ask the user once in a single grouped question at the start of the batch,
save the answers, and never ask again. Voluntary demographic questions default to "Prefer not to say"
unless the user has said otherwise.

## Per application

1. Open the job's `apply_url` (or `url`) in a new tab. On LinkedIn, use **Easy Apply** if offered;
   otherwise follow "Apply" to the company's form.
2. Read the form (`read_page` / `find`), then fill fields in order: contact details, resume upload
   (the tailored PDF), cover letter (upload or paste), links (LinkedIn/GitHub/portfolio), work
   authorization, then screening questions from `answers.json`.
3. Free-text questions ("Why us?", "Describe a project…"): write 60–150 words specific to this job,
   grounded in `resume.txt` and the evaluation's "Angle", and save them under `custom` for reuse.
4. Check the form before stopping: required fields filled, the right PDF attached, no field
   still holding placeholder text. Multi-page forms: go through each page to the final review.
5. If submission is approved, submit, confirm the success page or email, and run
   `node "<job-tracker base>/scripts/tracker.mjs" set --job <id> --status applied`.
   If not, leave the tab on the review step.

## Batch summary (when not pre-approved)

| Job | Company | Form | Filled | Needs you |
|---|---|---|---|---|
| J003 | Sardine | Ashby | 14/14, CV attached | — |
| J012 | GitLab | Greenhouse | 18/19 | CAPTCHA |

Then ask one question: which of these to submit (all / some IDs / none). Submit the approved ones
in their open tabs and update the tracker.
