#!/usr/bin/env node
// Application + outreach tracker for the job-hunter plugin. Zero dependencies.
//
//   node tracker.mjs set --job J003 --status applied [--lead "Jane Doe"] [--channel email|linkedin|application] [--note "..."]
//   node tracker.mjs due                 # follow-ups due today or overdue
//   node tracker.mjs stats               # funnel counts
//   node tracker.mjs analyze             # outcome analytics -> job-hunt/analytics.md
//   node tracker.mjs dashboard [--open]  # writes job-hunt/dashboard.html (jobs, pipeline, leads, follow-ups)
//
// Options: --dir job-hunt (default), --today YYYY-MM-DD (for testing)
// Statuses: drafted, applied, sent, replied, interview, offer, rejected, ghosted, withdrawn, do-not-contact

import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';

const argv = process.argv.slice(2);
const cmd = argv[0];
const args = {};
for (let i = 1; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2), v = argv[i + 1];
  if (v === undefined || v.startsWith('--')) args[k] = true; else { args[k] = v; i++; }
}
const DIR = args.dir || 'job-hunt';
const TODAY = args.today || new Date().toISOString().slice(0, 10);
const TRACKER = path.join(DIR, 'tracker.csv');
const HEADER = ['job_id', 'company', 'job_title', 'job_url', 'score', 'applied_on', 'lead_name', 'role_type', 'channel', 'email', 'linkedin_url', 'status', 'sent_on', 'follow_up_1_on', 'follow_up_2_on', 'last_update', 'notes'];
const STATUSES = ['drafted', 'ready', 'applied', 'sent', 'follow-up-1', 'follow-up-2', 'replied', 'interview', 'offer', 'rejected', 'ghosted', 'withdrawn', 'do-not-contact'];
const OPEN = new Set(['applied', 'sent', 'follow-up-1', 'follow-up-2']);

// ---------- CSV ----------
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
  const [header = [], ...body] = rows.filter(r => r.some(x => x !== ''));
  return { header, records: body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}
const esc = v => /[",\n\r]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
const readCSV = p => fs.existsSync(p) ? parseCSV(fs.readFileSync(p, 'utf8')) : { header: [], records: [] };
function writeTracker(records, extraHeader = []) {
  const header = [...new Set([...HEADER, ...extraHeader])];
  fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(TRACKER, [header.join(','), ...records.map(r => header.map(h => esc(r[h])).join(','))].join('\n') + '\n');
}
const readJSON = (p, f) => { try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return f; } };

// Business-day arithmetic for follow-up dates.
function addBusinessDays(iso, n) {
  const d = new Date(`${iso}T12:00:00Z`);
  while (n > 0) { d.setUTCDate(d.getUTCDate() + 1); if (d.getUTCDay() % 6 !== 0) n--; }
  return d.toISOString().slice(0, 10);
}
function jobInfo(id) {
  const archive = readJSON(path.join(DIR, 'jobs-archive.json'), {});
  if (archive[id]) return archive[id];
  return (readJSON(path.join(DIR, 'jobs.json'), { jobs: [] }).jobs || []).find(j => j.id === id) || {};
}

// ---------- commands ----------
function set() {
  if (!args.job || !args.status) { console.error('set needs --job and --status'); process.exit(2); }
  if (!STATUSES.includes(args.status)) { console.error(`status must be one of: ${STATUSES.join(', ')}`); process.exit(2); }
  const { header, records } = readCSV(TRACKER);
  const lead = args.lead || '';
  const channel = args.channel || (lead ? '' : 'application');
  let row = records.find(r => r.job_id === args.job && (r.lead_name || '') === lead && (!channel || !r.channel || r.channel === channel));
  if (!row) {
    const j = jobInfo(args.job);
    row = { job_id: args.job, company: j.company || '', job_title: j.title || '', job_url: j.apply_url || j.url || '', score: j.score ?? '', lead_name: lead, channel };
    records.push(row);
  }
  if (channel && !row.channel) row.channel = channel;
  row.status = args.status;
  row.last_update = TODAY;
  if (args.status === 'applied' && !row.applied_on) row.applied_on = TODAY;
  if (args.status === 'sent' && !row.sent_on) {
    row.sent_on = TODAY;
    row.follow_up_1_on = addBusinessDays(TODAY, 4);
    row.follow_up_2_on = addBusinessDays(TODAY, 9);
  }
  if (args.status === 'applied' && row.channel === 'application' && !row.follow_up_1_on) row.follow_up_1_on = addBusinessDays(TODAY, 7);
  if (args.note) row.notes = [row.notes, `${TODAY}: ${args.note}`].filter(Boolean).join(' | ');
  for (const k of ['email', 'linkedin_url', 'role_type']) if (args[k.replace('_', '-')]) row[k] = args[k.replace('_', '-')];
  writeTracker(records, header);
  console.log(JSON.stringify({ updated: row }, null, 2));
}

function dueRows() {
  const { records } = readCSV(TRACKER);
  return records.filter(r => OPEN.has(r.status)).map(r => {
    const next = r.status === 'follow-up-1' ? r.follow_up_2_on : r.status === 'follow-up-2' ? '' : r.follow_up_1_on;
    return { ...r, next_follow_up: next };
  }).filter(r => r.next_follow_up && r.next_follow_up <= TODAY);
}
function due() {
  const rows = dueRows();
  console.log(JSON.stringify({ today: TODAY, due: rows.map(r => ({ job_id: r.job_id, company: r.company, lead: r.lead_name || '(application)', channel: r.channel, status: r.status, due_on: r.next_follow_up, email: r.email })) }, null, 2));
}

function stats() {
  const { records } = readCSV(TRACKER);
  const by = {};
  for (const r of records) by[r.status || 'unknown'] = (by[r.status || 'unknown'] || 0) + 1;
  const apps = records.filter(r => r.channel === 'application');
  const outreach = records.filter(r => r.channel && r.channel !== 'application');
  const replied = outreach.filter(r => ['replied', 'interview', 'offer'].includes(r.status)).length;
  const sent = outreach.filter(r => r.sent_on).length;
  console.log(JSON.stringify({ by_status: by, applications: apps.length, outreach_sent: sent, reply_rate: sent ? `${Math.round(100 * replied / sent)}%` : 'n/a', interviews: records.filter(r => r.status === 'interview').length, offers: records.filter(r => r.status === 'offer').length }, null, 2));
}

// Outcome analytics: what's working, by source, score/verdict, channel and contact type.
function readVerdicts() {
  const evalDir = path.join(DIR, 'evals');
  const v = {};
  if (fs.existsSync(evalDir)) for (const f of fs.readdirSync(evalDir)) {
    const m = fs.readFileSync(path.join(evalDir, f), 'utf8').match(/Verdict:\s*\**\s*([\d.]+)\s*\/\s*5/i);
    if (m) v[f.replace(/\.md$/, '')] = Number(m[1]);
  }
  return v;
}
function analyze() {
  const rows = readCSV(TRACKER).records;
  const archive = readJSON(path.join(DIR, 'jobs-archive.json'), {});
  const verdicts = readVerdicts();
  const RESPONDED = new Set(['replied', 'interview', 'offer', 'rejected']);
  const INTERVIEW = new Set(['interview', 'offer']);
  const days = (a, b) => (new Date(b) - new Date(a)) / 864e5;
  const pct = (a, b) => b ? `${Math.round(100 * a / b)}%` : '-';
  const lines = [`# Job hunt analytics (${TODAY})`, ''];

  const apps = rows.filter(r => r.channel === 'application' && r.applied_on);
  const outreach = rows.filter(r => r.channel && r.channel !== 'application' && r.sent_on);
  // A job "responded" if the application or any outreach thread for it got a response.
  const byJob = new Map();
  for (const r of rows) {
    const j = byJob.get(r.job_id) || { id: r.job_id, applied: false, responded: false, interview: false, offer: false, rejected: false, start: null, firstResp: null };
    if (r.applied_on) { j.applied = true; j.start = j.start && j.start < r.applied_on ? j.start : r.applied_on; }
    if (r.sent_on && (!j.start || r.sent_on < j.start)) j.start = r.sent_on;
    if (RESPONDED.has(r.status)) { j.responded = true; if (r.last_update && (!j.firstResp || r.last_update < j.firstResp)) j.firstResp = r.last_update; }
    if (INTERVIEW.has(r.status)) j.interview = true;
    if (r.status === 'offer') j.offer = true;
    if (r.status === 'rejected') j.rejected = true;
    byJob.set(r.job_id, j);
  }
  const jobs = [...byJob.values()].filter(j => j.applied || j.start);
  for (const j of jobs) {
    const a = archive[j.id] || {};
    j.source = (a.source || 'unknown').split(':')[0];
    j.score = a.score;
    j.verdict = verdicts[j.id];
    j.company = a.company || rows.find(r => r.job_id === j.id)?.company || '';
  }
  const n = jobs.length;
  lines.push('## Funnel', '', '| Stage | Count | Rate |', '|---|---|---|',
    `| Jobs pursued | ${n} | |`, `| Any response | ${jobs.filter(j => j.responded).length} | ${pct(jobs.filter(j => j.responded).length, n)} |`,
    `| Interview | ${jobs.filter(j => j.interview).length} | ${pct(jobs.filter(j => j.interview).length, n)} |`,
    `| Offer | ${jobs.filter(j => j.offer).length} | ${pct(jobs.filter(j => j.offer).length, n)} |`,
    `| Rejected | ${jobs.filter(j => j.rejected).length} | ${pct(jobs.filter(j => j.rejected).length, n)} |`, '');
  const ghosted = rows.filter(r => ['applied', 'sent', 'follow-up-1', 'follow-up-2'].includes(r.status) && days(r.sent_on || r.applied_on || TODAY, TODAY) > 21).length;
  const resp = jobs.filter(j => j.firstResp && j.start).map(j => days(j.start, j.firstResp)).sort((a, b) => a - b);
  lines.push(`Median days to first response: ${resp.length ? Math.round(resp[Math.floor(resp.length / 2)]) : '-'} · threads silent 21+ days: ${ghosted}`, '');

  const table = (title, groups, keyLabel) => {
    lines.push(`## ${title}`, '', `| ${keyLabel} | Pursued | Response | Interview |`, '|---|---|---|---|');
    for (const [k, g] of [...groups].sort((a, b) => b[1].length - a[1].length)) lines.push(`| ${k} | ${g.length} | ${pct(g.filter(j => j.responded).length, g.length)} | ${pct(g.filter(j => j.interview).length, g.length)} |`);
    lines.push('');
  };
  const group = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); if (k === undefined) continue; m.set(k, [...(m.get(k) || []), x]); } return m; };
  table('By job source', group(jobs, j => j.source), 'Source');
  const scoreBucket = s => s === undefined ? undefined : s >= 80 ? '80+' : s >= 65 ? '65-79' : s >= 50 ? '50-64' : '<50';
  table('By search score', group(jobs, j => scoreBucket(j.score)), 'Score');
  const vBucket = v => v === undefined ? undefined : v >= 4.5 ? '4.5+' : v >= 3.5 ? '3.5-4.4' : '<3.5';
  const vGroups = group(jobs, j => vBucket(j.verdict));
  table('By evaluation verdict', vGroups, 'Verdict');

  lines.push('## Outreach', '', '| Channel / contact | Sent | Reply rate |', '|---|---|---|');
  const replied = r => RESPONDED.has(r.status);
  for (const [k, g] of group(outreach, r => r.channel)) lines.push(`| ${k} | ${g.length} | ${pct(g.filter(replied).length, g.length)} |`);
  for (const [k, g] of group(outreach, r => r.role_type || undefined)) lines.push(`| ${k} | ${g.length} | ${pct(g.filter(replied).length, g.length)} |`);
  lines.push('');

  // Recommendations, only where the sample is big enough to mean something.
  const recs = [];
  for (const [k, g] of group(jobs, j => j.source)) if (g.length >= 5 && !g.some(j => j.responded)) recs.push(`No responses from ${g.length} ${k} jobs: spend less time on ${k}, or pair those applications with outreach.`);
  const ch = [...group(outreach, r => r.channel)].filter(([, g]) => g.length >= 5).map(([k, g]) => [k, g.filter(replied).length / g.length]);
  if (ch.length >= 2) { ch.sort((a, b) => b[1] - a[1]); if (ch[0][1] - ch.at(-1)[1] >= 0.15) recs.push(`${ch[0][0]} gets replies ${Math.round(ch[0][1] * 100)}% vs ${ch.at(-1)[0]} ${Math.round(ch.at(-1)[1] * 100)}%: lead with ${ch[0][0]}.`); }
  const hi = vGroups.get('4.5+'), mid = vGroups.get('3.5-4.4');
  if (hi?.length >= 4 && mid?.length >= 4) {
    const rHi = hi.filter(j => j.interview).length / hi.length, rMid = mid.filter(j => j.interview).length / mid.length;
    recs.push(rHi > rMid ? `Verdicts are predictive (interview rate ${Math.round(rHi * 100)}% for 4.5+ vs ${Math.round(rMid * 100)}% for 3.5-4.4): keep prioritizing by verdict.` : `Verdicts are NOT predicting interviews yet (4.5+: ${Math.round(rHi * 100)}%, 3.5-4.4: ${Math.round(rMid * 100)}%): revisit what the evaluation weights, e.g. referrals or company type may matter more than skill match.`);
  }
  if (n >= 10 && jobs.filter(j => j.responded).length / n < 0.1) recs.push('Response rate under 10%: tighten targeting (higher verdicts only), add referral outreach before applying, and re-check the CV against ATS keywords.');
  if (ghosted >= 5) recs.push(`${ghosted} threads silent for 3+ weeks: run follow-ups (\`tracker.mjs due\`) or mark them ghosted.`);
  lines.push('## Recommendations', '', ...(recs.length ? recs.map(r => `- ${r}`) : ['- Not enough outcomes yet. Recommendations appear once a group has 5+ jobs or messages.']), '');
  if (n < 10) lines.push(`_Small sample (${n} jobs): treat rates as directional._`, '');

  const out = path.join(DIR, 'analytics.md');
  fs.writeFileSync(out, lines.join('\n'));
  console.log(lines.join('\n'));
}

function dashboard() {
  const jobsDoc = readJSON(path.join(DIR, 'jobs.json'), { jobs: [] });
  const jobs = (jobsDoc.jobs || []).map(j => ({ id: j.id, new: j.new, score: j.score, title: j.title, company: j.company, location: j.location, posted: (j.posted_at || '').slice(0, 10), source: j.source, url: j.apply_url || j.url, matched: (j.matched_skills || []).join(', '), gaps: (j.missing_skills || []).join(', ') }));
  const evalDir = path.join(DIR, 'evals');
  const verdicts = {};
  if (fs.existsSync(evalDir)) for (const f of fs.readdirSync(evalDir)) {
    const m = fs.readFileSync(path.join(evalDir, f), 'utf8').match(/Verdict:\s*\**\s*([\d.]+)\s*\/\s*5[^\n]*/i);
    if (m) verdicts[f.replace(/\.md$/, '')] = m[0].replace(/^Verdict:\s*\**\s*/i, '').replace(/\*/g, '');
  }
  for (const j of jobs) j.verdict = verdicts[j.id] || '';
  const tracker = readCSV(TRACKER).records;
  const leads = readCSV(path.join(DIR, 'leads.csv')).records;
  const due = dueRows();
  const data = { generated: new Date().toISOString().slice(0, 16).replace('T', ' '), today: TODAY, jobs, tracker, leads, due };
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Job Hunt Dashboard</title><style>
:root{--bg:#fafaf8;--fg:#1c1c1a;--mut:#6b6b66;--line:#e4e3de;--card:#fff;--acc:#2f5bd3;--good:#1f7a4d;--warn:#b26b00;--bad:#b3261e}
@media (prefers-color-scheme:dark){:root{--bg:#161615;--fg:#ecebe6;--mut:#9b9a94;--line:#2d2d2a;--card:#1e1e1c;--acc:#7da2ff;--good:#5cc28f;--warn:#e0a648;--bad:#ef7d74}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:14px/1.45 system-ui,-apple-system,"Segoe UI",sans-serif}
header{padding:20px 16px 8px;max-width:1280px;margin:auto}h1{font-size:20px;margin:0 0 4px}.mut{color:var(--mut)}
.kpis{display:flex;gap:10px;flex-wrap:wrap;margin:12px 0}.kpi{background:var(--card);border:1px solid var(--line);border-radius:10px;padding:10px 14px;min-width:120px}.kpi b{display:block;font-size:20px}
nav{display:flex;gap:6px;flex-wrap:wrap;margin:8px 0}nav button{border:1px solid var(--line);background:var(--card);color:var(--fg);padding:6px 12px;border-radius:999px;cursor:pointer}nav button.on{background:var(--acc);color:#fff;border-color:var(--acc)}
main{max-width:1280px;margin:auto;padding:0 16px 40px}input{width:100%;max-width:360px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:var(--card);color:var(--fg);margin:6px 0 10px}
.wrap{overflow-x:auto;background:var(--card);border:1px solid var(--line);border-radius:10px}table{border-collapse:collapse;width:100%}th,td{padding:8px 10px;border-bottom:1px solid var(--line);text-align:left;vertical-align:top}th{cursor:pointer;font-weight:600;white-space:nowrap;position:sticky;top:0;background:var(--card)}tr:last-child td{border-bottom:0}
a{color:var(--acc)}.pill{display:inline-block;padding:1px 8px;border-radius:999px;font-size:12px;border:1px solid var(--line)}.s-hi{color:var(--good);font-weight:600}.s-md{color:var(--warn)}.new{color:var(--acc);font-size:11px;font-weight:600}
</style></head><body><header><h1>Job hunt</h1><div class="mut">Updated ${data.generated} UTC · regenerate with <code>tracker.mjs dashboard</code></div>
<div class="kpis" id="kpis"></div><nav id="tabs"></nav></header><main><input id="q" placeholder="Filter…" aria-label="Filter rows"><div class="wrap"><table id="t"></table></div></main>
<script>const D=${JSON.stringify(data).replace(/</g, '\\u003c')};
const tabs={Jobs:{rows:D.jobs,cols:[['id','ID'],['score','Score'],['verdict','Verdict'],['title','Role'],['company','Company'],['location','Location'],['posted','Posted'],['matched','Matched'],['gaps','Gaps'],['source','Source']]},
Pipeline:{rows:D.tracker,cols:[['job_id','Job'],['company','Company'],['job_title','Role'],['lead_name','Lead'],['channel','Channel'],['status','Status'],['applied_on','Applied'],['sent_on','Sent'],['follow_up_1_on','FU1'],['follow_up_2_on','FU2'],['notes','Notes']]},
'Follow-ups due':{rows:D.due,cols:[['next_follow_up','Due'],['job_id','Job'],['company','Company'],['lead_name','Lead'],['channel','Channel'],['status','Status'],['email','Email']]},
Leads:{rows:D.leads,cols:[['job_id','Job'],['company','Company'],['name','Name'],['title','Title'],['role_type','Type'],['email_best','Email'],['email_confidence','Confidence'],['linkedin_url','LinkedIn']]}};
const by=s=>D.tracker.filter(r=>r.status===s).length;
document.getElementById('kpis').innerHTML=[['Matches',D.jobs.length],['New',D.jobs.filter(j=>j.new).length],['Applied',D.tracker.filter(r=>r.applied_on).length],['Outreach sent',D.tracker.filter(r=>r.sent_on).length],['Replies',by('replied')+by('interview')+by('offer')],['Interviews',by('interview')],['Follow-ups due',D.due.length]].map(([k,v])=>'<div class="kpi"><b>'+v+'</b><span class="mut">'+k+'</span></div>').join('');
let cur='Jobs',sortK=null,asc=false;const e=s=>String(s??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
function cell(k,r){const v=r[k];if(k==='title'&&r.url)return '<a href="'+e(r.url)+'" target="_blank" rel="noopener">'+e(v)+'</a>'+(r.new?' <span class="new">NEW</span>':'');if(k==='job_title'&&r.job_url)return '<a href="'+e(r.job_url)+'" target="_blank" rel="noopener">'+e(v)+'</a>';if(k==='linkedin_url'&&v)return '<a href="'+e(v)+'" target="_blank" rel="noopener">profile</a>';if(k==='score')return '<span class="'+(v>=65?'s-hi':v>=50?'s-md':'')+'">'+e(v)+'</span>';if(k==='status'&&v)return '<span class="pill">'+e(v)+'</span>';if(/^(posted|applied_on|sent_on|follow_up_\\d_on|next_follow_up)$/.test(k))return '<span style="white-space:nowrap">'+e(v)+'</span>';return e(v)}
function draw(){const t=tabs[cur],q=document.getElementById('q').value.toLowerCase();let rows=t.rows.filter(r=>!q||JSON.stringify(r).toLowerCase().includes(q));if(sortK)rows=[...rows].sort((a,b)=>{const x=a[sortK]??'',y=b[sortK]??'';const n=typeof x==='number'&&typeof y==='number'?x-y:String(x).localeCompare(String(y),undefined,{numeric:true});return asc?n:-n});
document.getElementById('t').innerHTML='<thead><tr>'+t.cols.map(([k,l])=>'<th data-k="'+k+'">'+l+(sortK===k?(asc?' ▲':' ▼'):'')+'</th>').join('')+'</tr></thead><tbody>'+(rows.map(r=>'<tr>'+t.cols.map(([k])=>'<td>'+cell(k,r)+'</td>').join('')+'</tr>').join('')||'<tr><td class="mut" colspan="'+t.cols.length+'">Nothing here yet.</td></tr>')+'</tbody>';
document.querySelectorAll('th').forEach(th=>th.onclick=()=>{asc=sortK===th.dataset.k?!asc:false;sortK=th.dataset.k;draw()})}
document.getElementById('tabs').innerHTML=Object.keys(tabs).map(k=>'<button data-t="'+k+'">'+k+' ('+tabs[k].rows.length+')</button>').join('');
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>{cur=b.dataset.t;sortK=null;document.querySelectorAll('nav button').forEach(x=>x.classList.toggle('on',x===b));draw()});
document.querySelector('nav button').classList.add('on');document.getElementById('q').oninput=draw;draw();</script></body></html>`;
  const out = path.join(DIR, 'dashboard.html');
  fs.writeFileSync(out, html);
  // Open in the default browser without a shell (the path is passed as an argument, never interpolated).
  if (args.open) execFile(process.platform === 'win32' ? 'explorer.exe' : process.platform === 'darwin' ? 'open' : 'xdg-open', [path.resolve(out)], () => {});
  console.log(JSON.stringify({ dashboard: path.resolve(out), jobs: jobs.length, tracked: tracker.length, leads: leads.length, follow_ups_due: due.length }, null, 2));
}

const commands = { set, due, stats, analyze, dashboard };
if (!commands[cmd]) { console.error('Commands: set | due | stats | analyze | dashboard'); process.exit(2); }
commands[cmd]();
