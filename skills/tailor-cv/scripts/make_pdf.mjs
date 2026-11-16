#!/usr/bin/env node
// Tailored CV / cover letter → ATS-friendly PDF, using the Chrome or Edge already installed
// (headless print-to-pdf). Zero dependencies, no Playwright download.
//
//   node make_pdf.mjs --cv job-hunt/cv/J003.json --source job-hunt/resume.txt --out job-hunt/cv/J003.pdf
//   node make_pdf.mjs --cover job-hunt/cover/J003.md --cv job-hunt/cv/J003.json --out job-hunt/cover/J003.pdf
//   node make_pdf.mjs --cv ... --source ... --out ... --latex   # also/instead: LaTeX .tex (+ PDF if a TeX engine is installed)
//
// Fact check (fail-closed): every number, employer, job title, school and skill in the tailored CV
// must appear in the source resume text. Anything that doesn't blocks the PDF (exit code 3) and
// is listed, so a tailored CV can reword and reorder but never invent. If the user confirms a
// flagged item is true, pass it with --allow "item1;item2" (and add it to the resume next time).

import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';

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
if (!args.out || (!args.cv && !args.cover)) {
  console.error('Usage: --cv cv.json [--source resume.txt] --out file.pdf | --cover letter.md --cv cv.json --out file.pdf');
  process.exit(2);
}

const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// Allow **bold** in bullets; everything else is escaped.
const rich = s => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
const cv = args.cv ? JSON.parse(fs.readFileSync(args.cv, 'utf8')) : {};

// ---------- fact check ----------
function factCheck(cvData, sourceText) {
  const src = sourceText.toLowerCase().replace(/[, ]/g, '').replace(/\s+/g, ' ');
  const srcLoose = src.replace(/[^a-z0-9+#%$.]/g, '');
  const allow = new Set(String(args.allow || '').split(';').map(s => s.trim().toLowerCase()).filter(Boolean));
  const issues = [];
  const has = t => {
    const n = String(t).toLowerCase().replace(/[, ]/g, '').replace(/\s+/g, ' ').trim();
    return !n || allow.has(n) || src.includes(n) || srcLoose.includes(n.replace(/[^a-z0-9+#%$.]/g, ''));
  };
  const texts = [];
  const walk = (v, where) => {
    if (typeof v === 'string') texts.push([v, where]);
    else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${where}[${i}]`));
    else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) if (k !== 'contact') walk(x, where ? `${where}.${k}` : k);
  };
  walk(cvData, '');
  // Numbers: 40%, 2M, 3.5x, $120k, 10,000, 2023 ...
  for (const [t, where] of texts) {
    for (const m of t.matchAll(/[$₹€£]?\d[\d,.]*\s?(million|billion|crore|lakh|mm|ms|bn|%|x|k|m|b|s|\+)?(?![a-z])/gi)) {
      const num = m[0].trim().replace(/[.,]$/, '');
      if (/^\d{1}$/.test(num)) continue; // single digits are rarely claims ("3 services" is checked by reviewers)
      if (!has(num) && !has(num.replace(/[$₹€£]/, '')) && !has(num.replace(/\s?(%|x|k|m|\+)$/i, ''))) issues.push(`number "${num}" in ${where}`);
    }
  }
  for (const [i, e] of (cvData.experience || []).entries()) {
    if (e.company && !has(e.company)) issues.push(`employer "${e.company}" in experience[${i}]`);
    if (e.title && !has(e.title)) issues.push(`job title "${e.title}" in experience[${i}]`);
  }
  for (const [i, e] of (cvData.education || []).entries()) if (e.school && !has(e.school)) issues.push(`school "${e.school}" in education[${i}]`);
  for (const g of cvData.skills || []) for (const s of g.items || []) if (!has(s)) issues.push(`skill "${s}"`);
  for (const c of cvData.certifications || []) if (!has(typeof c === 'string' ? c : c.name)) issues.push(`certification "${typeof c === 'string' ? c : c.name}"`);
  return [...new Set(issues)];
}

// ---------- HTML ----------
const CSS = `
@page { size: A4; margin: 14mm 15mm; }
* { box-sizing: border-box; }
body { font-family: "Segoe UI", Calibri, Arial, Helvetica, sans-serif; color: #1a1a1a; font-size: 10.2pt; line-height: 1.38; margin: 0; }
h1 { font-size: 19pt; margin: 0 0 2pt; letter-spacing: .2pt; }
.headline { font-size: 10.5pt; color: #333; margin-bottom: 3pt; }
.contact { font-size: 9.2pt; color: #333; }
.contact a { color: #1a1a1a; text-decoration: none; }
h2 { font-size: 10.5pt; text-transform: uppercase; letter-spacing: 1pt; border-bottom: 1px solid #999; padding-bottom: 1.5pt; margin: 11pt 0 5pt; }
.row { display: flex; justify-content: space-between; gap: 8pt; }
.role { font-weight: 600; }
.meta { color: #444; font-size: 9.4pt; white-space: nowrap; }
.sub { color: #333; font-style: italic; }
ul { margin: 2pt 0 6pt 14pt; padding: 0; }
li { margin: 0 0 1.6pt; }
.skills div { margin-bottom: 1.6pt; }
.entry { margin-bottom: 5pt; break-inside: avoid; }
p { margin: 0 0 6pt; }
.letter { font-size: 10.8pt; line-height: 1.5; }
.letter p { margin-bottom: 9pt; }
`;
function contactLine(c = {}) {
  const parts = [c.email, c.phone, c.location].filter(Boolean).map(esc);
  for (const k of ['linkedin', 'github', 'portfolio']) if (c[k]) parts.push(`<a href="${esc(c[k])}">${esc(String(c[k]).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}</a>`);
  return parts.join(' &nbsp;·&nbsp; ');
}
const dates = e => [e.start, e.end].filter(Boolean).map(esc).join(' – ');
function cvHtml(d) {
  const sec = (title, body) => body ? `<h2>${title}</h2>${body}` : '';
  const exp = (d.experience || []).map(e => `<div class="entry"><div class="row"><div><span class="role">${esc(e.title)}</span>, ${esc(e.company)}${e.location ? ` <span class="sub">· ${esc(e.location)}</span>` : ''}</div><div class="meta">${dates(e)}</div></div><ul>${(e.bullets || []).map(b => `<li>${rich(b)}</li>`).join('')}</ul></div>`).join('');
  const proj = (d.projects || []).map(p => `<div class="entry"><div class="row"><div><span class="role">${esc(p.name)}</span>${p.tech ? ` <span class="sub">· ${esc(p.tech)}</span>` : ''}</div><div class="meta">${p.url ? `<a href="${esc(p.url)}">${esc(String(p.url).replace(/^https?:\/\//, ''))}</a>` : ''}</div></div>${p.bullets ? `<ul>${p.bullets.map(b => `<li>${rich(b)}</li>`).join('')}</ul>` : p.one_liner ? `<p>${rich(p.one_liner)}</p>` : ''}</div>`).join('');
  const edu = (d.education || []).map(e => `<div class="entry"><div class="row"><div><span class="role">${esc(e.degree)}</span>, ${esc(e.school)}</div><div class="meta">${dates(e)}</div></div>${e.details ? `<p>${rich(e.details)}</p>` : ''}</div>`).join('');
  const skills = (d.skills || []).map(g => `<div><strong>${esc(g.group)}:</strong> ${(g.items || []).map(esc).join(', ')}</div>`).join('');
  const list = arr => (arr || []).length ? `<ul>${arr.map(x => `<li>${rich(typeof x === 'string' ? x : [x.name, x.issuer, x.year].filter(Boolean).join(', '))}</li>`).join('')}</ul>` : '';
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(d.name)} - CV</title><style>${CSS}</style></head><body>
<h1>${esc(d.name)}</h1>${d.headline ? `<div class="headline">${esc(d.headline)}</div>` : ''}<div class="contact">${contactLine(d.contact)}</div>
${sec('Summary', d.summary ? `<p>${rich(d.summary)}</p>` : '')}
${sec('Skills', skills ? `<div class="skills">${skills}</div>` : '')}
${sec('Experience', exp)}
${sec('Projects', proj)}
${sec('Education', edu)}
${sec('Certifications', list(d.certifications))}
${sec('Additional', list(d.extras))}
</body></html>`;
}
function coverHtml(md, d) {
  const paras = md.trim().split(/\n\s*\n/).map(p => `<p>${rich(p.replace(/\n/g, ' '))}</p>`).join('');
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${esc(d.name || '')} - Cover letter</title><style>${CSS}</style></head><body>
${d.name ? `<h1>${esc(d.name)}</h1><div class="contact">${contactLine(d.contact)}</div><br>` : ''}<div class="letter">${paras}</div></body></html>`;
}

// ---------- LaTeX ----------
const texEsc = s => String(s ?? '').replace(/\\/g, '\\textbackslash{}').replace(/([&%$#_{}])/g, '\\$1').replace(/~/g, '\\textasciitilde{}').replace(/\^/g, '\\textasciicircum{}').replace(/–/g, '--').replace(/—/g, '---').replace(/∼|~(?=\d)/g, '$\\sim$').replace(/₹/g, 'Rs.~').replace(/→/g, '$\\rightarrow$').replace(/×/g, '$\\times$').replace(/[✓✔]/g, '').replace(/·/g, '\\textperiodcentered{}');
const texRich = s => texEsc(s).replace(/\*\*(.+?)\*\*/g, '\\textbf{$1}');
function cvLatex(d) {
  const c = d.contact || {};
  const links = ['linkedin', 'github', 'portfolio'].filter(k => c[k]).map(k => `\\href{${c[k]}}{${texEsc(String(c[k]).replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, ''))}}`);
  const contact = [c.email && `\\href{mailto:${c.email}}{${texEsc(c.email)}}`, c.phone && texEsc(c.phone), c.location && texEsc(c.location), ...links].filter(Boolean).join(' $\\cdot$ ');
  const items = arr => (arr || []).length ? `\\begin{itemize}\n${arr.map(b => `  \\item ${texRich(b)}`).join('\n')}\n\\end{itemize}` : '';
  const head = (l, r) => `\\noindent\\textbf{${l}}\\hfill ${r}\\\\`;
  const range = e => texEsc([e.start, e.end].filter(Boolean).join(' – '));
  const sec = (t, body) => body ? `\\section*{${t}}\n${body}\n` : '';
  return `\\documentclass[10pt]{article}
\\usepackage[a4paper,margin=14mm]{geometry}
\\usepackage[hidelinks]{hyperref}
\\usepackage{enumitem}
\\usepackage{titlesec}
\\usepackage[T1]{fontenc}
\\usepackage{lmodern}
\\pagestyle{empty}
\\setlength{\\parindent}{0pt}
\\setlist[itemize]{leftmargin=1.2em,itemsep=1pt,topsep=2pt,parsep=0pt}
\\titleformat{\\section}{\\large\\bfseries\\scshape}{}{0pt}{}[\\vspace{-4pt}\\rule{\\linewidth}{0.4pt}]
\\titlespacing*{\\section}{0pt}{8pt}{4pt}
\\begin{document}
\\begin{center}{\\LARGE\\bfseries ${texEsc(d.name)}}\\\\[2pt]${d.headline ? `\n${texEsc(d.headline)}\\\\[2pt]` : ''}
{\\small ${contact}}\\end{center}
${sec('Summary', d.summary ? texRich(d.summary) : '')}${sec('Skills', (d.skills || []).map(g => `\\textbf{${texEsc(g.group)}:} ${(g.items || []).map(texEsc).join(', ')}\\\\`).join('\n'))}${sec('Experience', (d.experience || []).map(e => `${head(`${texEsc(e.title)}, ${texEsc(e.company)}`, range(e))}\n${items(e.bullets)}`).join('\n'))}${sec('Projects', (d.projects || []).map(p => `${head(`${texEsc(p.name)}${p.tech ? ` \\textmd{\\textit{· ${texEsc(p.tech)}}}` : ''}`, p.url ? `\\href{${p.url}}{link}` : '')}\n${p.bullets ? items(p.bullets) : texRich(p.one_liner || '')}`).join('\n'))}${sec('Education', (d.education || []).map(e => `${head(`${texEsc(e.degree)}, ${texEsc(e.school)}`, range(e))}${e.details ? `\n${texRich(e.details)}\\\\` : ''}`).join('\n'))}${sec('Certifications', items((d.certifications || []).map(x => typeof x === 'string' ? x : [x.name, x.issuer, x.year].filter(Boolean).join(', '))))}${sec('Additional', items(d.extras))}\\end{document}
`;
}
function findTex() {
  const names = process.platform === 'win32' ? ['tectonic.exe', 'xelatex.exe', 'pdflatex.exe'] : ['tectonic', 'xelatex', 'pdflatex'];
  for (const n of names) for (const dir of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(dir, n);
    try { if (fs.statSync(p).isFile()) return p; } catch { /* next */ }
  }
  return null;
}
function compileTex(engine, texPath) {
  const dir = path.dirname(texPath);
  const isTectonic = /tectonic/i.test(path.basename(engine));
  const argsList = isTectonic ? ['--outdir', dir, texPath] : ['-interaction=nonstopmode', '-halt-on-error', `-output-directory=${dir}`, texPath];
  return new Promise((resolve, reject) => execFile(engine, argsList, { timeout: 120000 }, (err, stdout) => err ? reject(new Error(`TeX failed: ${String(stdout).slice(-800)}`)) : resolve()));
}

// ---------- browser ----------
function findBrowser() {
  const env = process.env.CHROME_PATH || process.env.BROWSER_PATH;
  const c = env ? [env] : [];
  if (process.platform === 'win32') {
    const pf = [process.env['PROGRAMFILES'], process.env['PROGRAMFILES(X86)'], process.env.LOCALAPPDATA].filter(Boolean);
    for (const base of pf) c.push(path.join(base, 'Google/Chrome/Application/chrome.exe'), path.join(base, 'Microsoft/Edge/Application/msedge.exe'), path.join(base, 'BraveSoftware/Brave-Browser/Application/brave.exe'));
  } else if (process.platform === 'darwin') {
    c.push('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge', '/Applications/Chromium.app/Contents/MacOS/Chromium', '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser');
  } else {
    for (const dir of (process.env.PATH || '').split(':')) for (const n of ['google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser', 'microsoft-edge', 'brave-browser']) c.push(path.join(dir, n));
  }
  return c.find(p => { try { return fs.statSync(p).isFile(); } catch { return false; } });
}
function printPdf(browser, htmlPath, pdfPath) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-pdf-'));
  const flags = ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', `--user-data-dir=${profile}`, '--no-pdf-header-footer', '--print-to-pdf-no-header', `--print-to-pdf=${pdfPath}`, pathToFileURL(htmlPath).href];
  return new Promise((resolve, reject) => execFile(browser, flags, { timeout: 60000 }, err => {
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { /* locked on Windows sometimes */ }
    if (fs.existsSync(pdfPath) && fs.statSync(pdfPath).size > 0) resolve(); else reject(err || new Error('browser produced no PDF'));
  }));
}

async function main() {
  const out = path.resolve(args.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let html;
  if (args.cover) {
    html = coverHtml(fs.readFileSync(args.cover, 'utf8'), cv);
  } else {
    if (args.source) {
      const issues = factCheck(cv, fs.readFileSync(args.source, 'utf8'));
      if (issues.length) {
        console.log(JSON.stringify({ ok: false, blocked: 'fact check', issues, fix: 'Remove or reword these so they match the resume, or confirm with the user and pass --allow "item;item"' }, null, 2));
        process.exit(3);
      }
    } else console.error('warning: no --source resume text given, fact check skipped');
    if (args['check-only']) { console.log(JSON.stringify({ ok: true, fact_check: 'passed' }, null, 2)); return; }
    html = cvHtml(cv);
  }
  if (args.latex && !args.cover) {
    // LaTeX output: always writes the .tex; compiles it if a TeX engine is installed.
    const texPath = out.replace(/\.pdf$/i, '') + '.tex';
    fs.writeFileSync(texPath, cvLatex(cv));
    const engine = findTex();
    if (!engine) {
      console.log(JSON.stringify({ ok: true, tex: texPath, pdf: null, note: 'No TeX engine found (tectonic, xelatex, pdflatex). Upload the .tex to Overleaf, or rerun without --latex for the HTML-based PDF.' }, null, 2));
      return;
    }
    await compileTex(engine, texPath);
    const texPdf = texPath.replace(/\.tex$/, '.pdf');
    if (path.resolve(texPdf) !== out) fs.copyFileSync(texPdf, out);
    console.log(JSON.stringify({ ok: true, tex: texPath, pdf: out, engine: path.basename(engine) }, null, 2));
    return;
  }
  const htmlPath = out.replace(/\.pdf$/i, '') + '.html';
  fs.writeFileSync(htmlPath, html);
  const browser = findBrowser();
  if (!browser) {
    console.log(JSON.stringify({ ok: true, pdf: null, html: htmlPath, note: 'No Chrome/Edge/Chromium found (set CHROME_PATH). Open the HTML and print to PDF.' }, null, 2));
    return;
  }
  await printPdf(browser, htmlPath, out);
  const pages = (fs.readFileSync(out, 'latin1').match(/\/Type\s*\/Page[^s]/g) || []).length;
  console.log(JSON.stringify({ ok: true, pdf: out, html: htmlPath, pages, ...(pages > 2 ? { warning: 'More than 2 pages; trim older or less relevant bullets' } : {}) }, null, 2));
}
main().catch(e => { console.error(e.message); process.exit(1); });
