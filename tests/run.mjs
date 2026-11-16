#!/usr/bin/env node
// Offline test suite for job-hunter. No network, no dependencies:  node tests/run.mjs
// (Each script is run as a real CLI against fixtures in a temp folder.)

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const S = rel => path.join(ROOT, 'skills', rel);
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'jh-test-'));
const run = (script, args, opts = {}) => spawnSync(process.execPath, [script, ...args], { encoding: 'utf8', timeout: 60000, ...opts });
const daysAgo = n => new Date(Date.now() - n * 864e5).toISOString();
const write = (p, v) => { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, typeof v === 'string' ? v : JSON.stringify(v, null, 2)); return p; };

// ---------------------------------------------------------------- plugin structure
test('every skill has name + description frontmatter, and names are unique', () => {
  const names = new Set();
  for (const d of fs.readdirSync(path.join(ROOT, 'skills'))) {
    const md = fs.readFileSync(path.join(ROOT, 'skills', d, 'SKILL.md'), 'utf8');
    const fm = md.match(/^---\n([\s\S]*?)\n---/);
    assert.ok(fm, `${d}: frontmatter`);
    const name = fm[1].match(/^name:\s*(.+)$/m)?.[1].trim();
    assert.equal(name, d, `${d}: name matches folder`);
    assert.ok(/^description:\s*.{80,}/m.test(fm[1]), `${d}: description is substantive`);
    assert.ok(!names.has(name)); names.add(name);
  }
  assert.ok(names.size >= 11);
});

test('all scripts parse', () => {
  const scripts = [];
  for (const d of fs.readdirSync(path.join(ROOT, 'skills'))) {
    const dir = path.join(ROOT, 'skills', d, 'scripts');
    if (fs.existsSync(dir)) for (const f of fs.readdirSync(dir)) if (f.endsWith('.mjs')) scripts.push(path.join(dir, f));
  }
  scripts.push(path.join(ROOT, 'install.mjs'));
  for (const s of scripts) assert.equal(spawnSync(process.execPath, ['--check', s]).status, 0, `${s} parses`);
});

test('bundled companies.json is well formed and has 130+ unique boards', () => {
  const list = JSON.parse(fs.readFileSync(S('job-search/data/companies.json'), 'utf8'));
  const keys = new Set(list.map(c => `${c.ats}:${c.token.toLowerCase()}`));
  assert.equal(keys.size, list.length, 'no duplicates');
  assert.ok(list.length >= 130, `${list.length} boards`);
  for (const c of list) {
    assert.ok(c.name && c.ats && c.token, JSON.stringify(c));
    if (c.ats === 'eightfold') assert.ok(c.host && c.domain);
    if (c.ats === 'oraclehcm') assert.ok(c.host && c.site);
  }
});

// ---------------------------------------------------------------- job search scoring
const profile = {
  target_titles: ['Software Engineer', 'Backend Engineer'],
  skills: { primary: ['Python', 'FastAPI', 'PostgreSQL', 'C++'], secondary: ['Docker'] },
  locations: ['Chennai', 'Bangalore', 'India', 'Remote'], remote_ok: true, open_to_relocate: false,
  seniority: 'fresher', years_experience: 0, exclude_companies: ['Current Co'], exclude_keywords: ['sales'],
};
const fixtures = () => [
  { title: 'Software Engineer', company: 'GoodFit', location: 'Chennai, India', url: 'https://x.test/1', posted_at: daysAgo(2), description: 'Python FastAPI PostgreSQL backend. 0-1 years of experience.' },
  { title: 'Senior Software Engineer', company: 'TooSenior', location: 'Bangalore, India', url: 'https://x.test/2', posted_at: daysAgo(2), description: 'Python FastAPI PostgreSQL. 5+ years of hands-on experience required.' },
  { title: 'Backend Engineer', company: 'FarAway', location: 'Berlin, Germany', url: 'https://x.test/3', posted_at: daysAgo(2), description: 'Python FastAPI PostgreSQL C++' },
  { title: 'Backend Engineer', company: 'OpenRemote', location: 'Remote, Worldwide', remote: true, url: 'https://x.test/4', posted_at: daysAgo(2), description: 'Python FastAPI PostgreSQL C++' },
  { title: 'Backend Engineer', company: 'USRemote', location: 'Remote - US', remote: true, url: 'https://x.test/5', posted_at: daysAgo(2), description: 'Python FastAPI PostgreSQL C++' },
  { title: 'Sales Engineer', company: 'Excluded Title', location: 'Chennai', url: 'https://x.test/6', posted_at: daysAgo(2), description: 'Python' },
  { title: 'Software Engineer', company: 'Current Co', location: 'Chennai', url: 'https://x.test/7', posted_at: daysAgo(2), description: 'Python' },
  { title: 'Software Engineer', company: 'Stale', location: 'Chennai', url: 'https://x.test/8', posted_at: daysAgo(120), description: 'Python FastAPI' },
  { title: 'Marketing Manager', company: 'Irrelevant', location: 'Chennai', url: 'https://x.test/9', posted_at: daysAgo(2), description: 'brand campaigns' },
  { title: 'Software Engineer Intern', company: 'InternCo', location: 'Bangalore, India', url: 'https://x.test/10', posted_at: daysAgo(1), description: 'Python and C++ for 2027 graduates' },
  { title: 'Software Engineer', company: 'GoodFit', location: 'Chennai, India', url: 'https://x.test/1-dup', posted_at: daysAgo(2), description: 'dup' },
];
function search(dir) {
  const r = run(S('job-search/scripts/search_jobs.mjs'), ['--profile', path.join(dir, 'profile.json'), '--fixtures', path.join(dir, 'fx.json'), '--min-score', '0']);
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(fs.readFileSync(path.join(dir, 'jobs.json'), 'utf8')).jobs;
}

test('search: scoring, filters, dedupe, stable IDs and new flags', () => {
  const dir = tmp();
  write(path.join(dir, 'profile.json'), profile);
  write(path.join(dir, 'fx.json'), fixtures());
  const jobs = search(dir);
  const by = c => jobs.find(j => j.company === c);

  for (const gone of ['Excluded Title', 'Current Co', 'Stale', 'Irrelevant']) assert.equal(by(gone), undefined, `${gone} filtered out`);
  assert.equal(jobs.filter(j => j.company === 'GoodFit').length, 1, 'duplicate collapsed');

  assert.ok(by('GoodFit').score > by('TooSenior').score + 25, 'senior + 5 yrs penalized for a fresher');
  assert.match(by('TooSenior').why, /asks 5\+ yrs/);
  assert.ok(by('OpenRemote').score > by('USRemote').score, 'open remote beats US-only remote');
  assert.ok(by('OpenRemote').score > by('FarAway').score, 'remote beats on-site abroad');
  assert.ok(by('InternCo').why.includes('entry-level title'));
  assert.deepEqual(by('GoodFit').missing_skills, ['C++']);
  assert.ok(jobs.every(j => j.new === true));

  // Second run: same IDs, nothing new; archive keeps everything.
  const firstIds = Object.fromEntries(jobs.map(j => [j.url, j.id]));
  const again = search(dir);
  for (const j of again) assert.equal(j.id, firstIds[j.url], 'stable ID');
  assert.ok(again.every(j => j.new === false));
  const archive = JSON.parse(fs.readFileSync(path.join(dir, 'jobs-archive.json'), 'utf8'));
  assert.equal(Object.keys(archive).length, jobs.length);
  assert.match(fs.readFileSync(path.join(dir, 'jobs.md'), 'utf8'), /\| ID \| Score \|/);
});

// ---------------------------------------------------------------- CV fact check + LaTeX
const resume = `Jane Roe. Software Engineer, Acme Payments (2023 - present).
- Cut p95 latency from 900ms to 180ms using Redis.
- Built a reconciliation service handling 2M transactions/day in Python and PostgreSQL.
Skills: Python, PostgreSQL, Redis, Docker. B.Tech, XYZ University, 2022.`;
const cv = {
  name: 'Jane Roe', contact: { email: 'jane@example.com' }, summary: 'Backend engineer using **Python** & PostgreSQL_ops at 100%',
  skills: [{ group: 'Backend', items: ['Python', 'PostgreSQL', 'Redis'] }],
  experience: [{ company: 'Acme Payments', title: 'Software Engineer', start: '2023', end: 'Present', bullets: ['Cut p95 latency from 900ms to 180ms', 'Handled **2M transactions/day**'] }],
  education: [{ school: 'XYZ University', degree: 'B.Tech', end: '2022' }],
};
test('CV fact check passes true claims and blocks invented ones', () => {
  const dir = tmp();
  write(path.join(dir, 'resume.txt'), resume);
  const ok = { ...cv, summary: 'Backend engineer using **Python**' };
  write(path.join(dir, 'ok.json'), ok);
  let r = run(S('tailor-cv/scripts/make_pdf.mjs'), ['--cv', path.join(dir, 'ok.json'), '--source', path.join(dir, 'resume.txt'), '--out', path.join(dir, 'ok.pdf'), '--check-only']);
  assert.equal(r.status, 0, r.stdout + r.stderr);

  const bad = structuredClone(ok);
  bad.experience[0].bullets[0] = 'Cut p95 latency from 900ms to 120ms';
  bad.experience[0].title = 'Senior Software Engineer';
  bad.skills[0].items.push('Kafka');
  write(path.join(dir, 'bad.json'), bad);
  r = run(S('tailor-cv/scripts/make_pdf.mjs'), ['--cv', path.join(dir, 'bad.json'), '--source', path.join(dir, 'resume.txt'), '--out', path.join(dir, 'bad.pdf'), '--check-only']);
  assert.equal(r.status, 3, 'blocked with exit 3');
  const issues = JSON.parse(r.stdout).issues.join(' | ');
  assert.match(issues, /120ms/); assert.match(issues, /Kafka/); assert.match(issues, /Senior Software Engineer/);
  assert.ok(!/900ms|2M/.test(issues), 'true numbers not flagged');

  r = run(S('tailor-cv/scripts/make_pdf.mjs'), ['--cv', path.join(dir, 'bad.json'), '--source', path.join(dir, 'resume.txt'), '--out', path.join(dir, 'bad.pdf'), '--check-only', '--allow', '120ms;Kafka;Senior Software Engineer']);
  assert.equal(r.status, 0, '--allow overrides confirmed items');
});

test('LaTeX output escapes special characters', () => {
  const dir = tmp();
  write(path.join(dir, 'resume.txt'), `${resume} PostgreSQL_ops 100%`);
  write(path.join(dir, 'cv.json'), cv);
  const env = { ...process.env, PATH: '' }; // no TeX engine -> .tex only
  const r = run(S('tailor-cv/scripts/make_pdf.mjs'), ['--cv', path.join(dir, 'cv.json'), '--source', path.join(dir, 'resume.txt'), '--out', path.join(dir, 'cv.pdf'), '--latex'], { env });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  const tex = fs.readFileSync(path.join(dir, 'cv.tex'), 'utf8');
  assert.match(tex, /\\documentclass/);
  assert.match(tex, /\\textbf\{Python\} \\& PostgreSQL\\_ops at 100\\%/);
  assert.match(tex, /\\end\{document\}/);
});

// ---------------------------------------------------------------- email finder
test('email finder ranks a known pattern first and fills a CSV', () => {
  const dir = tmp();
  const f = S('linkedin-leads/scripts/email_finder.mjs');
  let r = run(f, ['--domain', 'https://www.acme.test/careers', '--first', 'José', '--last', "O'Neil", '--pattern', '{f}{last}', '--no-mx', '--no-discover']);
  const one = JSON.parse(r.stdout);
  assert.equal(one.email_best, 'joneil@acme.test');
  assert.match(one.email_confidence, /pattern/);
  assert.ok(one.email_alternates.includes('jose.oneil@acme.test'));

  write(path.join(dir, 'leads.csv'), 'company,domain,first_name,last_name,title\nAcme,acme.test,Jane,Doe,"Recruiter, Eng"\nNoLast,acme.test,Raj,,EM\n');
  r = run(f, ['--leads', path.join(dir, 'leads.csv'), '--no-mx', '--no-discover']);
  assert.equal(r.status, 0, r.stderr);
  const csv = fs.readFileSync(path.join(dir, 'leads.csv'), 'utf8');
  assert.match(csv, /jane\.doe@acme\.test/);
  assert.match(csv, /"Recruiter, Eng"/, 'quoted cell preserved');
  assert.match(csv, /raj@acme\.test/, 'no last name -> first-name pattern');
});

// ---------------------------------------------------------------- tracker + analytics + dashboard
test('tracker schedules business-day follow-ups, lists due items, analyzes outcomes, builds dashboard', () => {
  const dir = tmp();
  const T = S('job-tracker/scripts/tracker.mjs');
  const archive = {};
  const sources = ['linkedin', 'greenhouse'];
  for (let i = 1; i <= 12; i++) archive[`J${String(i).padStart(3, '0')}`] = { id: `J${String(i).padStart(3, '0')}`, company: `Co${i}`, title: 'SWE', url: `https://x.test/${i}`, score: 50 + i * 3, source: sources[i % 2] };
  write(path.join(dir, 'jobs-archive.json'), archive);
  write(path.join(dir, 'jobs.json'), { jobs: Object.values(archive) });
  const set = (...a) => { const r = run(T, ['set', '--dir', dir, ...a]); assert.equal(r.status, 0, r.stderr); return JSON.parse(r.stdout).updated; };

  // Friday 2026-11-13 + 4 business days = Thursday 2026-11-19; +9 = 2026-11-26.
  const row = set('--job', 'J001', '--lead', 'Jane Doe', '--channel', 'email', '--status', 'sent', '--today', '2026-11-13', '--role-type', 'recruiter');
  assert.equal(row.follow_up_1_on, '2026-11-19');
  assert.equal(row.follow_up_2_on, '2026-11-26');
  assert.equal(row.company, 'Co1', 'job info filled from archive');

  let r = run(T, ['due', '--dir', dir, '--today', '2026-11-18']);
  assert.equal(JSON.parse(r.stdout).due.length, 0);
  r = run(T, ['due', '--dir', dir, '--today', '2026-11-19']);
  assert.equal(JSON.parse(r.stdout).due[0].lead, 'Jane Doe');

  for (let i = 2; i <= 12; i++) set('--job', `J${String(i).padStart(3, '0')}`, '--status', 'applied', '--today', '2026-11-01');
  set('--job', 'J010', '--status', 'interview', '--today', '2026-11-08');
  set('--job', 'J011', '--status', 'rejected', '--today', '2026-11-05');
  write(path.join(dir, 'evals', 'J010.md'), '# x\nVerdict: 4.6/5 · Apply now');
  r = run(T, ['analyze', '--dir', dir, '--today', '2026-11-30']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\| Jobs pursued \| 12 \|/);
  assert.match(r.stdout, /\| Interview \| 1 \| 8% \|/);
  assert.match(r.stdout, /By job source/);
  assert.match(r.stdout, /silent 21\+ days: \d+/);
  assert.ok(fs.existsSync(path.join(dir, 'analytics.md')));

  r = run(T, ['dashboard', '--dir', dir]);
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8');
  assert.match(html, /4\.6\/5/, 'verdict shown');
  assert.ok(!/<\/script>[^]*<\/script>[^]*<\/script>/.test(html.replace(/<script>[^]*?<\/script>/, '')), 'single script block');
});

// ---------------------------------------------------------------- offers
test('offer calculator: year-1 cash, cliff, equity scenarios and strike', () => {
  const dir = tmp();
  write(path.join(dir, 'offers.json'), [
    { company: 'A', currency: 'USD', base: 100000, variable_pct: 10, variable_payout_pct: 100, joining_bonus: 10000, equity: { grant_value: 40000, vesting: [25, 25, 25, 25], scenarios: { bear: 0, base: 1, bull: 2 } } },
    { company: 'B', currency: 'USD', base: 120000, equity: { grant_value: 40000, vesting: [25, 25, 25, 25], cliff_months: 18, strike_total: 4000, scenarios: { bear: 0, base: 1, bull: 2 } } },
  ]);
  const r = run(S('offer-compare/scripts/offer_calc.mjs'), ['--offers', path.join(dir, 'offers.json'), '--years', '4']);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /\*\*Year-1 cash\*\* \| \*\*\$120,000\*\* \| \*\*\$120,000\*\*/);
  // A base-case 4yr: 4*(100k+10k) + 10k + 40k = 490k. B: 4*120k + (40k-4k)*0.75 (cliff skips yr1) = 507k.
  assert.match(r.stdout, /4-yr total, equity base \| \$490,000 \| \$507,000/);
  assert.match(r.stdout, /bear: B > A/);
});

// ---------------------------------------------------------------- multi-agent installer
test('installer copies prefixed skills and writes an AGENTS.md workspace', () => {
  const dir = tmp();
  let r = run(path.join(ROOT, 'install.mjs'), ['--skills-dir', path.join(dir, 'skills'), '--workspace', path.join(dir, 'ws')]);
  assert.equal(r.status, 0, r.stderr);
  const md = fs.readFileSync(path.join(dir, 'skills', 'job-hunter-job-search', 'SKILL.md'), 'utf8');
  assert.match(md, /^name: job-hunter-job-search$/m);
  const agents = fs.readFileSync(path.join(dir, 'ws', 'AGENTS.md'), 'utf8');
  assert.ok(agents.includes(`${ROOT.replace(/\\/g, '/')}/skills/job-search/SKILL.md`), 'absolute skill paths');
  assert.ok(fs.existsSync(path.join(dir, 'ws', 'GEMINI.md')));
  r = run(path.join(ROOT, 'install.mjs'), ['--uninstall', '--skills-dir', path.join(dir, 'skills')]);
  assert.equal(fs.readdirSync(path.join(dir, 'skills')).length, 0);
});

// ---------------------------------------------------------------- interview-chance ranking + lead gate
test('rank.mjs orders by interview chance, zeroes blockers; check_leads gates on LinkedIn leads', () => {
  const dir = tmp();
  const today = '2026-11-17';
  write(path.join(dir, 'jobs-archive.json'), {
    J001: { id: 'J001', title: 'SWE', company: 'Fresh', url: 'https://x.test/1', source: 'greenhouse', posted_at: '2026-11-16T00:00:00Z', applicants: 12 },
    J002: { id: 'J002', title: 'SWE', company: 'Crowded', url: 'https://x.test/2', source: 'linkedin', posted_at: '2026-10-10T00:00:00Z', applicants: 900 },
    J003: { id: 'J003', title: 'SWE', company: 'Blocked', url: 'https://x.test/3', source: 'greenhouse', posted_at: '2026-11-16T00:00:00Z', applicants: 5 },
    J004: { id: 'J004', title: 'SWE', company: 'Weak', url: 'https://x.test/4', source: 'greenhouse', posted_at: '2026-11-16T00:00:00Z' },
  });
  write(path.join(dir, 'evals', 'J001.md'), 'Verdict: 4.0/5 · Apply\nBlocker: none');
  write(path.join(dir, 'evals', 'J002.md'), 'Verdict: 4.6/5 · Apply now\nBlocker: none');
  write(path.join(dir, 'evals', 'J003.md'), 'Verdict: 4.8/5 · Apply now\nBlocker: requires 2028 graduates');
  write(path.join(dir, 'evals', 'J004.md'), 'Verdict: 2.5/5 · Skip\nBlocker: none');
  const R = S('job-evaluate/scripts/rank.mjs');
  let r = run(R, ['--dir', dir, '--today', today, '--min-verdict', '3.5']);
  assert.equal(r.status, 0, r.stderr);
  let t = JSON.parse(fs.readFileSync(path.join(dir, 'targets.json'), 'utf8')).targets;
  assert.deepEqual(t.map(x => x.id), ['J001', 'J002'], 'fresh low-competition job outranks a stale crowded better fit; blocked and weak excluded');
  assert.match(fs.readFileSync(path.join(dir, 'evals', 'README.md'), 'utf8'), /J003.*blocker: requires 2028 graduates/);

  const C = S('linkedin-leads/scripts/check_leads.mjs');
  r = run(C, ['--dir', dir]);
  assert.equal(r.status, 1, 'no leads yet -> gate fails');
  assert.deepEqual(JSON.parse(r.stdout).missing, ['J001', 'J002']);

  write(path.join(dir, 'leads.csv'), 'job_id,company,name,role_type,linkedin_url,hook\nJ002,Crowded,Ana B,hiring_manager,https://www.linkedin.com/in/anab,same college\nJ001,Fresh,Raj K,recruiter,,\n');
  r = run(C, ['--dir', dir]);
  const rep = JSON.parse(r.stdout);
  assert.equal(r.status, 1, 'J001 lead has no LinkedIn URL');
  assert.equal(rep.report.find(x => x.id === 'J001').status, 'no_linkedin_url');
  assert.ok(rep.report.find(x => x.id === 'J001').next_rungs.includes('job_poster'));

  write(path.join(dir, 'lead-exceptions.json'), { J001: { tried: 'job_poster,hiring_manager', why: 'lazy' } });
  r = run(C, ['--dir', dir]);
  assert.equal(r.status, 1, 'partial waiver rejected');
  write(path.join(dir, 'lead-exceptions.json'), { J001: { tried: 'job_poster,hiring_manager,team_member,recruiter,hiring_post,alumni,any_engineer,founder_or_exec,agency_recruiter', why: 'stealth company' } });
  r = run(C, ['--dir', dir]);
  assert.equal(r.status, 0, 'full ladder waiver accepted');

  // A warm hiring-manager lead raises J002's chance on re-rank.
  const before = t.find(x => x.id === 'J002').chance;
  run(R, ['--dir', dir, '--today', today]);
  t = JSON.parse(fs.readFileSync(path.join(dir, 'targets.json'), 'utf8')).targets;
  assert.ok(t.find(x => x.id === 'J002').chance > before);
});

// ---------------------------------------------------------------- resume gaps
test('resume_gaps finds hidden keyword gaps, strengths and writing issues', () => {
  const dir = tmp();
  write(path.join(dir, 'resume.txt'), `Jane Roe · jane@example.com · linkedin.com/in/jane
Summary: hard-working team player.
Skills: Python, Next.js, Node.js, MongoDB
Experience
- Responsible for the backend of the app
- Built 12 APIs serving 3,000 users
Education: B.Tech 2024`);
  write(path.join(dir, 'profile.json'), { skills: { primary: ['Python'] } });
  write(path.join(dir, 'jobs.json'), { jobs: [
    { id: 'J1', score: 90, title: 'Backend Engineer', description: 'Python, JavaScript, Kubernetes and Docker. NoSQL a plus.' },
    { id: 'J2', score: 80, title: 'SWE', description: 'JavaScript, Kubernetes, Python' },
    { id: 'J3', score: 70, title: 'SWE', description: 'JavaScript and Python' },
  ] });
  const r = run(S('resume-review/scripts/resume_gaps.mjs'), ['--dir', dir]);
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(fs.readFileSync(path.join(dir, 'resume-gaps.json'), 'utf8'));
  const gap = t => out.gaps.find(g => g.term === t);
  assert.equal(gap('JavaScript')?.demand_pct, 100, 'Next.js/Node.js must not count as JavaScript');
  assert.equal(gap('Kubernetes')?.demand_pct, 67);
  assert.ok(out.strengths.some(s => s.term === 'Python'));
  assert.ok(!out.gaps.some(g => g.term === 'Python'));
  assert.equal(out.checks.quantified_bullets, 1);
  assert.equal(out.checks.weak_phrase_bullets.length, 1);
  assert.deepEqual(out.checks.buzzwords.sort(), ['hard-working', 'team player']);
  assert.equal(out.checks.contact.github_or_portfolio, false);
  assert.equal(out.checks.sections.projects, false);
});
