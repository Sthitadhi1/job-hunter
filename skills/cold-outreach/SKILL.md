---
name: cold-outreach
description: Draft personalized cold emails, LinkedIn connection notes and follow-ups to recruiters, hiring managers, founders and referrers for jobs the user is applying to, grounded in their resume and the specific job posting, and keep an outreach tracker. Use this whenever the user wants to cold email, write to a recruiter or hiring manager, ask for a referral, write a LinkedIn connection request or InMail, follow up on an application, or "reach out" about a job, even for a single person.
---

# Cold outreach for job applications

Goal: for each lead, a short message that a busy person would actually answer, because it's
clearly about *their* open role and shows evidence the user can do it. Output goes to
`job-hunt/outreach/` plus a tracker at `job-hunt/tracker.csv`.

Inputs: `job-hunt/profile.json`, `job-hunt/jobs.json`, `job-hunt/leads.csv`. If the user just
names a person and a job, work from that.

## Drafting is automatic; sending is the user's

Draft for every lead in `leads.csv` that doesn't have an outreach file yet, without asking.
If an email connector (e.g. Gmail) is connected, also save each email as a **draft** there, which
puts it in the user's Drafts folder ready to review and send. Never send email, connection
requests or LinkedIn messages yourself. The user reads and sends each one: they know things you
don't, and a wrong detail in a cold email costs more than it gains.

Pick the channel per lead: email when `email_confidence` is `hunter…` or `pattern…`; LinkedIn
connection note (plus email as a backup) when it's a `guess`; `hiring_inbox` only when no person
was found. Mark the chosen `channel` in the tracker.

## What makes these work

People skim cold messages in seconds. The ones that get replies share a structure:

1. **Specific opener (1 sentence)**: why *this person*: their team's role (by name), their hiring
   post, a talk or blog post, a shared school or past employer. Use the lead's `hook` if present.
   Never fake familiarity ("I've followed your work for years") or invent a hook.
2. **Who you are (1 sentence)**: current role + years + the one domain that matters for this job.
3. **Proof (1–2 sentences)**: the 1–2 `highlights` from the profile that best match the job's
   requirements, with their numbers. Map them explicitly: if the posting asks for scaling
   Postgres, lead with the Postgres result.
4. **Ask (1 sentence)**: small and specific, and different by role type (below). Mention you've
   applied (or are applying) and include the job link or ID.
5. **Sign-off**: name, LinkedIn, GitHub/portfolio if relevant. No attachments in a first cold
   email (they trip spam filters); offer to send the resume or include a link.

Length: emails 70–130 words. Subject lines under 8 words, specific, no clickbait:
"Backend Engineer (Payments) – 3 yrs Python/Postgres", "Re: your Platform team opening".

### Ask by role type

Lead rungs map to four styles: `job_poster`/`hiring_manager` → **hiring_manager**;
`recruiter`/`agency_recruiter` → **recruiter**; `founder_or_exec` → **founder**;
`team_member`/`alumni`/`any_engineer`/`hiring_post` → **peer** (for `hiring_post`, open with
their post).

- **hiring_manager**: "Would you be open to a 15-minute chat about the team's roadmap?" or "Could
  you take a look at my application?" Talk about the team's work, not the company in general.
- **recruiter**: make matching easy: role ID, location/notice period/work authorization if
  relevant, and "happy to share anything else you need". Recruiters care about fit and logistics.
- **founder**: shorter and more direct; show you understand what they're building and what you'd
  ship in the first months.
- **peer** (referral): ask about their experience on the team first; ask for a referral only if
  the conversation goes well, or offer to make it easy ("happy to send a short blurb you can
  forward"). Asking a stranger for a referral in message one usually gets ignored.

### LinkedIn connection note

Keep it under 200 characters, since free accounts get a limited number of personalized invites
with a 200-character cap. One hook + one line of fit + a light ask. No links.

### Follow-ups

- Follow-up 1 (4–5 business days later): reply on the same thread, 2–3 sentences, add one new
  piece of value (a relevant project link, a thought on their product), restate the ask.
- Follow-up 2 (about a week after that): a short, polite close-the-loop note.
- Stop after two follow-ups. If someone says no or asks not to be contacted, mark it in the
  tracker and don't contact them again.

### Tone

Plain, confident, human. Avoid filler ("I hope this email finds you well", "I am writing to
express my interest", "passionate", "synergy") and avoid sounding like a template. Vary sentence
openings across messages so a batch doesn't read like a mail merge. Match the user's own voice
if they've shown you writing samples.

## Output

One file per lead: `job-hunt/outreach/<job_id>-<company>-<lastname>.md`:

```markdown
# <Name> · <Title> @ <Company>
Job: <job_id> <job title> · <apply url>
LinkedIn: <url> · Email: <email_best> (<email_confidence>)

## Email
Subject: ...

<body>

## LinkedIn connection note (<N> chars)
...

## Follow-up 1 (send <date>)
...

## Follow-up 2 (send <date>)
...
```

Then record each lead in the tracker with the job-tracker script (its base directory is the
sibling `job-tracker` skill folder):

```bash
node "<job-tracker base>/scripts/tracker.mjs" set --job <id> --lead "<Name>" --channel <email|linkedin> --status drafted --email <email> --linkedin-url <url> --role-type <type>
```

When the user later says what they sent or who replied, update it with the same command
(`sent` schedules the follow-up dates automatically; also `replied`, `interview`, `rejected`,
`do-not-contact`). If the CV for this job exists (`job-hunt/cv/*<id>*.pdf`), mention in the email
that it's available or attached, depending on the channel.

## Before handing over

Re-read each draft against the job posting and profile: every claim must be true to the resume,
names and titles spelled as in the source, the right job linked, and the guessed-email caveat
mentioned for low-confidence addresses. Then show the user the first 2–3 drafts inline and say
where the rest are saved.

Sending reminder: cold email is legal in most places for individual, relevant, low-volume
messages, but bulk or automated sending can violate anti-spam laws (CAN-SPAM, GDPR, India's DPDP
Act) and email provider terms. Send from the user's own address, one at a time.
