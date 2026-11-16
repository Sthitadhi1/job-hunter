#!/usr/bin/env node
// Job search aggregator for the job-hunter plugin.
// Zero dependencies (Node 18+). Pulls jobs from LinkedIn's public job search, remote job boards,
// Hacker News, YC startup job posts, company career boards (Greenhouse, Lever, Ashby,
// SmartRecruiters, Workable, Recruitee, Rippling, Gem, Teamtailor, Personio, BambooHR, Breezy,
// Pinpoint) and big-employer career APIs (Amazon, Eightfold e.g. Microsoft/Qualcomm, Oracle HCM
// e.g. JPMorgan), crawls company career pages to find their boards, scores every job against the
// candidate profile, checks postings are still live, and writes jobs.json + jobs.md.
//
// Usage:
//   node search_jobs.mjs --profile job-hunt/profile.json [--out-dir job-hunt]
//        [--min-score 35] [--max 200] [--days 45] [--sources a,b,c]
//        [--companies extra.json] [--detect "Acme,Globex"] [--crawl "https://acme.com/careers,..."]
//        [--no-ats] [--no-verify] [--linkedin-pages 3] [--verbose]
//
// Boards found with --detect/--crawl are saved to <out-dir>/companies.json and reused next run.
// Optional keys (environment) add more coverage: RAPIDAPI_KEY (JSearch), ADZUNA_APP_ID + ADZUNA_APP_KEY.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const UA = 'job-hunter-plugin/1.0 (personal job search)';
// Career pages and LinkedIn's public job pages serve different (or no) HTML to non-browser agents.
const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const TIMEOUT_MS = 20000;

// ---------- CLI ----------
function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const key = a.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) args[key] = true;
    else { args[key] = next; i++; }
  }
  return args;
}
const args = parseArgs(process.argv);
if (!args.profile) {
  console.error('Missing --profile <path to profile.json>');
  process.exit(2);
}
const profile = JSON.parse(fs.readFileSync(args.profile, 'utf8'));
const OUT_DIR = args['out-dir'] || path.dirname(path.resolve(args.profile));
const MIN_SCORE = Number(args['min-score'] ?? 35);
const MAX_RESULTS = Number(args.max ?? 200);
const MAX_AGE_DAYS = Number(args.days ?? 45);
const ALL_SOURCES = ['linkedin', 'ats', 'himalayas', 'jobicy', 'wwr', 'workingnomads', 'nodesk', 'remotive', 'remoteok', 'arbeitnow', 'hn', 'ycjobs', 'jsearch', 'adzuna'];
// Country names / ISO3 codes for search APIs that filter by country (Amazon, Eightfold).
const COUNTRIES = { in: ['India', 'IND'], us: ['United States', 'USA'], gb: ['United Kingdom', 'GBR'], ca: ['Canada', 'CAN'], de: ['Germany', 'DEU'], ie: ['Ireland', 'IRL'], nl: ['Netherlands', 'NLD'], sg: ['Singapore', 'SGP'], au: ['Australia', 'AUS'], ae: ['United Arab Emirates', 'ARE'], fr: ['France', 'FRA'], es: ['Spain', 'ESP'], pl: ['Poland', 'POL'], jp: ['Japan', 'JPN'], br: ['Brazil', 'BRA'], mx: ['Mexico', 'MEX'] };
const LINKEDIN_PAGES = Number(args['linkedin-pages'] ?? 3);
// --fixtures raw-jobs.json runs the pipeline offline on saved jobs (used by the test suite).
const SOURCES = new Set(
  (args.fixtures ? [] : args.sources ? String(args.sources).split(',') : ALL_SOURCES)
    .map(s => s.trim()).filter(Boolean)
    .filter(s => !(s === 'ats' && args['no-ats']))
);

// ---------- helpers ----------
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function getJSON(url, headers = {}, retries = 2) {
  // Retries rate limits (429), server hiccups (5xx) and timeouts with backoff.
  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json', ...headers },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if ((res.status === 429 || res.status >= 500) && attempt < retries) {
        const wait = Number(res.headers.get('retry-after')) * 1000 || 3000 * (attempt + 1);
        await sleep(Math.min(wait, 15000));
        continue;
      }
      if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status} for ${url.split('?')[0]}`), { final: true });
      return await res.json();
    } catch (e) {
      if (e.final || attempt >= retries) throw e;
      await sleep(2000 * (attempt + 1));
    }
  }
}
async function getText(url, { retries = 1 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'Accept-Language': 'en-US,en;q=0.9' },
      signal: AbortSignal.timeout(TIMEOUT_MS), redirect: 'follow',
    });
    if (res.status === 429 && attempt < retries) { await sleep(4000 * (attempt + 1)); continue; }
    return { status: res.status, url: res.url, text: res.ok ? await res.text() : '' };
  }
}
async function pool(items, limit, fn) {
  const out = [];
  let i = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      try { out[idx] = await fn(items[idx]); } catch (e) { out[idx] = { error: e }; }
    }
  });
  await Promise.all(workers);
  return out;
}
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
function decodeEntities(s) {
  return String(s || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&([a-z0-9#]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}
function htmlToText(html) {
  // Greenhouse returns escaped HTML, so decode once, strip tags, decode again.
  return decodeEntities(decodeEntities(String(html || ''))
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|li|div|h\d)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}
const norm = s => String(s || '').toLowerCase().replace(/[^a-z0-9+#.]+/g, ' ').trim();
function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function termRegex(term) {
  // Word-ish boundaries that still work for "C++", "C#", "node.js", ".NET".
  return new RegExp(`(^|[^a-z0-9])${escapeRe(term.toLowerCase())}(?=$|[^a-z0-9+#])`, 'i');
}
function toISO(v) {
  if (v === undefined || v === null || v === '') return null;
  const d = typeof v === 'number' ? new Date(v < 1e12 ? v * 1000 : v) : new Date(v);
  return isNaN(d) ? null : d.toISOString();
}
function slugVariants(name) {
  const base = String(name).toLowerCase().replace(/&/g, 'and').replace(/[^a-z0-9 -]/g, '').trim();
  return [...new Set([base.replace(/[\s-]+/g, ''), base.replace(/\s+/g, '-'), base.split(/\s+/)[0]])].filter(Boolean);
}

// ---------- profile-derived search terms ----------
const titles = (profile.target_titles || []).map(String).filter(Boolean);
const primarySkills = (profile.skills?.primary || []).map(String).filter(Boolean);
const secondarySkills = (profile.skills?.secondary || []).map(String).filter(Boolean);
const extraKeywords = (profile.keywords || []).map(String).filter(Boolean);
const locations = (profile.locations || []).map(String).filter(Boolean);
const remoteOk = profile.remote_ok !== false;
const seniority = String(profile.seniority || '').toLowerCase();
const excludeCompanies = new Set((profile.exclude_companies || []).map(norm));
const excludeKeywords = (profile.exclude_keywords || []).map(String).filter(Boolean);
const STOP = new Set(['senior', 'junior', 'staff', 'lead', 'principal', 'sr', 'jr', 'i', 'ii', 'iii', 'iv', 'the', 'and', 'of', 'engineer', 'developer']);
// Core title words, e.g. "Backend Engineer" -> ["backend"]; keep the role noun too for phrase matching.
const titleCoreWords = [...new Set(titles.flatMap(t => norm(t).split(' ')).filter(w => w.length > 1 && !STOP.has(w)))];
const roleNouns = [...new Set(titles.flatMap(t => norm(t).split(' ')).filter(w => ['engineer', 'developer', 'scientist', 'analyst', 'designer', 'manager', 'architect', 'consultant', 'specialist', 'administrator', 'researcher', 'sre', 'devops'].includes(w)))];
const queries = [...new Set([...titles.slice(0, 4), ...primarySkills.slice(0, 2)])];
if (!queries.length) {
  console.error('profile.json needs at least target_titles or skills.primary');
  process.exit(2);
}

// ---------- normalized job shape ----------
function job(o) {
  return {
    title: String(o.title || '').trim(),
    company: String(o.company || '').trim(),
    location: String(o.location || '').trim() || (o.remote ? 'Remote' : ''),
    remote: Boolean(o.remote) || /remote|anywhere|worldwide/i.test(String(o.location || '')),
    url: o.url || '',
    source: o.source,
    posted_at: toISO(o.posted_at),
    salary: o.salary || '',
    description: htmlToText(o.description || '').slice(0, 6000),
    ...(o._linkedinId ? { _linkedinId: o._linkedinId } : {}),
    ...(o.applicants ? { applicants: Number(o.applicants) } : {}),
  };
}

// ---------- sources ----------
const sources = {
  async linkedin() {
    // LinkedIn's public (logged-out) job search, the same listings you see at linkedin.com/jobs
    // without signing in. Paced to stay well under its rate limits.
    const out = [];
    // Up to 3 distinct places (Bangalore/Bengaluru etc. collapse) plus Remote if wanted.
    const SAME = { bengaluru: 'bangalore', gurugram: 'gurgaon', mumbai: 'bombay', 'new delhi': 'delhi' };
    const placeKey = l => SAME[norm(l)] || norm(l);
    const places = [...new Map(locations.filter(l => !/remote/i.test(l)).map(l => [placeKey(l), l])).values()].slice(0, 3);
    const locs = [...places, ...(remoteOk && locations.some(l => /remote/i.test(l)) ? ['Remote'] : [])];
    if (!locs.length) locs.push('');
    const tpr = MAX_AGE_DAYS <= 1 ? 'r86400' : MAX_AGE_DAYS <= 7 ? 'r604800' : 'r2592000';
    for (const q of queries.slice(0, 4)) for (const loc of locs) {
      const remote = /remote/i.test(loc);
      let start = 0;
      for (let page = 0; page < LINKEDIN_PAGES; page++) {
        const url = `https://www.linkedin.com/jobs-guest/jobs/api/seeMoreJobPostings/search?keywords=${encodeURIComponent(q)}` +
          `${remote ? '&f_WT=2' : loc ? `&location=${encodeURIComponent(loc)}` : ''}&f_TPR=${tpr}&start=${start}`;
        const r = await getText(url, { retries: 2 });
        if (r.status === 429) { console.error('  linkedin: rate limited, keeping what we have'); return out; }
        const cards = r.text.split(/<li>/).slice(1);
        for (const c of cards) {
          const id = (c.match(/urn:li:jobPosting:(\d+)/) || [])[1];
          const title = htmlToText((c.match(/base-search-card__title[^>]*>([\s\S]*?)<\/h3>/) || [])[1]);
          const company = htmlToText((c.match(/base-search-card__subtitle[^>]*>([\s\S]*?)<\/h4>/) || [])[1]);
          const location = htmlToText((c.match(/job-search-card__location[^>]*>([\s\S]*?)<\/span>/) || [])[1]);
          const posted = (c.match(/datetime="([^"]+)"/) || [])[1];
          if (id && title) out.push(job({
            title, company, location: remote && !location ? 'Remote' : location, remote: remote || /remote/i.test(location),
            url: `https://www.linkedin.com/jobs/view/${id}`, source: 'linkedin', posted_at: posted, description: '', _linkedinId: id,
          }));
        }
        // Page size varies (10 or 25); keep going until a page comes back empty.
        if (!cards.length) break;
        start += cards.length;
        await sleep(1500);
      }
      await sleep(1000);
    }
    return out;
  },

  async himalayas() {
    const out = [];
    for (const q of queries.slice(0, 4)) {
      for (let page = 1; page <= 2; page++) {
        const d = await getJSON(`https://himalayas.app/jobs/api/search?q=${encodeURIComponent(q)}&page=${page}`);
        for (const j of d.jobs || []) out.push(job({
          title: j.title, company: j.companyName,
          location: (j.locationRestrictions || []).length ? `Remote (${j.locationRestrictions.join(', ')})` : 'Remote, Worldwide', remote: true,
          url: j.applicationLink || `https://himalayas.app/companies/${j.companySlug}/jobs`, source: 'himalayas', posted_at: j.pubDate,
          salary: j.minSalary ? `${j.minSalary}-${j.maxSalary} ${j.currency || ''}` : '', description: j.description || j.excerpt,
        }));
        if ((d.jobs || []).length < 20) break;
        await sleep(400);
      }
    }
    return out;
  },

  async jobicy() {
    const out = [];
    const tags = [...new Set([...primarySkills.slice(0, 3), ...titleCoreWords.slice(0, 2)])];
    for (const tag of tags) {
      const d = await getJSON(`https://jobicy.com/api/v2/remote-jobs?count=50&tag=${encodeURIComponent(tag.toLowerCase())}`);
      for (const j of d.jobs || []) out.push(job({
        title: decodeEntities(j.jobTitle), company: decodeEntities(j.companyName), location: `Remote (${j.jobGeo || 'Anywhere'})`, remote: true,
        url: j.url, source: 'jobicy', posted_at: j.pubDate, salary: j.salaryMin ? `${j.salaryMin}-${j.salaryMax} ${j.salaryCurrency || ''}` : '',
        description: j.jobDescription || j.jobExcerpt,
      }));
      await sleep(400);
    }
    return out;
  },

  async workingnomads() {
    const d = await getJSON('https://www.workingnomads.com/api/exposed_jobs/');
    return (Array.isArray(d) ? d : []).map(j => job({
      title: j.title, company: j.company_name, location: `Remote (${j.location || 'Anywhere'})`, remote: true,
      url: j.url, source: 'workingnomads', posted_at: j.pub_date, description: `${j.tags || ''}\n${j.description || ''}`,
    }));
  },

  async nodesk() {
    const r = await getText('https://nodesk.co/remote-jobs/index.xml');
    return r.text.split('<item>').slice(1).map(item => {
      const tag = t => decodeEntities(((item.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || '').replace(/^<!\[CDATA\[|\]\]>$/g, ''));
      const [title, company = ''] = tag('title').split(/\s+at\s+(?=[^]*$)/);
      return job({ title, company, location: 'Remote', remote: true, url: tag('link'), source: 'nodesk', posted_at: tag('pubDate'), description: tag('description') });
    });
  },

  async ycjobs() {
    // Job posts YC startups publish on Hacker News ("Acme (YC W24) is hiring a backend engineer").
    const d = await getJSON('https://hn.algolia.com/api/v1/search_by_date?tags=job&hitsPerPage=200');
    return (d.hits || []).filter(h => h.title).map(h => {
      const m = h.title.match(/^(.*?)\s*(\(YC [^)]+\))?\s+(?:is\s+)?hiring\s*(?:an?\s+)?(.*)$/i);
      return job({
        title: m ? (m[3] || 'Engineer') : h.title, company: m ? `${m[1]}${m[2] ? ` ${m[2]}` : ''}` : '',
        location: /remote/i.test(h.title) ? 'Remote' : '', url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
        source: 'yc-jobs', posted_at: h.created_at, description: htmlToText(h.story_text || h.title),
      });
    });
  },

  async wwr() {
    const cats = ['remote-back-end-programming-jobs', 'remote-full-stack-programming-jobs', 'remote-front-end-programming-jobs', 'remote-devops-sysadmin-jobs', 'remote-design-jobs', 'remote-product-jobs', 'remote-data-science-jobs', 'all-other-remote-jobs'];
    const out = [];
    for (const cat of cats) {
      const r = await getText(`https://weworkremotely.com/categories/${cat}.rss`);
      for (const item of r.text.split('<item>').slice(1)) {
        const tag = t => decodeEntities(((item.match(new RegExp(`<${t}>([\\s\\S]*?)</${t}>`)) || [])[1] || '').replace(/^<!\[CDATA\[|\]\]>$/g, ''));
        const [company, ...rest] = tag('title').split(':');
        out.push(job({
          title: rest.join(':').trim() || company, company: rest.length ? company : '', location: `Remote (${tag('region') || 'Anywhere'})`, remote: true,
          url: tag('link') || tag('guid'), source: 'weworkremotely', posted_at: tag('pubDate'), description: tag('description'),
        }));
      }
      await sleep(300);
    }
    return out;
  },

  async remotive() {
    const out = [];
    for (const q of queries) {
      const d = await getJSON(`https://remotive.com/api/remote-jobs?search=${encodeURIComponent(q)}&limit=100`);
      for (const j of d.jobs || []) out.push(job({
        title: j.title, company: j.company_name, location: j.candidate_required_location || 'Remote', remote: true,
        url: j.url, source: 'remotive', posted_at: j.publication_date, salary: j.salary, description: j.description,
      }));
      await sleep(400);
    }
    return out;
  },

  async remoteok() {
    const d = await getJSON('https://remoteok.com/api');
    return (Array.isArray(d) ? d : []).filter(j => j && j.position).map(j => job({
      title: j.position, company: j.company, location: j.location || 'Remote', remote: true,
      url: j.url || `https://remoteok.com/remote-jobs/${j.id}`, source: 'remoteok', posted_at: j.date,
      salary: j.salary_min ? `${j.salary_min}-${j.salary_max} USD` : '', description: `${(j.tags || []).join(', ')}\n${j.description || ''}`,
    }));
  },

  async arbeitnow() {
    const out = [];
    for (let page = 1; page <= 3; page++) {
      const d = await getJSON(`https://www.arbeitnow.com/api/job-board-api?page=${page}`);
      for (const j of d.data || []) out.push(job({
        title: j.title, company: j.company_name, location: j.location, remote: j.remote,
        url: j.url, source: 'arbeitnow', posted_at: j.created_at, description: `${(j.tags || []).join(', ')}\n${j.description || ''}`,
      }));
      if (!d.links?.next) break;
      await sleep(400);
    }
    return out;
  },

  async hn() {
    // Latest "Ask HN: Who is hiring?" thread via the Algolia HN API.
    const s = await getJSON('https://hn.algolia.com/api/v1/search_by_date?tags=story,author_whoishiring&hitsPerPage=10');
    const story = (s.hits || []).find(h => /who is hiring/i.test(h.title || ''));
    if (!story) return [];
    const out = [];
    const seen = new Set();
    for (const q of queries) {
      const d = await getJSON(`https://hn.algolia.com/api/v1/search?tags=comment,story_${story.objectID}&query=${encodeURIComponent(q)}&hitsPerPage=100`);
      for (const c of d.hits || []) {
        if (seen.has(c.objectID) || c.parent_id !== Number(story.objectID)) continue; // top-level posts only
        seen.add(c.objectID);
        const text = htmlToText(c.comment_text || '');
        const header = text.split('\n')[0];
        // Employer posts use "Company | Role | Location | ..."; job seekers sometimes post in this
        // thread too ("I'm a backend engineer...", "Résumé/CV: ..."), so drop those.
        if (!header.includes('|') || header.length > 300) continue;
        if (/\b(i'?m a|i am a|my (résumé|resume|cv|portfolio)|résumé\/cv|resume\/cv|willing to relocate|open to (work|opportunities)|seeking (a )?(full[- ]time|role|position))\b/i.test(text.slice(0, 600))) continue;
        const parts = header.split('|').map(p => p.trim()).filter(Boolean);
        out.push(job({
          title: parts.find(p => /engineer|developer|scientist|designer|manager|analyst|lead|architect|sre|devops|intern/i.test(p)) || parts[1] || header.slice(0, 80),
          company: parts[0] || 'Unknown', location: parts.find(p => /remote|onsite|on-site|hybrid|[A-Z][a-z]+,? [A-Z]{2}\b/.test(p)) || '',
          url: `https://news.ycombinator.com/item?id=${c.objectID}`, source: 'hn-whoishiring', posted_at: c.created_at, description: text,
        }));
      }
      await sleep(300);
    }
    return out;
  },

  async ats() {
    const list = loadCompanies();
    const results = await pool(list, 8, c => fetchAts(c.ats, c.token, c.name, c));
    const out = [];
    let ok = 0;
    results.forEach((r, i) => {
      if (Array.isArray(r)) { out.push(...r); ok++; }
      else if (args.verbose) console.error(`  ats ${list[i].ats}:${list[i].token} failed: ${r?.error?.message}`);
    });
    console.error(`  ats: ${ok}/${list.length} company boards reachable`);
    return out;
  },

  async jsearch() {
    const key = process.env.RAPIDAPI_KEY;
    if (!key) return 'skipped (set RAPIDAPI_KEY to include LinkedIn/Indeed/Glassdoor/Naukri listings via Google for Jobs)';
    const out = [];
    const locs = locations.length ? locations.slice(0, 2) : [''];
    for (const q of queries.slice(0, 3)) for (const loc of locs) {
      const query = loc ? `${q} in ${loc}` : q;
      const d = await getJSON(`https://jsearch.p.rapidapi.com/search?query=${encodeURIComponent(query)}&num_pages=2&date_posted=month`, {
        'X-RapidAPI-Key': key, 'X-RapidAPI-Host': 'jsearch.p.rapidapi.com',
      });
      for (const j of d.data || []) out.push(job({
        title: j.job_title, company: j.employer_name,
        location: [j.job_city, j.job_state, j.job_country].filter(Boolean).join(', '), remote: j.job_is_remote,
        url: j.job_apply_link || j.job_google_link, source: `jsearch:${j.job_publisher || 'google'}`,
        posted_at: j.job_posted_at_datetime_utc, description: j.job_description,
        salary: j.job_min_salary ? `${j.job_min_salary}-${j.job_max_salary} ${j.job_salary_currency || ''}` : '',
      }));
      await sleep(600);
    }
    return out;
  },

  async adzuna() {
    const id = process.env.ADZUNA_APP_ID, key = process.env.ADZUNA_APP_KEY;
    if (!id || !key) return 'skipped (set ADZUNA_APP_ID and ADZUNA_APP_KEY)';
    const cc = String(profile.country_code || 'in').toLowerCase();
    const out = [];
    const where = locations.find(l => !/remote/i.test(l)) || '';
    for (const q of queries.slice(0, 3)) {
      const d = await getJSON(`https://api.adzuna.com/v1/api/jobs/${cc}/search/1?app_id=${id}&app_key=${key}&results_per_page=50&max_days_old=${MAX_AGE_DAYS}&what=${encodeURIComponent(q)}${where ? `&where=${encodeURIComponent(where)}` : ''}`);
      for (const j of d.results || []) out.push(job({
        title: j.title, company: j.company?.display_name, location: j.location?.display_name,
        url: j.redirect_url, source: 'adzuna', posted_at: j.created, description: j.description,
        salary: j.salary_min ? `${Math.round(j.salary_min)}-${Math.round(j.salary_max)}` : '',
      }));
      await sleep(400);
    }
    return out;
  },
};

// ---------- company ATS boards ----------
function loadCompanies() {
  const seed = JSON.parse(fs.readFileSync(path.join(HERE, '..', 'data', 'companies.json'), 'utf8'));
  const extra = args.companies ? JSON.parse(fs.readFileSync(args.companies, 'utf8')) : [];
  const saved = readJSON(path.join(OUT_DIR, 'companies.json'), []);
  const fromProfile = (profile.target_companies || []).filter(c => c && typeof c === 'object' && c.ats && c.token);
  const map = new Map();
  for (const c of [...seed, ...saved, ...extra, ...fromProfile]) map.set(`${c.ats}:${String(c.token).toLowerCase()}`, c);
  return [...map.values()];
}
function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return fallback; }
}
function saveCompanies(found) {
  const p = path.join(OUT_DIR, 'companies.json');
  const cur = readJSON(p, []);
  const keys = new Set(cur.map(c => `${c.ats}:${String(c.token).toLowerCase()}`));
  for (const c of found) {
    const k = `${c.ats}:${String(c.token).toLowerCase()}`;
    if (!keys.has(k)) { cur.push({ name: c.name, ats: c.ats, token: c.token, ...(c.careers_url ? { careers_url: c.careers_url } : {}) }); keys.add(k); }
  }
  fs.writeFileSync(p, JSON.stringify(cur, null, 2));
}

// ---------- career-page crawler ----------
// Find which ATS a company uses from its careers page (embedded board links/iframes), and pull
// schema.org JobPosting data from in-house career sites.
const ATS_LINK_PATTERNS = [
  ['greenhouse', /(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/(?:embed\/job_board\?for=)?([a-z0-9_-]+)/i],
  ['greenhouse', /boards-api\.greenhouse\.io\/v1\/boards\/([a-z0-9_-]+)/i],
  ['lever', /jobs\.(?:eu\.)?lever\.co\/([a-z0-9_.-]+)/i],
  ['ashby', /jobs\.ashbyhq\.com\/([a-z0-9_.%-]+)/i],
  ['smartrecruiters', /(?:jobs|careers)\.smartrecruiters\.com\/([a-z0-9_-]+)/i],
  ['workable', /apply\.workable\.com\/([a-z0-9_-]+)/i],
  ['recruitee', /([a-z0-9-]+)\.recruitee\.com/i],
  ['rippling', /ats\.rippling\.com\/(?:api\/v2\/board\/)?([a-z0-9_-]+)/i],
  ['gem', /jobs\.gem\.com\/([a-z0-9_-]+)/i],
  ['teamtailor', /([a-z0-9-]+)\.teamtailor\.com/i],
  ['personio', /([a-z0-9-]+)\.jobs\.personio\.(?:de|com)/i],
  ['bamboohr', /([a-z0-9-]+)\.bamboohr\.com\/(?:careers|jobs)/i],
  ['breezy', /([a-z0-9-]+)\.breezy\.hr/i],
  ['pinpoint', /([a-z0-9-]+)\.pinpointhq\.com/i],
];
// Seen on careers pages but fetched through the browser instead (bot-protected or no public feed).
const BROWSER_ONLY = [['workday', /([a-z0-9-]+)\.wd\d+\.myworkdayjobs\.com\/(?:[a-z-]+\/)?([A-Za-z0-9_-]+)/i], ['icims', /careers-([a-z0-9-]+)\.icims\.com/i], ['taleo', /([a-z0-9-]+)\.taleo\.net/i], ['successfactors', /career\d*\.successfactors\.(?:com|eu)/i], ['darwinbox', /([a-z0-9-]+)\.darwinbox\.in/i], ['keka', /([a-z0-9-]+)\.keka\.com\/careers/i], ['zohorecruit', /([a-z0-9-]+)\.zohorecruit\.(?:com|in)/i]];
const NOT_TOKENS = new Set(['embed', 'api', 'v1', 'jobs', 'job', 'static', 'assets', 'www', 'careers', 'j', 'apply', 'widget']);
function atsFromHtml(html) {
  const found = [];
  for (const [ats, re] of ATS_LINK_PATTERNS) {
    const g = new RegExp(re.source, 'gi');
    let m;
    while ((m = g.exec(html))) {
      const token = decodeURIComponent(m[1]).replace(/[/?#].*$/, '');
      if (token && !NOT_TOKENS.has(token.toLowerCase())) found.push({ ats, token });
    }
  }
  const seen = new Set();
  return found.filter(f => { const k = `${f.ats}:${f.token.toLowerCase()}`; if (seen.has(k)) return false; seen.add(k); return true; });
}
function jsonLdJobs(html, pageUrl, companyName) {
  const out = [];
  for (const m of html.matchAll(/<script[^>]+application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi)) {
    let data;
    try { data = JSON.parse(m[1].trim()); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const d = stack.pop();
      if (Array.isArray(d)) { stack.push(...d); continue; }
      if (!d || typeof d !== 'object') continue;
      if (d['@graph']) stack.push(d['@graph']);
      if (d.itemListElement) stack.push(...[].concat(d.itemListElement).map(x => x.item || x));
      const type = [].concat(d['@type'] || []);
      if (!type.includes('JobPosting')) continue;
      const loc = [].concat(d.jobLocation || []).map(l => [l.address?.addressLocality, l.address?.addressCountry?.name || l.address?.addressCountry].filter(Boolean).join(', ')).join(' / ');
      out.push(job({
        title: d.title, company: d.hiringOrganization?.name || companyName, location: loc || (d.jobLocationType === 'TELECOMMUTE' ? 'Remote' : ''),
        remote: d.jobLocationType === 'TELECOMMUTE', url: d.url || pageUrl, source: 'careers-page', posted_at: d.datePosted, description: d.description,
      }));
    }
  }
  return out;
}
async function crawlCareers(startUrl, companyName) {
  const visited = new Set();
  const queue = [startUrl];
  const boards = [];
  const jobs = [];
  const browserOnly = new Set();
  while (queue.length && visited.size < 5) {
    const url = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);
    let r;
    try { r = await getText(url); } catch { continue; }
    if (!r.text) continue;
    boards.push(...atsFromHtml(r.text));
    for (const [kind, re] of BROWSER_ONLY) { const m = r.text.match(re); if (m) browserOnly.add(`${kind}: ${m[0].startsWith('http') ? m[0] : `https://${m[0]}`}`); }
    jobs.push(...jsonLdJobs(r.text, r.url, companyName));
    if (boards.length) break;
    // Follow links that look like careers/jobs listings on the same site.
    const base = new URL(r.url);
    for (const m of r.text.matchAll(/href="([^"#]+)"/gi)) {
      let u;
      try { u = new URL(decodeEntities(m[1]), base); } catch { continue; }
      if (u.hostname.replace(/^www\./, '').split('.').slice(-2).join('.') !== base.hostname.replace(/^www\./, '').split('.').slice(-2).join('.')) {
        if (atsFromHtml(u.href).length) boards.push(...atsFromHtml(u.href));
        continue;
      }
      if (/(career|jobs|openings|open-positions|join-us|work-with-us|hiring)/i.test(u.pathname + u.hostname) && !visited.has(u.href) && queue.length < 10) queue.push(u.href);
    }
  }
  const name = companyName || new URL(startUrl).hostname.replace(/^(www|careers|jobs)\./, '').split('.')[0];
  const uniq = new Map(boards.map(b => [`${b.ats}:${b.token.toLowerCase()}`, { ...b, name, careers_url: startUrl }]));
  return { boards: [...uniq.values()], jobs, browserOnly: [...browserOnly] };
}

async function fetchAts(ats, token, name, c = {}) {
  const t = encodeURIComponent(token);
  const [countryName, iso3] = COUNTRIES[String(profile.country_code || '').toLowerCase()] || [];
  switch (ats) {
    // ----- big-employer search APIs (query-based, so they use the profile's queries) -----
    case 'amazon': {
      const out = [];
      for (const q of queries.slice(0, 3)) {
        const d = await getJSON(`https://www.amazon.jobs/en/search.json?base_query=${encodeURIComponent(q)}${iso3 ? `&normalized_country_code%5B%5D=${iso3}` : ''}&result_limit=100&sort=recent`);
        for (const j of d.jobs || []) out.push(job({
          title: j.title, company: name || 'Amazon', location: j.normalized_location || j.location, url: `https://www.amazon.jobs${j.job_path}`,
          source: 'amazon', posted_at: j.posted_date, description: `${j.description_short || ''}\nBasic qualifications:\n${j.basic_qualifications || ''}\nPreferred:\n${j.preferred_qualifications || ''}`,
        }));
      }
      return out;
    }
    case 'eightfold': {
      const out = [];
      for (const q of queries.slice(0, 3)) {
        const d = await getJSON(`https://${c.host}/api/pcsx/search?domain=${encodeURIComponent(c.domain)}&query=${encodeURIComponent(q)}${countryName ? `&location=${encodeURIComponent(countryName)}` : ''}&start=0&num=50`);
        for (const j of d.data?.positions || []) out.push(job({
          title: j.name, company: name, location: (j.standardizedLocations || j.locations || []).join(' / '),
          remote: /remote/i.test(j.workLocationOption || ''), url: `https://${c.host}${j.positionUrl || `/careers/job/${j.id}`}`,
          source: 'eightfold', posted_at: j.postedTs, description: [j.department, j.workLocationOption].filter(Boolean).join(' · '),
        }));
      }
      return out;
    }
    case 'oraclehcm': {
      const out = [];
      for (const q of queries.slice(0, 3)) {
        const d = await getJSON(`https://${c.host}/hcmRestApi/resources/latest/recruitingCEJobRequisitions?onlyData=true&expand=requisitionList.secondaryLocations&finder=findReqs;siteNumber=${c.site},keyword=%22${encodeURIComponent(q)}%22,limit=100,sortBy=POSTING_DATES_DESC`);
        for (const j of d.items?.[0]?.requisitionList || []) out.push(job({
          title: j.Title, company: name, location: [j.PrimaryLocation, ...(j.secondaryLocations || []).map(s => s.Name)].filter(Boolean).join(' / '),
          url: `https://${c.host}/hcmUI/CandidateExperience/en/sites/${c.site}/job/${j.Id}`, source: 'oraclehcm', posted_at: j.PostedDate,
          description: [j.ShortDescriptionStr, j.JobFamily, j.JobFunction].filter(Boolean).join('\n'),
        }));
      }
      return out;
    }
    // ----- more ATS boards -----
    case 'rippling': {
      const items = [];
      for (let page = 0; page < 10; page++) {
        const d = await getJSON(`https://ats.rippling.com/api/v2/board/${t}/jobs?pageSize=100&page=${page}`);
        items.push(...(d.items || []));
        if (page + 1 >= (d.totalPages || 1)) break;
      }
      return items.map(j => job({
        title: j.name, company: name || token, location: (j.locations || []).map(l => l.name).join(' / '),
        remote: (j.locations || []).some(l => /remote/i.test(l.name || l.workplaceType || '')), url: j.url, source: 'rippling',
        posted_at: j.createdOn || j.updatedOn, description: j.department?.name || '',
      }));
    }
    case 'gem': {
      const d = await getJSON(`https://api.gem.com/job_board/v0/${t}/job_posts/`);
      return (Array.isArray(d) ? d : []).map(j => job({
        title: j.title, company: name || token, location: j.location?.name || (j.offices || []).map(o => o.name).join(' / '),
        remote: /remote/i.test(j.location_type || ''), url: j.absolute_url, source: 'gem', posted_at: j.first_published_at || j.created_at,
        description: j.content_plain || j.content,
      }));
    }
    case 'teamtailor': {
      const d = await getJSON(`https://${t}.teamtailor.com/jobs.json`);
      return (d.items || []).map(j => {
        const jp = j._jobposting || {};
        const loc = [].concat(jp.jobLocation || []).map(l => [l.address?.addressLocality, l.address?.addressCountry].filter(Boolean).join(', ')).join(' / ');
        return job({ title: j.title, company: name || token, location: loc, remote: jp.jobLocationType === 'TELECOMMUTE', url: j.url, source: 'teamtailor', posted_at: j.date_published, description: j.content_html });
      });
    }
    case 'personio': {
      const r = await getText(`https://${t}.jobs.personio.de/xml`);
      if (r.status !== 200) throw new Error(`HTTP ${r.status}`);
      return r.text.split('<position>').slice(1).map(p => {
        const tag = n => decodeEntities(((p.match(new RegExp(`<${n}>([\\s\\S]*?)</${n}>`)) || [])[1] || '').replace(/^<!\[CDATA\[|\]\]>$/g, ''));
        return job({ title: tag('name'), company: name || token, location: tag('office'), url: `https://${t}.jobs.personio.de/job/${tag('id')}`, source: 'personio', posted_at: tag('createdAt'), description: tag('value') });
      });
    }
    case 'bamboohr': {
      const d = await getJSON(`https://${t}.bamboohr.com/careers/list`);
      return (d.result || []).map(j => job({
        title: j.jobOpeningName, company: name || token, location: [j.location?.city, j.location?.state, j.location?.country].filter(Boolean).join(', '),
        remote: Boolean(j.isRemote), url: `https://${t}.bamboohr.com/careers/${j.id}`, source: 'bamboohr', description: j.departmentLabel || '',
      }));
    }
    case 'breezy': {
      const d = await getJSON(`https://${t}.breezy.hr/json`);
      return (Array.isArray(d) ? d : []).map(j => job({
        title: j.name, company: name || j.company?.name || token, location: j.location?.name || '', remote: Boolean(j.location?.is_remote),
        url: j.url, source: 'breezy', posted_at: j.published_date, description: j.department || '',
      }));
    }
    case 'pinpoint': {
      const d = await getJSON(`https://${t}.pinpointhq.com/postings.json`);
      return (d.data || []).map(j => job({
        title: j.title, company: name || token, location: j.location?.name || '', remote: /remote/i.test(j.workplace_type || ''),
        url: j.url, source: 'pinpoint', posted_at: j.created_at || j.published_at, description: j.description || '',
      }));
    }
    case 'greenhouse': {
      const d = await getJSON(`https://boards-api.greenhouse.io/v1/boards/${t}/jobs?content=true`);
      return (d.jobs || []).map(j => job({
        title: j.title, company: name || token, location: j.location?.name, url: j.absolute_url,
        source: 'greenhouse', posted_at: j.first_published || j.updated_at, description: j.content,
      }));
    }
    case 'lever': {
      const d = await getJSON(`https://api.lever.co/v0/postings/${t}?mode=json`);
      return (Array.isArray(d) ? d : []).map(j => job({
        title: j.text, company: name || token, location: j.categories?.location || (j.categories?.allLocations || []).join(' / '),
        remote: j.workplaceType === 'remote', url: j.hostedUrl, source: 'lever', posted_at: j.createdAt,
        description: `${j.descriptionPlain || ''}\n${(j.lists || []).map(l => `${l.text}\n${htmlToText(l.content)}`).join('\n')}`,
      }));
    }
    case 'ashby': {
      const d = await getJSON(`https://api.ashbyhq.com/posting-api/job-board/${t}?includeCompensation=true`);
      return (d.jobs || []).filter(j => j.isListed !== false).map(j => job({
        title: j.title, company: name || token, location: j.location, remote: j.isRemote || j.workplaceType === 'Remote',
        url: j.jobUrl, source: 'ashby', posted_at: j.publishedAt, description: j.descriptionPlain || j.descriptionHtml,
        salary: j.compensation?.compensationTierSummary || '',
      }));
    }
    case 'smartrecruiters': {
      const d = await getJSON(`https://api.smartrecruiters.com/v1/companies/${t}/postings?limit=100`);
      return (d.content || []).map(j => job({
        title: j.name, company: name || j.company?.name || token,
        location: [j.location?.city, j.location?.country].filter(Boolean).join(', '), remote: j.location?.remote,
        url: `https://jobs.smartrecruiters.com/${token}/${j.id}`, source: 'smartrecruiters', posted_at: j.releasedDate,
        description: [j.department?.label, j.function?.label, j.experienceLevel?.label].filter(Boolean).join(' · '),
      }));
    }
    case 'workable': {
      const d = await getJSON(`https://apply.workable.com/api/v1/widget/accounts/${t}`);
      return (d.jobs || []).map(j => job({
        title: j.title, company: name || d.name || token, location: [j.city, j.country].filter(Boolean).join(', '),
        remote: j.telecommuting, url: j.url || j.shortlink, source: 'workable', posted_at: j.published_on,
        description: [j.department, j.function, j.experience].filter(Boolean).join(' · '),
      }));
    }
    case 'recruitee': {
      const d = await getJSON(`https://${t}.recruitee.com/api/offers/`);
      return (d.offers || []).map(j => job({
        title: j.title, company: name || j.company_name || token, location: [j.city, j.country].filter(Boolean).join(', ') || j.location,
        remote: j.remote, url: j.careers_url || j.careers_apply_url, source: 'recruitee', posted_at: j.published_at || j.created_at,
        description: `${j.description || ''}\n${j.requirements || ''}`,
      }));
    }
    default:
      throw new Error(`unknown ats ${ats}`);
  }
}

// Find a company's job board from its name: probe ATS APIs with slug guesses, then crawl its
// website's careers pages for an embedded board or JobPosting data.
async function detectAts(name) {
  for (const slug of slugVariants(name)) {
    for (const ats of ['greenhouse', 'lever', 'ashby', 'smartrecruiters', 'workable', 'recruitee', 'rippling', 'teamtailor', 'personio', 'breezy']) {
      try {
        const jobs = await fetchAts(ats, slug, name);
        if (jobs.length) return { name, boards: [{ name, ats, token: slug }], jobs };
      } catch { /* try next */ }
    }
  }
  const slug = slugVariants(name)[0];
  const sites = ['com', 'in', 'io', 'ai', 'co'].flatMap(tld => [`https://${slug}.${tld}/careers`, `https://${slug}.${tld}/jobs`, `https://careers.${slug}.${tld}/`]);
  for (const site of sites) {
    try {
      const r = await crawlCareers(site, name);
      if (r.boards.length || r.jobs.length) return withBoardJobs(name, r);
    } catch { /* next */ }
  }
  return null;
}
async function withBoardJobs(name, r) {
  const jobs = [...r.jobs];
  const live = [];
  for (const b of r.boards) {
    try { const js = await fetchAts(b.ats, b.token, name || b.name); if (js.length) { jobs.push(...js); live.push(b); } } catch { /* stale embed */ }
  }
  return { name, boards: live, jobs, browserOnly: r.browserOnly || [] };
}

// ---------- scoring ----------
function score(j) {
  const titleN = norm(j.title);
  const hay = `${j.title}\n${j.description}`;
  let s = 0;
  const reasons = [];

  // Title fit (up to 45)
  const exact = titles.find(t => titleN.includes(norm(t)));
  const coreHits = titleCoreWords.filter(w => termRegex(w).test(titleN));
  const nounHit = roleNouns.some(w => termRegex(w).test(titleN));
  if (exact) { s += 45; reasons.push(`title matches "${exact}"`); }
  else if (coreHits.length && (nounHit || !roleNouns.length)) { s += 25 + Math.min(15, coreHits.length * 5); reasons.push(`title words: ${coreHits.join(', ')}`); }
  else if (coreHits.length) { s += 12; }

  // Skills (up to 35 primary + 10 secondary/keywords)
  const matched = primarySkills.filter(k => termRegex(k).test(hay));
  const missing = primarySkills.filter(k => !matched.includes(k));
  s += Math.min(35, matched.length * 6);
  const matched2 = [...secondarySkills, ...extraKeywords].filter(k => termRegex(k).test(hay));
  s += Math.min(10, matched2.length * 2);

  // Location
  const locN = norm(j.location);
  const locHit = locations.some(l => !/remote/i.test(l) && locN.includes(norm(l)));
  // "Remote - US" / "Remote Spain" is remote only for people in that country.
  const regionLeft = locN.replace(/\b(remote|fully|first|friendly|hybrid|or|and|only|work|from|home|anywhere|global|globally|worldwide|world|wide|any|location|timezone|timezones|tz)\b/g, '').replace(/[^a-z]/g, '');
  const openRemote = j.remote && (!regionLeft || /anywhere|global|worldwide/.test(locN));
  if (locHit) { s += 10; reasons.push('preferred location'); }
  else if (openRemote && remoteOk) { s += 8; reasons.push('remote (open)'); }
  else if (locations.length && j.location) { s -= profile.open_to_relocate ? 8 : 25; reasons.push(`location: ${j.location.slice(0, 40)}`); }

  // Seniority mismatch
  const senior = /\b(senior|sr\.?|staff|principal|lead|head|director|vp)\b/i.test(j.title);
  const junior = /\b(intern|internship|junior|jr\.?|graduate|entry|trainee|fresher)\b/i.test(j.title);
  if (['intern', 'junior', 'entry', 'fresher', 'graduate'].includes(seniority) && senior) s -= 25;
  if (['senior', 'staff', 'principal', 'lead'].includes(seniority) && junior) s -= 20;
  if (seniority === 'mid' && /\b(staff|principal|director|vp|head)\b/i.test(j.title)) s -= 15;
  else if (seniority === 'mid' && /\b(senior|sr\.?)\b/i.test(j.title)) s -= 6;
  if (junior && !['intern', 'junior', 'entry', 'fresher', 'graduate'].includes(seniority) && /intern/i.test(j.title)) s -= 30;
  const earlyCareer = ['intern', 'junior', 'entry', 'fresher', 'graduate'].includes(seniority);
  if (earlyCareer && (junior || /\b(new grad|associate|engineer i|sde[- ]?(i|1)|apprentice|campus|university|early career)\b/i.test(j.title))) { s += 8; reasons.push('entry-level title'); }

  // Years of experience asked for vs the candidate's ("3+ years", "2-4 yrs of experience", "minimum 5 years").
  if (profile.years_experience !== undefined) {
    const yrs = Number(profile.years_experience) || 0;
    const asks = [...String(j.description).matchAll(/(?:minimum|min\.?|at least|over)?\s*(\d{1,2})\s*\+?\s*(?:-|–|to)?\s*(?:\d{1,2})?\s*\+?\s*(?:years|yrs)(?:'|’)?\s*(?:of)?\s*(?:[\w-]+\s){0,3}?(?:experience|exp\b)/gi)]
      .map(m => Number(m[1])).filter(n => n > 0 && n <= 15);
    if (asks.length) {
      const req = Math.min(...asks);
      if (req > yrs + 1) { s -= Math.min(35, 6 + (req - yrs - 1) * 8); reasons.push(`asks ${req}+ yrs`); }
    }
  }

  // Recency
  if (j.posted_at) {
    const days = (Date.now() - new Date(j.posted_at)) / 864e5;
    if (days <= 14) s += 5;
    else if (days > 60) s -= 10;
  }

  return { score: Math.max(0, Math.min(100, Math.round(s))), matched_skills: [...matched, ...matched2], missing_skills: missing, why: reasons.join('; ') };
}

function relevant(j) {
  if (!j.title || !j.url) return false;
  if (excludeCompanies.has(norm(j.company))) return false;
  if (excludeKeywords.some(k => termRegex(k).test(j.title))) return false;
  if (j.posted_at && MAX_AGE_DAYS && (Date.now() - new Date(j.posted_at)) / 864e5 > MAX_AGE_DAYS) return false;
  const titleN = norm(j.title);
  const titleHit = titles.some(t => titleN.includes(norm(t))) || titleCoreWords.some(w => termRegex(w).test(titleN));
  const skillHits = primarySkills.filter(k => termRegex(k).test(`${j.title}\n${j.description}`)).length;
  return titleHit || skillHits >= 2;
}

// ---------- main ----------
async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const report = {};
  const all = [];

  const discovered = [];
  if (args.detect) {
    const names = String(args.detect).split(',').map(s => s.trim()).filter(Boolean);
    const found = await pool(names, 4, detectAts);
    found.forEach((f, i) => {
      if (f && !f.error && f.jobs.length) {
        all.push(...f.jobs); discovered.push(...f.boards);
        report[`detect:${names[i]}`] = `${f.boards.map(b => `${b.ats}:${b.token}`).join(', ') || 'careers page'} (${f.jobs.length} jobs)`;
      } else report[`detect:${names[i]}`] = 'not found; find the careers page URL with web search and pass it via --crawl';
    });
  }
  if (args.crawl) {
    const urls = String(args.crawl).split(',').map(s => s.trim()).filter(Boolean);
    const found = await pool(urls, 3, async u => withBoardJobs(null, await crawlCareers(u.startsWith('http') ? u : `https://${u}`)));
    found.forEach((f, i) => {
      if (f && !f.error && f.jobs.length) {
        all.push(...f.jobs); discovered.push(...f.boards);
        report[`crawl:${urls[i]}`] = `${f.boards.map(b => `${b.ats}:${b.token}`).join(', ') || 'JobPosting data'} (${f.jobs.length} jobs)`;
      } else report[`crawl:${urls[i]}`] = f?.browserOnly?.length ? `uses ${f.browserOnly.join(", ")}: open it in the browser to read jobs` : `no board or JobPosting data found${f?.error ? ` (${f.error.message})` : ''}; the page may render jobs with JavaScript, so open it in the browser instead`;
    });
  }
  if (discovered.length) saveCompanies(discovered);

  if (args.fixtures) {
    const fx = JSON.parse(fs.readFileSync(args.fixtures, 'utf8'));
    all.push(...fx.map(f => job({ source: 'fixture', ...f })));
    report.fixtures = `${fx.length} jobs`;
  }
  await Promise.all([...SOURCES].map(async name => {
    if (!sources[name]) { report[name] = 'unknown source'; return; }
    const t0 = Date.now();
    try {
      const r = await sources[name]();
      if (typeof r === 'string') { report[name] = r; return; }
      all.push(...r);
      report[name] = `${r.length} raw jobs in ${((Date.now() - t0) / 1000).toFixed(1)}s`;
    } catch (e) {
      report[name] = `error: ${e.message}`;
    }
  }));

  // LinkedIn search cards have no description: fetch the public job page for relevant ones so
  // skills can be scored, and drop postings that say they're no longer accepting applications.
  const liJobs = all.filter(j => j._linkedinId && relevant(j));
  const liTake = liJobs.slice(0, Number(args['linkedin-details'] ?? 80));
  let liClosed = 0;
  await pool(liTake, 2, async j => {
    const r = await getText(`https://www.linkedin.com/jobs-guest/jobs/api/jobPosting/${j._linkedinId}`, { retries: 1 });
    if (/no longer accepting applications/i.test(r.text)) { j._closed = true; liClosed++; return; }
    const desc = (r.text.match(/show-more-less-html__markup[^>]*>([\s\S]*?)<\/div>/) || [])[1];
    if (desc) j.description = htmlToText(desc).slice(0, 6000);
    const level = htmlToText((r.text.match(/Seniority level[\s\S]*?description__job-criteria-text[^>]*>([\s\S]*?)<\/span>/) || [])[1]);
    if (level) j.description = `Seniority: ${level}\n${j.description}`;
    const apply = (r.text.match(/"(https?:\/\/[^"]+)"[^>]*>\s*Apply/i) || [])[1];
    if (apply && !/linkedin\.com/.test(apply)) j.apply_url = decodeEntities(apply);
    // Competition signal: "190 applicants", "Over 200 applicants", "Be among the first 25 applicants".
    const appl = htmlToText((r.text.match(/num-applicants__caption[^>]*>([\s\S]*?)<\/(?:span|figcaption)>/) || [])[1]);
    const n = appl.match(/(\d[\d,]*)/);
    if (n) { j.applicants = Number(n[1].replace(/,/g, '')); j.applicants_text = appl.trim(); }
    await sleep(700);
  });
  if (SOURCES.has('linkedin')) report.linkedin = `${report.linkedin || ''}; ${liTake.length} detailed, ${liClosed} closed dropped`;

  // Filter, score, dedupe
  const seen = new Map();
  for (const j of all) {
    if (j._closed || !relevant(j)) continue;
    const sc = score(j);
    if (sc.score < MIN_SCORE) continue;
    const key = `${norm(j.company)}|${norm(j.title)}|${norm(j.location).split(' ')[0] || ''}`;
    const cur = seen.get(key);
    const { _linkedinId, _closed, ...clean } = j;
    const rec = { ...clean, ...sc };
    if (!cur || rec.score > cur.score || (rec.description.length > cur.description.length && rec.score === cur.score)) seen.set(key, rec);
  }
  let ranked = [...seen.values()]
    .sort((a, b) => b.score - a.score || String(b.posted_at).localeCompare(String(a.posted_at)))
    .slice(0, MAX_RESULTS);

  // Liveness: re-check the top results from sources that don't guarantee the job is still open.
  if (!args['no-verify']) {
    const LIVE_CHECK = new Set(['hn-whoishiring', 'remotive', 'remoteok', 'jobicy', 'himalayas', 'weworkremotely', 'arbeitnow', 'careers-page']);
    const toCheck = ranked.slice(0, 60).filter(j => LIVE_CHECK.has(j.source) || j.source.startsWith('jsearch') || j.source === 'adzuna');
    await pool(toCheck, 4, async j => {
      try {
        const r = await getText(j.url);
        if (r.status === 404 || r.status === 410 ||
          /(no longer (accepting|available|open)|position has been filled|job (has )?expired|this job is closed|job posting (has been )?(removed|closed))/i.test(r.text.slice(0, 200000))) j.closed = true;
        else if (r.status === 200) j.verified_live = true;
      } catch { /* unknown: keep */ }
    });
    const closed = ranked.filter(j => j.closed).length;
    ranked = ranked.filter(j => !j.closed);
    report.verify = `${toCheck.length} checked, ${closed} closed dropped (ATS and LinkedIn jobs are live by source)`;
  }

  // Stable IDs across runs, and a "new since last run" flag.
  const statePath = path.join(OUT_DIR, '.seen.json');
  const state = readJSON(statePath, { next: 1, ids: {}, first_seen: {} });
  const runAt = new Date().toISOString();
  ranked = ranked.map(j => {
    const key = j.url.replace(/[?#].*$/, '').replace(/\/$/, '').toLowerCase();
    const isNew = !state.ids[key];
    if (isNew) { state.ids[key] = `J${String(state.next++).padStart(3, '0')}`; state.first_seen[key] = runAt; }
    return { id: state.ids[key], new: isNew, first_seen: state.first_seen[key], ...j, snippet: j.description.slice(0, 400) };
  });
  fs.writeFileSync(statePath, JSON.stringify(state));

  const jsonPath = path.join(OUT_DIR, 'jobs.json');
  fs.writeFileSync(jsonPath, JSON.stringify({ generated_at: runAt, queries, sources: report, count: ranked.length, jobs: ranked }, null, 2));

  // Every job ever matched, by ID, so leads/tracker/evaluations keep resolving after re-runs.
  const archivePath = path.join(OUT_DIR, 'jobs-archive.json');
  const archive = readJSON(archivePath, {});
  for (const j of ranked) archive[j.id] = { ...j, last_seen: runAt };
  fs.writeFileSync(archivePath, JSON.stringify(archive));

  const cell = s => String(s || '').replace(/\|/g, '/').replace(/\s+/g, ' ');
  const newCount = ranked.filter(j => j.new).length;
  const md = [
    `# Job matches (${ranked.length}, ${newCount} new)`,
    '',
    `Generated ${runAt.slice(0, 16).replace('T', ' ')} UTC from queries: ${queries.join(', ')}`,
    '',
    '| ID | Score | Title | Company | Location | Posted | Source | Link |',
    '|---|---|---|---|---|---|---|---|',
    ...ranked.map(j => `| ${j.id}${j.new ? ' 🆕' : ''} | ${j.score} | ${cell(j.title)} | ${cell(j.company)} | ${cell(j.location).slice(0, 40)} | ${j.posted_at ? j.posted_at.slice(0, 10) : ''} | ${j.source} | [apply](${j.apply_url || j.url}) |`),
    '',
  ].join('\n');
  fs.writeFileSync(path.join(OUT_DIR, 'jobs.md'), md);

  console.log(JSON.stringify({ out: jsonPath, matched: ranked.length, new: newCount, raw: all.length, sources: report }, null, 2));
}

main().catch(e => { console.error(e); process.exit(1); });
