#!/usr/bin/env node
// Rank evaluated jobs by their chance of getting an interview call. Zero dependencies.
//
//   node rank.mjs [--dir job-hunt] [--top 5] [--min-verdict 3.5]
//
// Reads evals/<id>.md ("Verdict: x.x/5", optional "Blocker: ..."), jobs-archive.json (applicants,
// posting date, source, company) and leads.csv (who you can reach, warm hooks). Writes
// targets.json and evals/README.md with the ranked "best bets". Re-run after linkedin-leads: a
// job with a warm contact moves up.
//
// Interview chance (0-100) =
//   55% fit (verdict)  + 15% competition (LinkedIn applicants) + 15% freshness (days since posted)
//   + 10% reachability (lead found / warm hook) + 5% channel (company ATS beats aggregators).
// Hard blockers (eligibility, visa, graduation year) zero it. Verdicts under 3.0 cap it at 30.

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
const TOP = Number(args.top || 5);
const MIN_VERDICT = Number(args['min-verdict'] ?? 3.5);
const NOW = args.today ? new Date(`${args.today}T12:00:00Z`) : new Date();
const readJSON = (p, f) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } };

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

const archive = { ...Object.fromEntries((readJSON(path.join(DIR, 'jobs.json'), { jobs: [] }).jobs || []).map(j => [j.id, j])), ...readJSON(path.join(DIR, 'jobs-archive.json'), {}) };
const leadsPath = path.join(DIR, 'leads.csv');
const leads = fs.existsSync(leadsPath) ? parseCSV(fs.readFileSync(leadsPath, 'utf8')) : [];
const evalDir = path.join(DIR, 'evals');
if (!fs.existsSync(evalDir)) { console.error('No job-hunt/evals/ yet: run job-evaluate first.'); process.exit(2); }

const companyOpenings = {};
for (const j of Object.values(archive)) companyOpenings[(j.company || '').toLowerCase()] = (companyOpenings[(j.company || '').toLowerCase()] || 0) + 1;

const competition = n => n === undefined || n === null ? 50 : n <= 25 ? 100 : n <= 50 ? 80 : n <= 100 ? 60 : n <= 200 ? 40 : 20;
const freshness = d => d === null ? 50 : d <= 2 ? 100 : d <= 7 ? 80 : d <= 14 ? 60 : d <= 30 ? 40 : 20;
const DIRECT = /^(greenhouse|lever|ashby|smartrecruiters|workable|recruitee|rippling|gem|teamtailor|personio|bamboohr|breezy|pinpoint|amazon|eightfold|oraclehcm|careers-page)/;

const rows = [];
for (const f of fs.readdirSync(evalDir).filter(f => /^J\d+\.md$/i.test(f))) {
  const id = f.replace(/\.md$/i, '');
  const md = fs.readFileSync(path.join(evalDir, f), 'utf8');
  const verdict = Number((md.match(/Verdict:\s*\**\s*([\d.]+)\s*\/\s*5/i) || [])[1]);
  if (!isFinite(verdict)) continue;
  const blocker = ((md.match(/^\W*Blocker:\**\s*(.+)$/im) || [])[1] || '').trim();
  const hasBlocker = blocker && !/^(none|no|n\/a|-)\b/i.test(blocker);
  const j = archive[id] || {};
  const days = j.posted_at ? Math.max(0, (NOW - new Date(j.posted_at)) / 864e5) : null;
  const mine = leads.filter(l => l.job_id === id && /linkedin\.com\/in\//i.test(l.linkedin_url || ''));
  const warm = mine.some(l => l.hook && l.hook.trim());
  const reach = !mine.length ? 0 : mine.some(l => /job_poster|hiring_manager/.test(l.role_type)) ? (warm ? 100 : 80) : warm ? 75 : 55;
  const fit = (verdict / 5) * 100;
  let chance = 0.55 * fit + 0.15 * competition(j.applicants) + 0.15 * freshness(days) + 0.10 * reach + 0.05 * (DIRECT.test(j.source || '') ? 100 : 50);
  if (verdict < 3) chance = Math.min(chance, 30);
  if (hasBlocker) chance = 0;
  chance = Math.round(chance);
  const why = [];
  if (hasBlocker) why.push(`blocker: ${blocker}`);
  if (j.applicants !== undefined) why.push(`${j.applicants} applicants`);
  if (days !== null) why.push(days < 1 ? 'posted today' : `posted ${Math.round(days)}d ago`);
  why.push(mine.length ? `${mine.length} LinkedIn lead${mine.length > 1 ? 's' : ''}${warm ? ' (warm)' : ''}` : 'no lead yet');
  if ((companyOpenings[(j.company || '').toLowerCase()] || 0) >= 3) why.push(`${companyOpenings[(j.company || '').toLowerCase()]} matching openings at company`);
  rows.push({ id, title: j.title || '', company: j.company || '', url: j.apply_url || j.url || '', verdict, chance, label: chance >= 70 ? 'High' : chance >= 50 ? 'Medium' : 'Low', blocker: hasBlocker ? blocker : '', applicants: j.applicants ?? null, days_old: days === null ? null : Math.round(days), leads: mine.length, why: why.join('; ') });
}
rows.sort((a, b) => b.chance - a.chance || b.verdict - a.verdict);
const targets = rows.filter(r => !r.blocker && r.verdict >= MIN_VERDICT).slice(0, TOP).map((r, i) => ({ rank: i + 1, ...r }));

fs.writeFileSync(path.join(DIR, 'targets.json'), JSON.stringify({ generated_at: NOW.toISOString(), targets }, null, 2));
const md = [
  '# Best bets for an interview call', '',
  '| Rank | ID | Role | Company | Interview chance | Verdict | Why |', '|---|---|---|---|---|---|---|',
  ...targets.map(r => `| ${r.rank} | ${r.id} | [${r.title.replace(/\|/g, '/')}](${r.url}) | ${r.company.replace(/\|/g, '/')} | **${r.label}** (${r.chance}) | ${r.verdict}/5 | ${r.why} |`),
  '', '## All evaluated jobs', '', '| ID | Role | Company | Chance | Verdict | Notes |', '|---|---|---|---|---|---|',
  ...rows.map(r => `| ${r.id} | ${r.title.replace(/\|/g, '/')} | ${r.company.replace(/\|/g, '/')} | ${r.label} (${r.chance}) | ${r.verdict}/5 | ${r.why} |`), '',
  '_Interview chance = 55% fit + 15% competition + 15% freshness + 10% reachability + 5% channel. Blockers zero it._', '',
];
fs.writeFileSync(path.join(evalDir, 'README.md'), md.join('\n'));
console.log(JSON.stringify({ evaluated: rows.length, targets: targets.map(t => `${t.rank}. ${t.id} ${t.company}: ${t.label} (${t.chance})`) }, null, 2));
