---
description: Check that everything job-hunter needs is ready (Node.js, a browser for PDFs, LinkedIn access) and walk a beginner through fixing anything missing
---

Help the user get job-hunter working. Assume they may never have used a terminal: explain each
step in one plain sentence, do the checks yourself, and only ask them to act when something truly
needs them. Run the checks, then show a short checklist with ✅ / ❌ and what to do next.

1. **Node.js 18+** (runs the job-search, CV and tracker scripts): run `node --version`.
   - Missing or older than 18: say Node.js is a free, widely used program that the plugin's
     scripts need, and offer to install it. Install only after the user says yes:
     - Windows: `winget install --id OpenJS.NodeJS.LTS -e --accept-source-agreements --accept-package-agreements`
     - macOS: `brew install node` if Homebrew exists; otherwise point them to https://nodejs.org (LTS installer)
     - Linux: their package manager, or https://nodejs.org
     After installing, a new terminal/session may be needed for `node` to be found; say so.
2. **A Chromium browser for PDFs** (Chrome, Edge or Brave): the CV step prints PDFs with it. On
   Windows, Edge is almost always present. If none is found, CVs still come out as HTML they can
   print to PDF, so this isn't a blocker.
3. **Browser access for LinkedIn and applications**: check whether Claude in Chrome tools
   (`mcp__claude-in-chrome__*`) or the built-in browser are available. If neither, explain that
   LinkedIn contacts will come from web search instead (fewer results) and how to connect
   Claude in Chrome (claude.ai/chrome) if they want the full version.
4. **LinkedIn signed in** (only if a browser is available): open linkedin.com/feed in a new tab
   and check it isn't a sign-in page. If it is, ask them to sign in there themselves. Never type
   their password.
5. **Their resume**: look for a PDF/DOCX in the current folder, Downloads and Desktop and say what
   you found. If none, tell them they can drag the file into the chat.
6. **Smoke test**: run `node "<plugin root>/skills/job-search/scripts/search_jobs.mjs"` with no
   arguments; it should print a usage error (this proves the scripts run).

Finish with the checklist and the exact next thing to type, usually:
`/job-hunter:hunt` (with the resume path, or after dragging the resume in), or
"review my resume for <role> jobs" if they only want feedback first.
