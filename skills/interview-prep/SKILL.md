---
name: interview-prep
description: Prepare the user for a specific interview (online assessment, recruiter screen, technical/DSA round, system design, behavioral/HR, hiring-manager or bar-raiser round) with company and role research, the likely interview process and questions, a reusable STAR story bank built from their resume, mock interviews with scored feedback, and a post-interview debrief that feeds the tracker. Use this whenever the user has an interview, OA/assessment, phone screen or "next round" coming up, asks how to prepare for a company, wants a mock interview or practice questions, or wants to debrief after an interview.
---

# Interview prep

Inputs: the job (`job-hunt/jobs-archive.json` / `jobs.json`), its evaluation `job-hunt/evals/<id>.md`,
`job-hunt/resume.txt`, `job-hunt/profile.json`. Output: `job-hunt/interview/<id>.md`, plus the shared
story bank `job-hunt/interview/stories.md`. Work out which round it is from what the user says
(or the invite they paste); ask only if it's genuinely unclear.

## 1. Research (web search, 5–8 queries)

- **Process**: `"<Company>" "<role>" interview process`, `"<Company>" interview experience <year>`
  on Glassdoor, LeetCode Discuss, AmbitionBox (India), Blind, GeeksforGeeks interview experiences.
  Extract: number of rounds, round types, OA platform (HackerRank, CodeSignal, HackerEarth…),
  typical difficulty, time limits, topics that recur.
- **Company and team**: what the product does, how it makes money, recent news (last 6 months),
  engineering blog posts, tech stack, and for the specific team anything from the JD.
- **Interviewer** (if the user knows who): their LinkedIn headline / talks / posts, via web search
  or the user's browser, to find common ground. Never anything personal beyond their work.

## 2. Write `job-hunt/interview/<id>.md`

```markdown
# <Company> · <Role> · <round> on <date>
## Process (what to expect)
## What they care about (from JD + research), mapped to your evidence
## Likely questions
### Technical (with the pattern/topic and a 1-line approach for each)
### System / low-level design (if relevant to level)
### Behavioral (each mapped to a story in stories.md)
### Resume deep-dives (the projects they'll probe, and the hard follow-ups)
## Questions to ask them (5, specific to team/product)
## Day-of checklist
## 3-day plan (if the interview is 2+ days away)
```

Guidance by round:
- **OA / DSA**: list the 6–10 patterns most reported for this company (e.g. sliding window,
  two pointers, BFS/DFS on grids, DP on subsequences, heaps, binary search on answer), 2 practice
  problems each by name (LeetCode/GfG), and complexity targets. For new grads in India, also
  aptitude/MCQ sections if the company is reported to use them.
- **System design**: scale it to the level (new grad: API design, data model, caching, a simple
  scaling story; senior: trade-offs, consistency, failure modes). Pick 2 prompts likely for the
  company's domain (payments → idempotent payment API; e-commerce → cart/checkout).
- **Behavioral**: Amazon → Leadership Principles; others → ownership, conflict, failure, impact,
  learning fast.
- **Resume deep-dive**: for each project on the resume, the 3 hardest follow-up questions an
  interviewer would ask (why this design, what broke, what you'd change, how you measured the
  number) and crisp answers grounded in `resume.txt`. Numbers the user can't explain are a
  liability, so flag any.

## 3. Story bank (`job-hunt/interview/stories.md`, reused across companies)

Build 6–8 STAR+R stories (Situation, Task, Action, Result, Reflection) from the resume:
a technical challenge, a failure/bug, ownership beyond scope, teamwork/conflict, learning fast,
impact with a number, leadership. Each ≤ 150 words, first person, with the real numbers.
Tag each with the questions it answers. Ask the user for missing detail only when a story would
otherwise be invented.

## 4. Mock interview (when asked: "mock", "practice", "quiz me")

Run it live, one question at a time; wait for the user's answer each time. After each answer:
score 1–5 on correctness, structure, communication and depth; say what a strong answer adds; for
coding, review their approach and complexity before showing a model solution. Adapt difficulty.
At the end: overall readiness, top 3 gaps, and what to practise next. Save a summary to the
interview file.

## 5. Debrief (after the interview)

Ask what was asked and how it went, then: add the questions to the interview file (they help the
next person and the next round), update the tracker
(`tracker.mjs set --job <id> --status interview --note "<round>: <summary>"`), draft a short thank-you
note if appropriate (the user sends it), and prep the next round if there is one.
