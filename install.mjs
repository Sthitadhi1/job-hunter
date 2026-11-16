#!/usr/bin/env node
// Install job-hunter for AI agents other than Claude Code (Claude Code uses /plugin install).
//
//   node install.mjs --codex                 # copy skills to ~/.codex/skills (Codex Agent Skills)
//   node install.mjs --skills-dir <path>     # copy skills to any folder your agent loads skills from
//   node install.mjs --workspace <folder>    # set up a job-hunt workspace for any AGENTS.md agent
//                                              (OpenCode, Cursor, Amp, Gemini CLI, Codex ...)
//   node install.mjs --uninstall --codex     # remove what --codex installed
//
// Skills are copied (not linked), so re-run after updating the plugin.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const SKILLS = path.join(ROOT, 'skills');
const args = {};
for (let i = 2; i < process.argv.length; i++) {
  const a = process.argv[i];
  if (!a.startsWith('--')) continue;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) args[a.slice(2)] = true; else { args[a.slice(2)] = v; i++; }
}
const PREFIX = 'job-hunter-';
const skillNames = fs.readdirSync(SKILLS).filter(n => fs.existsSync(path.join(SKILLS, n, 'SKILL.md')));
const done = [];

function copySkills(dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const name of skillNames) {
    const target = path.join(dest, PREFIX + name);
    if (args.uninstall) { fs.rmSync(target, { recursive: true, force: true }); continue; }
    fs.rmSync(target, { recursive: true, force: true });
    fs.cpSync(path.join(SKILLS, name), target, { recursive: true });
    // Keep the skill's `name` unique in the target agent and point cross-skill references at the copies.
    const p = path.join(target, 'SKILL.md');
    let md = fs.readFileSync(p, 'utf8').replace(/^name:\s*(.+)$/m, (_, n) => `name: ${PREFIX}${n.trim()}`);
    md = md.replace(/<job-tracker base>/g, path.join(dest, PREFIX + 'job-tracker'));
    fs.writeFileSync(p, md);
  }
  // Commands become plain reference files next to the skills.
  if (!args.uninstall) fs.cpSync(path.join(ROOT, 'commands'), path.join(dest, `${PREFIX}commands`), { recursive: true });
  else fs.rmSync(path.join(dest, `${PREFIX}commands`), { recursive: true, force: true });
  done.push(`${args.uninstall ? 'removed' : 'installed'} ${skillNames.length} skills ${args.uninstall ? 'from' : 'to'} ${dest}`);
}

if (args.codex) copySkills(path.join(process.env.CODEX_HOME || path.join(os.homedir(), '.codex'), 'skills'));
if (args['skills-dir']) copySkills(path.resolve(String(args['skills-dir'])));

if (args.workspace) {
  const ws = path.resolve(String(args.workspace));
  fs.mkdirSync(path.join(ws, 'job-hunt'), { recursive: true });
  const agents = fs.readFileSync(path.join(ROOT, 'AGENTS.md'), 'utf8')
    .replace(/`(skills|commands)\//g, `\`${ROOT.replace(/\\/g, '/')}/$1/`)
    .replace('All logic lives in', `The toolkit is installed at \`${ROOT.replace(/\\/g, '/')}\`. All logic lives in`);
  for (const f of ['AGENTS.md', 'GEMINI.md']) {
    const p = path.join(ws, f);
    if (fs.existsSync(p) && !fs.readFileSync(p, 'utf8').includes('job-hunter')) {
      fs.appendFileSync(p, `\n\n${agents}`);
      done.push(`appended job-hunter section to existing ${p}`);
    } else {
      fs.writeFileSync(p, agents);
      done.push(`wrote ${p}`);
    }
  }
  done.push(`workspace ready: open ${ws} in your agent and say "here's my resume, run the job hunt"`);
}

if (!done.length) {
  console.log('Nothing to do. Use --codex, --skills-dir <path> or --workspace <folder> (see the top of this file).');
  process.exit(2);
}
console.log(done.join('\n'));
