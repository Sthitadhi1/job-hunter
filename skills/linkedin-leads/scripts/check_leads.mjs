#!/usr/bin/env node
// Lead gate for the job-hunter plugin: every target job must have at least one LinkedIn lead
// before outreach or applying, so no application goes unnoticed.
//
//   node check_leads.mjs [--dir job-hunt] [--targets J001,J002]
//
// Targets default to job-hunt/targets.json (written by job-evaluate's rank.mjs).
// Exit 0 = every target has a lead with a LinkedIn profile URL. Exit 1 = some don't; the JSON
// output lists them with the next search rungs to try. A job can only be waived through
// job-hunt/lead-exceptions.json when every rung of the ladder was tried and recorded.

import fs from 'node:fs';
import path from 'node:path';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) args[a.slice(2)] = true; else { args[a.slice(2)] = v; i++; }
}
const DIR = args.dir || 'job-hunt';
const readJSON = (p, f) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } };

// The search ladder, most valuable contact first. linkedin-leads/SKILL.md describes each rung.
export const LADDER = [
  'job_poster',        // "Meet the hiring team" / who posted the job
  'hiring_manager',    // manager of the hiring team (People tab: "engineering manager <team>")
  'team_member',       // engineer on that team / same title (referral path)
  'recruiter',         // technical recruiter / talent acquisition for the region
  'hiring_post',       // someone who posted "we're hiring" for this role
  'alumni',            // current employee from the user's college or past employer
  'any_engineer',      // any current engineer / tech lead at the company
  'founder_or_exec',   // founder / CTO / head of engineering (small companies)
  'agency_recruiter',  // the agency/platform recruiter, when the employer is confidential
];

function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') q = false; else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [h = [], ...b] = rows.filter(r => r.some(x => x !== ''));
  return b.map(r => Object.fromEntries(h.map((k, i) => [k, r[i] ?? ''])));
}

const targets = args.targets
  ? String(args.targets).split(',').map(s => s.trim()).filter(Boolean)
  : (readJSON(path.join(DIR, 'targets.json'), { targets: [] }).targets || []).map(t => t.id);
if (!targets.length) {
  console.log(JSON.stringify({ ok: false, error: 'No targets. Run job-evaluate (rank.mjs) or pass --targets J001,J002.' }, null, 2));
  process.exit(2);
}
const leadsPath = path.join(DIR, 'leads.csv');
const leads = fs.existsSync(leadsPath) ? parseCSV(fs.readFileSync(leadsPath, 'utf8')) : [];
const exceptions = readJSON(path.join(DIR, 'lead-exceptions.json'), {});
const isLinkedIn = u => /linkedin\.com\/in\//i.test(u || '');

const report = targets.map(id => {
  const mine = leads.filter(l => l.job_id === id);
  const withProfile = mine.filter(l => isLinkedIn(l.linkedin_url));
  const tried = new Set(String(exceptions[id]?.tried || '').split(/[,;\s]+/).filter(Boolean));
  const waived = exceptions[id] && LADDER.every(r => tried.has(r));
  const types = [...new Set(mine.map(l => l.role_type).filter(Boolean))];
  const status = withProfile.length ? 'ok' : waived ? 'waived' : mine.length ? 'no_linkedin_url' : 'missing';
  return {
    id, status, leads: mine.length, with_linkedin: withProfile.length, role_types: types,
    best: withProfile[0] ? `${withProfile[0].name} (${withProfile[0].role_type || '?'})` : '',
    next_rungs: status === 'ok' || status === 'waived' ? [] : LADDER.filter(r => !tried.has(r) && !types.includes(r)),
    ...(exceptions[id] && !waived ? { exception_rejected: `waiver needs every rung tried; missing: ${LADDER.filter(r => !tried.has(r)).join(', ')}` } : {}),
  };
});
const missing = report.filter(r => r.status !== 'ok' && r.status !== 'waived');
console.log(JSON.stringify({ ok: missing.length === 0, targets: report.length, covered: report.length - missing.length, missing: missing.map(r => r.id), report }, null, 2));
process.exit(missing.length ? 1 : 0);
