#!/usr/bin/env node
// Revisa solo las líneas AGREGADAS de un cambio.
// Uso: node scripts/guardian/diff.mjs --staged | --base origin/main | (sin args = cambios sin commitear)
//      --strict-config  → los archivos protegidos bloquean en vez de advertir
import { execSync } from 'node:child_process';
import { RULES, PROTECTED, applies, isEnvFile, isGuardian, OK_PRAGMA } from './rules.mjs';

const a = process.argv.slice(2);
const range = a.includes('--staged') ? '--cached'
  : a.includes('--base') ? `${a[a.indexOf('--base') + 1]}...HEAD`
  : 'HEAD';
const diff = execSync(`git diff ${range} -U0 --no-color --no-ext-diff`, { encoding: 'utf8', maxBuffer: 1 << 26 });

const hits = []; const touched = new Set();
let file = null; let ln = 0; let pragmas = 0;
for (const line of diff.split('\n')) {
  if (line.startsWith('+++ ')) { file = line === '+++ /dev/null' ? null : line.slice(6); if (file) touched.add(file); continue; }
  if (line.startsWith('@@')) { ln = Number(/\+(\d+)/.exec(line)?.[1] ?? 0); continue; }
  if (!file || !line.startsWith('+') || isGuardian(file)) continue;
  const text = line.slice(1); const at = ln++;
  if (OK_PRAGMA.test(text)) { pragmas++; continue; }
  for (const r of RULES) if (applies(r, file) && r.re.test(text)) hits.push({ ...r, file, ln: at, text: text.trim().slice(0, 140) });
}

const strict = a.includes('--strict-config') && process.env.GUARDIAN_ALLOW_CONFIG !== '1';
for (const f of touched) {
  if (isEnvFile(f)) hits.push({ id: 'env-en-git', level: 'block', file: f, text: 'archivo .env incluido en el cambio' });
  else if (PROTECTED.some((p) => p.test(f))) hits.push({ id: 'config-protegida', level: strict ? 'block' : 'warn', file: f, text: 'archivo protegido modificado: revisar a mano' });
}

for (const h of hits) console.error(`${h.level === 'block' ? '✖' : '⚠'} [${h.id}] ${h.file}${h.ln ? ':' + h.ln : ''}  ${h.text}`);
if (pragmas) console.error(`ℹ ${pragmas} excepción(es) "guardian-ok" en este cambio: revísalas en el PR.`);
const blocks = hits.filter((h) => h.level === 'block').length;
if (blocks) { console.error(`\nGuardián: ${blocks} bloqueo(s). Corrige la causa o, si está justificado, agrega en la misma línea:  // guardian-ok: <razón>`); process.exit(1); }
console.error(hits.length ? `Guardián: ${hits.length} advertencia(s), sin bloqueos.` : 'Guardián: sin hallazgos.');
