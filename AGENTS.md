# job-hunter: instructions for AI coding agents

This folder is a job-hunting toolkit. It works in Claude Code (as a plugin) and in any agent that
reads `AGENTS.md` (Codex, OpenCode, Cursor, Amp, Gemini CLI with `contextFileName: AGENTS.md`, and
others). All logic lives in `skills/*/SKILL.md` (instructions) and `skills/*/scripts/*.mjs`
(Node 18+, no dependencies).

## How to use it

When the user asks for anything job-hunt related, open the matching skill file and follow it.
"This skill's base directory" in a skill means that skill's folder, e.g. `skills/job-search/`.
Work in a `job-hunt/` folder inside the user's current project or home directory.

| User says | Read |
|---|---|
| "here's my resume", "find jobs for me", "run the job hunt" | `commands/hunt.md` (full pipeline), starting with `skills/resume-profile/SKILL.md` |
| "find jobs", "who's hiring", "check for new jobs" | `skills/job-search/SKILL.md` (daily: `commands/scan.md`) |
| "should I apply to …", "rank these jobs" | `skills/job-evaluate/SKILL.md` |
| "find recruiters / hiring managers / referrals" | `skills/linkedin-leads/SKILL.md` |
| "tailor my CV", "make a resume PDF", "cover letter", "LaTeX CV" | `skills/tailor-cv/SKILL.md` |
| "write cold emails / LinkedIn notes" | `skills/cold-outreach/SKILL.md` |
| "apply for me", "fill the application" | `skills/auto-apply/SKILL.md` |
| "I applied / they replied / what's due", "dashboard", "what's working" | `skills/job-tracker/SKILL.md` |
| pasted recruiter email, "check my inbox for replies" | `skills/reply-triage/SKILL.md` |
| "I have an interview", "mock interview" | `skills/interview-prep/SKILL.md` |
| "compare offers", "negotiate" | `skills/offer-compare/SKILL.md` |

## Capabilities by agent

The scripts (search, email finding, CV PDF, tracker, analytics, offer math) work in every agent
that can run shell commands. Two steps need a browser tool: LinkedIn lead finding and filling
applications. In agents without one, the skills fall back to web search, and filled applications
become a checklist the user completes. Gmail drafts need an email connector; otherwise drafts are
written to files.

## Rules that hold in every agent

- Never send emails, LinkedIn messages or connection requests: draft them for the user.
- Submit applications only after the user approves in the conversation.
- The user handles passwords, account creation, CAPTCHAs and verification codes.
- Tailored CVs must pass the fact check in `make_pdf.mjs` (no invented numbers, skills or titles).
- Personal data stays in the local `job-hunt/` folder.
