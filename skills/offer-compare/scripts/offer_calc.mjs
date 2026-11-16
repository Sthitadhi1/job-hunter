#!/usr/bin/env node
// Offer comparison calculator for the job-hunter plugin. Zero dependencies.
//
//   node offer_calc.mjs --offers job-hunt/offers.json [--years 4] [--out job-hunt/offers.md]
//
// offers.json: [{
//   "company": "Acme", "role": "SDE I", "currency": "INR", "location": "Bangalore",
//   "base": 1800000,                 // fixed salary per year (exclude employer PF/gratuity)
//   "variable_pct": 10,              // target bonus as % of base (or "variable": 180000)
//   "variable_payout_pct": 80,       // expected payout of target (default 100)
//   "joining_bonus": 200000,         // paid in year 1 (clawback is noted, not modelled)
//   "relocation": 50000, "retention_bonus": [0, 100000],   // per year, optional
//   "employer_retirement": 86400,    // employer PF / 401k match per year (counted separately)
//   "benefits_value": 30000,         // insurance etc. per year, your estimate
//   "equity": { "type": "RSU|ESOP", "grant_value": 2000000, "vesting": [25,25,25,25], "cliff_months": 12,
//               "strike_total": 0, "scenarios": {"bear": 0.3, "base": 1.0, "bull": 2.0} },
//   "effective_tax_pct": 20,         // your estimated effective income-tax rate (optional)
//   "raise_pct": 8,                  // expected yearly base raise (optional, default 0)
//   "notes": "hybrid 3 days, on-call"
// }]
//
// Outputs a per-year cash table (year 1 vs steady state), N-year totals under equity scenarios,
// and monthly take-home estimates. Equity for private companies (ESOPs) is illiquid: the bear
// case treats it as worth little, which is usually the honest default.

import fs from 'node:fs';

const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) args[a.slice(2)] = true; else { args[a.slice(2)] = v; i++; }
}
if (!args.offers) { console.error('Usage: --offers offers.json [--years 4] [--out offers.md]'); process.exit(2); }
const offers = JSON.parse(fs.readFileSync(args.offers, 'utf8'));
const YEARS = Number(args.years || 4);

const fmt = (n, cur) => {
  if (!isFinite(n)) return '-';
  if (cur === 'INR') {
    if (Math.abs(n) >= 1e7) return `₹${(n / 1e7).toFixed(2)} Cr`;
    if (Math.abs(n) >= 1e5) return `₹${(n / 1e5).toFixed(2)} L`;
    return `₹${Math.round(n).toLocaleString('en-IN')}`;
  }
  const sym = { USD: '$', EUR: '€', GBP: '£', SGD: 'S$', CAD: 'C$', AUD: 'A$' }[cur] || `${cur} `;
  return `${sym}${Math.round(n).toLocaleString('en-US')}`;
};

function model(o) {
  const cur = o.currency || 'INR';
  const raise = (o.raise_pct || 0) / 100;
  const varTarget = o.variable ?? (o.base * (o.variable_pct || 0) / 100);
  const varPay = (o.variable_payout_pct ?? 100) / 100;
  const eq = o.equity || null;
  const vest = eq?.vesting?.length ? eq.vesting : [];
  const scen = eq?.scenarios || { bear: 0.3, base: 1, bull: 2 };
  const years = [];
  for (let y = 0; y < YEARS; y++) {
    const base = o.base * (1 + raise) ** y;
    const variable = varTarget * (1 + raise) ** y * varPay;
    const oneTime = (y === 0 ? (o.joining_bonus || 0) + (o.relocation || 0) : 0) + ([].concat(o.retention_bonus || [])[y] || 0);
    // Cliff: nothing vests before cliff; the cliff tranche vests at the cliff.
    let vestPct = vest[y] || 0;
    if (eq && y === 0 && (eq.cliff_months || 0) > 12) vestPct = 0;
    const equityVal = {};
    for (const [k, mult] of Object.entries(scen)) {
      const gross = (eq?.grant_value || 0) * vestPct / 100 * mult;
      const strike = (eq?.strike_total || 0) * vestPct / 100;
      equityVal[k] = Math.max(0, gross - strike);
    }
    const cash = base + variable + oneTime;
    years.push({ y: y + 1, base, variable, oneTime, cash, equity: equityVal, retirement: o.employer_retirement || 0, benefits: o.benefits_value || 0 });
  }
  const totals = {};
  for (const k of Object.keys(scen)) totals[k] = years.reduce((s, r) => s + r.cash + r.equity[k] + r.retirement + r.benefits, 0);
  const tax = (o.effective_tax_pct ?? null);
  const monthlyTakeHome = tax === null ? null : ((years[0].base) * (1 - tax / 100)) / 12;
  return { o, cur, years, totals, monthlyTakeHome, scenarios: Object.keys(scen) };
}

const models = offers.map(model);
const cur = models[0]?.cur;
const sameCur = models.every(m => m.cur === cur);
const lines = [`# Offer comparison (${YEARS}-year view)`, ''];
if (!sameCur) lines.push('> Offers are in different currencies; totals are not directly comparable. Convert at a rate you choose, or compare on purchasing power.', '');

lines.push('| | ' + models.map(m => `**${m.o.company}**<br>${m.o.role || ''}`).join(' | ') + ' |', '|---|' + models.map(() => '---').join('|') + '|');
const row = (label, f) => lines.push(`| ${label} | ` + models.map(m => f(m)).join(' | ') + ' |');
row('Location', m => m.o.location || '');
row('Base (yr 1)', m => fmt(m.years[0].base, m.cur));
row('Variable (expected, yr 1)', m => fmt(m.years[0].variable, m.cur));
row('One-time (joining/relocation)', m => fmt(m.years[0].oneTime, m.cur));
row('**Year-1 cash**', m => `**${fmt(m.years[0].cash, m.cur)}**`);
row('Year-2 cash (steady state)', m => fmt(m.years[1]?.cash ?? NaN, m.cur));
row('Equity vesting yr 1 (base case)', m => fmt(m.years[0].equity.base ?? 0, m.cur));
row('Employer retirement + benefits / yr', m => fmt(m.years[0].retirement + m.years[0].benefits, m.cur));
row('Monthly take-home (est., yr 1)', m => m.monthlyTakeHome === null ? 'set effective_tax_pct' : fmt(m.monthlyTakeHome, m.cur));
for (const k of models[0]?.scenarios || []) row(`${YEARS}-yr total, equity ${k}`, m => fmt(m.totals[k] ?? NaN, m.cur));
row('Notes', m => m.o.notes || '');
lines.push('');

if (sameCur && models.length > 1) {
  const by = k => [...models].sort((a, b) => (b.totals[k] ?? 0) - (a.totals[k] ?? 0)).map(m => m.o.company).join(' > ');
  lines.push(`Ranking by ${YEARS}-yr total: bear: ${by('bear')} · base: ${by('base')} · bull: ${by('bull')}`);
  const y1 = [...models].sort((a, b) => b.years[0].cash - a.years[0].cash).map(m => m.o.company).join(' > ');
  lines.push(`Ranking by year-1 cash: ${y1}`, '');
}
lines.push('Assumptions: variable paid at the stated payout %, raises compounding yearly, equity valued at grant × scenario multiplier minus strike. One-time bonuses usually have clawbacks if you leave within a year; check the letter.');

const md = lines.join('\n') + '\n';
if (args.out) fs.writeFileSync(args.out, md);
console.log(md);
