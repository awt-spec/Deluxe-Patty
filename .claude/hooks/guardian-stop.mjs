#!/usr/bin/env node
// Stop: no deja terminar el turno con atajos nuevos o tipos rotos. Un solo intento por turno.
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
const input = JSON.parse(readFileSync(0, 'utf8'));
if (input.stop_hook_active) process.exit(0);
process.chdir(process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const cambios = execSync('git status --porcelain', { encoding: 'utf8' }).trim();
if (!cambios) process.exit(0);
const run = (cmd) => { try { execSync(cmd, { stdio: 'pipe', encoding: 'utf8', timeout: 240000 }); return null; }
  catch (e) { return `$ ${cmd}\n${(e.stdout ?? '') + (e.stderr ?? '')}`.slice(-3000); } };
// tsc tarda ~30 s: solo si cambió algo de TypeScript.
const conTs = /\.(m?tsx?)$/m.test(cambios.split('\n').map((l) => l.slice(3)).join('\n'));
const fallas = [run('node scripts/guardian/diff.mjs'), conTs ? run('npx tsc --noEmit') : null].filter(Boolean);
if (fallas.length) { console.error('Antes de terminar, corrige esto (sin silenciarlo):\n\n' + fallas.join('\n\n')); process.exit(2); }
