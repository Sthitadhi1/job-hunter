#!/usr/bin/env node
// Resume gap analysis for the job-hunter plugin. Zero dependencies.
//
//   node resume_gaps.mjs [--dir job-hunt] [--resume job-hunt/resume.txt] [--jobs 40] [--terms "Kafka,gRPC"]
//
// 1. Market gaps: which skills/keywords appear in the user's matched jobs (targets first, then the
//    top-scored jobs) and whether the resume mentions them. Demand % = share of those jobs.
// 2. ATS + writing checks: sections, contact links, length, quantified bullets, weak phrases,
//    buzzwords, first-person pronouns, very long bullets.
// Writes job-hunt/resume-gaps.json and prints a summary. The resume-review skill turns it into advice.

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
const resumePath = args.resume || path.join(DIR, 'resume.txt');
if (!fs.existsSync(resumePath)) { console.error(`No resume text at ${resumePath}: run resume-profile first.`); process.exit(2); }
const resume = fs.readFileSync(resumePath, 'utf8');
const profile = readJSON(path.join(DIR, 'profile.json'), {});

// Broad skill vocabulary across common job families; profile skills and --terms are added on top.
const VOCAB = [
  'Python', 'Java', 'JavaScript', 'TypeScript', 'Go', 'Golang', 'Rust', 'C', 'C++', 'C#', 'Kotlin', 'Swift', 'Scala', 'Ruby', 'PHP', 'R', 'MATLAB', 'SQL', 'NoSQL', 'Bash',
  'React', 'Angular', 'Vue', 'Next.js', 'Node.js', 'Express', 'Django', 'Flask', 'FastAPI', 'Spring Boot', '.NET', 'Rails', 'Laravel', 'GraphQL', 'REST APIs', 'gRPC', 'WebSockets', 'Microservices',
  'HTML', 'CSS', 'Tailwind', 'Redux', 'Jest', 'Vitest', 'Cypress', 'Playwright', 'Selenium', 'JUnit', 'PyTest', 'Unit Testing', 'TDD',
  'PostgreSQL', 'MySQL', 'MongoDB', 'Redis', 'Cassandra', 'DynamoDB', 'Elasticsearch', 'SQLite', 'Oracle', 'Snowflake', 'BigQuery', 'Redshift', 'Databricks', 'Kafka', 'RabbitMQ', 'Spark', 'Hadoop', 'Airflow', 'dbt', 'ETL', 'Data Pipelines',
  'AWS', 'Azure', 'GCP', 'Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'GitHub Actions', 'CI/CD', 'Linux', 'Nginx', 'Serverless', 'Prometheus', 'Grafana', 'Observability',
  'Machine Learning', 'Deep Learning', 'PyTorch', 'TensorFlow', 'scikit-learn', 'Pandas', 'NumPy', 'NLP', 'Computer Vision', 'LLM', 'RAG', 'LangChain', 'Generative AI', 'Prompt Engineering', 'Hugging Face', 'MLOps', 'Statistics', 'A/B Testing',
  'Data Structures', 'Algorithms', 'System Design', 'Distributed Systems', 'Object-Oriented Design', 'Design Patterns', 'Multithreading', 'Concurrency', 'Performance Optimization', 'Caching', 'Scalability', 'OAuth',
  'Android', 'iOS', 'React Native', 'Flutter', 'Git', 'Agile', 'Scrum', 'Jira', 'Code Review',
  'Excel', 'Power BI', 'Tableau', 'Looker', 'Data Analysis', 'Data Visualization', 'Financial Modeling', 'Forecasting', 'SAP', 'Salesforce', 'HubSpot', 'SEO', 'SEM', 'Google Analytics', 'Content Marketing', 'Copywriting',
  'Figma', 'Photoshop', 'Illustrator', 'User Research', 'Prototyping', 'Wireframing', 'Product Management', 'Roadmapping', 'Stakeholder Management', 'Mentoring',
  'Payments', 'Fintech', 'E-commerce', 'SaaS', 'Blockchain', 'Embedded Systems', 'IoT', 'Networking', 'Cybersecurity', 'Penetration Testing',
];
const terms = [...new Map([...VOCAB, ...(profile.skills?.primary || []), ...(profile.skills?.secondary || []), ...String(args.terms || '').split(',')]
  .map(t => String(t).trim()).filter(Boolean).map(t => [t.toLowerCase(), t])).values()];
const escapeRe = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const ALIASES = { 'node.js': ['nodejs', 'node js'], 'next.js': ['nextjs'], postgresql: ['postgres'], kubernetes: ['k8s'], golang: ['go lang'], 'ci/cd': ['ci cd', 'continuous integration'], aws: ['amazon web services'], gcp: ['google cloud platform'], 'machine learning': ['ml'], 'rest': ['restful'], 'c++': ['cpp'], 'object-oriented design': ['oop', 'object oriented'] };
const re = t => {
  const alts = [t, ...(ALIASES[t.toLowerCase()] || [])].map(a => escapeRe(a.toLowerCase()));
  return new RegExp(`(^|[^a-z0-9])(${alts.join('|')})(?=$|[^a-z0-9+#])`, 'i');
};
const NOISY = new Set(['c', 'r', 'go', 'rest', 'communication', 'leadership', 'documentation', 'security', 'git']); // need care: short or generic

// ---------- jobs to compare against ----------
const targets = (readJSON(path.join(DIR, 'targets.json'), { targets: [] }).targets || []).map(t => t.id);
const archive = readJSON(path.join(DIR, 'jobs-archive.json'), {});
const current = readJSON(path.join(DIR, 'jobs.json'), { jobs: [] }).jobs || [];
const pool = [...targets.map(id => archive[id] || current.find(j => j.id === id)).filter(Boolean),
  ...current.slice().sort((a, b) => (b.score || 0) - (a.score || 0))];
const seen = new Set();
const jobs = pool.filter(j => j && j.description && !seen.has(j.id) && seen.add(j.id)).slice(0, Number(args.jobs || 40));

const demand = terms.map(t => {
  const r = re(t);
  const n = jobs.filter(j => r.test(`${j.title}\n${j.description}`)).length;
  return { term: t, jobs: n, demand_pct: jobs.length ? Math.round(100 * n / jobs.length) : 0, in_resume: r.test(resume), noisy: NOISY.has(t.toLowerCase()) };
}).filter(d => d.jobs > 0 || d.in_resume);
const gaps = demand.filter(d => !d.in_resume && d.demand_pct >= 10 && !d.noisy).sort((a, b) => b.demand_pct - a.demand_pct);
const strengths = demand.filter(d => d.in_resume && d.demand_pct >= 10).sort((a, b) => b.demand_pct - a.demand_pct);
const unused = demand.filter(d => d.in_resume && d.jobs === 0 && !d.noisy).map(d => d.term);

// ---------- ATS + writing checks ----------
const lines = resume.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
const bullets = lines.filter(l => /^([-•*▪◦●]|\d+[.)])\s+/.test(l)).map(l => l.replace(/^([-•*▪◦●]|\d+[.)])\s+/, ''));
const has = r => r.test(resume);
const SECTIONS = { summary: /\b(summary|profile|objective|about me)\b/i, skills: /\b(skills|technical skills|technologies|tools)\b/i, experience: /\b(experience|employment|work history|internships?)\b/i, projects: /\bprojects?\b/i, education: /\beducation\b/i, achievements: /\b(achievements|awards|certifications?|open[- ]source|publications)\b/i };
const WEAK = /\b(responsible for|worked on|helped( with)?|assisted( in| with)?|involved in|participated in|duties included|tasked with|was part of|handled various)\b/i;
const BUZZ = /\b(hard[- ]?working|team player|passionate|go[- ]getter|synergy|detail[- ]oriented|self[- ]motivated|results[- ]driven|think outside the box|quick learner|rockstar|ninja)\b/gi;
const words = resume.split(/\s+/).filter(Boolean).length;
const quantified = bullets.filter(b => /\d/.test(b));
const checks = {
  words, est_pages: Math.max(1, Math.round(words / 550 * 10) / 10),
  sections: Object.fromEntries(Object.entries(SECTIONS).map(([k, r]) => [k, has(r)])),
  contact: { email: has(/[\w.+-]+@[\w-]+\.[\w.]+/), phone: has(/\+?\d[\d\s-]{8,}\d/), linkedin: has(/linkedin\.com\/in\/|\blinkedin\b/i), github_or_portfolio: has(/github\.com|gitlab\.com|portfolio|behance|dribbble|\bgithub\b/i) },
  bullets: bullets.length,
  quantified_bullets: quantified.length,
  quantified_pct: bullets.length ? Math.round(100 * quantified.length / bullets.length) : 0,
  weak_phrase_bullets: bullets.filter(b => WEAK.test(b)).slice(0, 10),
  long_bullets: bullets.filter(b => b.split(/\s+/).length > 35).slice(0, 10),
  buzzwords: [...new Set((resume.match(BUZZ) || []).map(s => s.toLowerCase()))],
  first_person: (resume.match(/\b(I|me|my|myself)\b/g) || []).length,
};

const out = { resume: resumePath, compared_jobs: jobs.length, from_targets: targets.length, gaps: gaps.slice(0, 25), strengths: strengths.slice(0, 25), resume_skills_not_in_demand: unused.slice(0, 20), checks };
fs.mkdirSync(DIR, { recursive: true });
fs.writeFileSync(path.join(DIR, 'resume-gaps.json'), JSON.stringify(out, null, 2));
console.log(JSON.stringify({
  compared_jobs: jobs.length,
  top_gaps: gaps.slice(0, 12).map(g => `${g.term} (${g.demand_pct}% of jobs)`),
  top_strengths: strengths.slice(0, 10).map(g => `${g.term} (${g.demand_pct}%)`),
  checks: { ...checks, weak_phrase_bullets: checks.weak_phrase_bullets.length, long_bullets: checks.long_bullets.length },
  written: path.join(DIR, 'resume-gaps.json'),
}, null, 2));
