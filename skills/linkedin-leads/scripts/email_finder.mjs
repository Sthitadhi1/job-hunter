#!/usr/bin/env node
// Email finder for the job-hunter plugin. Zero dependencies (Node 18+).
//
// Single person:
//   node email_finder.mjs --domain stripe.com --first Jane --last Doe [--pattern "{first}.{last}"]
// Domain info only (MX + known pattern):
//   node email_finder.mjs --domain stripe.com
// Batch (fills email columns in a leads CSV in place):
//   node email_finder.mjs --leads job-hunt/leads.csv
//
// What it does:
//   1. Checks the domain has MX records (it can receive mail at all).
//   2. If HUNTER_API_KEY is set, asks Hunter.io for the domain's pattern and the person's email
//      (this sends the name + domain to Hunter; only set the key if that's OK with you).
//   3. Otherwise ranks candidate addresses from the most common corporate patterns, putting a
//      pattern you already know (--pattern, or a `pattern` column in the CSV) first.
//   4. Reads the company's own website (home, careers, contact, about) for the hiring inbox it
//      publishes (careers@, jobs@, talent@ ...) as a fallback recipient. --no-discover skips this.

import fs from 'node:fs';
import dns from 'node:dns/promises';

function parseArgs(argv) {
  const a = {};
  for (let i = 2; i < argv.length; i++) {
    if (!argv[i].startsWith('--')) continue;
    const k = argv[i].slice(2), v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) a[k] = true; else { a[k] = v; i++; }
  }
  return a;
}
const args = parseArgs(process.argv);
const HUNTER = process.env.HUNTER_API_KEY;

// Most common corporate formats, roughly in order of prevalence.
const PATTERNS = ['{first}.{last}', '{first}', '{f}{last}', '{first}{last}', '{first}_{last}', '{first}{l}', '{f}.{last}', '{last}.{first}', '{last}', '{last}{f}', '{first}-{last}'];

function clean(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z]/g, '');
}
function cleanDomain(d) {
  return String(d || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').split(/[/?#]/)[0];
}
function render(pattern, first, last) {
  return pattern.replace(/\{first\}/g, first).replace(/\{last\}/g, last).replace(/\{f\}/g, first[0] || '').replace(/\{l\}/g, last[0] || '');
}
// Hunter returns patterns like "{first}.{last}" already; normalize a few common spellings.
function normPattern(p) {
  if (!p) return null;
  return String(p).trim().toLowerCase()
    .replace(/firstname|\{fn\}/g, '{first}').replace(/lastname|\{ln\}/g, '{last}')
    .replace(/@.*$/, '');
}

// Hiring inboxes the company itself publishes on its website (careers@, jobs@, talent@ ...).
const ROLE_INBOX = /^(careers?|jobs?|hiring|talent|recruit(ing|ment|er)?|hr|people|join(us)?|work|apply)([._-].*)?$/i;
const inboxCache = new Map();
async function discoverInboxes(domain) {
  if (inboxCache.has(domain)) return inboxCache.get(domain);
  const p = (async () => {
    const paths = ['/', '/careers', '/jobs', '/contact', '/contact-us', '/about', '/company'];
    const found = new Set();
    const re = new RegExp(`[a-z0-9._%+-]+@(?:[a-z0-9-]+\\.)*${domain.replace(/\./g, '\\.')}`, 'gi');
    for (const pth of paths) {
      try {
        const r = await fetch(`https://${domain}${pth}`, {
          headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36' },
          signal: AbortSignal.timeout(12000), redirect: 'follow',
        });
        if (!r.ok) continue;
        const html = (await r.text()).replace(/&#64;|\[at\]|\(at\)/gi, '@');
        for (const e of html.match(re) || []) found.add(e.toLowerCase());
      } catch { /* next */ }
    }
    const all = [...found].filter(e => !/\.(png|jpg|gif|svg|webp)$/.test(e));
    return { hiring: all.filter(e => ROLE_INBOX.test(e.split('@')[0])), other: all.filter(e => !ROLE_INBOX.test(e.split('@')[0])).slice(0, 10) };
  })();
  inboxCache.set(domain, p);
  return p;
}

const mxCache = new Map();
async function mx(domain) {
  if (args['no-mx']) return ['mx.offline.test']; // offline mode for tests: assume the domain receives mail
  if (!mxCache.has(domain)) {
    mxCache.set(domain, dns.resolveMx(domain).then(r => r.sort((a, b) => a.priority - b.priority).map(x => x.exchange)).catch(() => []));
  }
  return mxCache.get(domain);
}
function provider(mxHosts) {
  const h = mxHosts.join(' ');
  if (/google|googlemail/.test(h)) return 'Google Workspace';
  if (/outlook|protection\.outlook|microsoft/.test(h)) return 'Microsoft 365';
  if (/zoho/.test(h)) return 'Zoho';
  if (/pphosted|proofpoint/.test(h)) return 'Proofpoint (gateway)';
  if (/mimecast/.test(h)) return 'Mimecast (gateway)';
  return mxHosts[0] || 'none';
}

async function hunterJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(15000) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d?.errors?.[0]?.details || `Hunter HTTP ${r.status}`);
  return d.data;
}
const patternCache = new Map();
async function hunterPattern(domain) {
  if (!HUNTER) return null;
  if (!patternCache.has(domain)) {
    patternCache.set(domain, hunterJSON(`https://api.hunter.io/v2/domain-search?domain=${encodeURIComponent(domain)}&limit=1&api_key=${HUNTER}`)
      .then(d => normPattern(d?.pattern)).catch(() => null));
  }
  return patternCache.get(domain);
}
async function hunterFind(domain, first, last) {
  if (!HUNTER) return null;
  try {
    const d = await hunterJSON(`https://api.hunter.io/v2/email-finder?domain=${encodeURIComponent(domain)}&first_name=${encodeURIComponent(first)}&last_name=${encodeURIComponent(last)}&api_key=${HUNTER}`);
    if (d?.email) return { email: d.email, score: d.score, status: d.verification?.status || '' };
  } catch { /* fall back to patterns */ }
  return null;
}

async function findOne({ domain, first, last, pattern }) {
  domain = cleanDomain(domain);
  const f = clean(first), l = clean(last);
  const mxHosts = await mx(domain);
  const result = { domain, accepts_mail: mxHosts.length > 0, mail_provider: provider(mxHosts), email_best: '', email_confidence: '', email_alternates: [], pattern_used: '' };
  if (!mxHosts.length) { result.email_confidence = 'no-mx (domain does not receive mail; find the right domain)'; return result; }
  if (!f) { result.email_confidence = 'missing first name'; return result; }

  const found = await hunterFind(domain, first, last);
  if (found) {
    result.email_best = found.email;
    result.email_confidence = `hunter score ${found.score}${found.status ? `, ${found.status}` : ''}`;
  }
  const known = normPattern(pattern) || await hunterPattern(domain);
  const ordered = [...new Set([known, ...PATTERNS].filter(Boolean))].filter(p => l || !/\{(last|l)\}/.test(p));
  const candidates = [...new Set(ordered.map(p => `${render(p, f, l)}@${domain}`))];
  if (!result.email_best) {
    result.email_best = candidates[0];
    result.pattern_used = ordered[0];
    result.email_confidence = known ? `pattern (${known})` : 'guess (common pattern, unverified)';
  }
  result.email_alternates = candidates.filter(c => c !== result.email_best).slice(0, 4);
  if (!args['no-discover']) result.hiring_inbox = (await discoverInboxes(domain)).hiring[0] || '';
  return result;
}

// ---------- minimal CSV ----------
function parseCSV(text) {
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  const [header, ...body] = rows.filter(r => r.some(x => x !== ''));
  return { header, records: body.map(r => Object.fromEntries(header.map((h, i) => [h, r[i] ?? '']))) };
}
const esc = v => /[",\n\r]/.test(String(v ?? '')) ? `"${String(v).replace(/"/g, '""')}"` : String(v ?? '');
function toCSV(header, records) {
  return [header.join(','), ...records.map(r => header.map(h => esc(r[h])).join(','))].join('\n') + '\n';
}

async function main() {
  if (args.leads) {
    const { header, records } = parseCSV(fs.readFileSync(args.leads, 'utf8'));
    for (const col of ['email_best', 'email_confidence', 'email_alternates', 'hiring_inbox']) if (!header.includes(col)) header.push(col);
    let filled = 0;
    for (const r of records) {
      if (r.email_best && !args.force) continue;
      if (!r.domain || !r.first_name) continue;
      const res = await findOne({ domain: r.domain, first: r.first_name, last: r.last_name, pattern: r.pattern });
      r.email_best = res.email_best;
      r.email_confidence = res.email_confidence;
      r.email_alternates = res.email_alternates.join(' ');
      r.hiring_inbox = res.hiring_inbox || '';
      filled++;
    }
    fs.writeFileSync(args.leads, toCSV(header, records));
    console.log(JSON.stringify({ updated: args.leads, filled, total: records.length, hunter: Boolean(HUNTER) }, null, 2));
    return;
  }
  if (!args.domain) {
    console.error('Usage: --domain <domain> [--first X --last Y] [--pattern "{first}.{last}"] | --leads leads.csv');
    process.exit(2);
  }
  if (!args.first) {
    const domain = cleanDomain(args.domain);
    const mxHosts = await mx(domain);
    const inboxes = args['no-discover'] ? null : await discoverInboxes(domain);
    console.log(JSON.stringify({ domain, accepts_mail: mxHosts.length > 0, mail_provider: provider(mxHosts), mx: mxHosts.slice(0, 3), hunter_pattern: await hunterPattern(domain), hiring_inboxes: inboxes?.hiring || [], other_published: inboxes?.other || [] }, null, 2));
    return;
  }
  console.log(JSON.stringify(await findOne({ domain: args.domain, first: args.first, last: args.last, pattern: args.pattern }), null, 2));
}
main().catch(e => { console.error(e.message); process.exit(1); });
