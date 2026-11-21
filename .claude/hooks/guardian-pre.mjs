#!/usr/bin/env node
// PreToolUse: frena los atajos antes de que Claude los escriba (reglas en scripts/guardian/rules.mjs).
// Solo bloquea si el cambio AGREGA ocurrencias: editar código viejo que ya las tenía no estorba.
import { readFileSync, existsSync } from 'node:fs';
import { RULES, PROTECTED, applies, isEnvFile } from '../../scripts/guardian/rules.mjs';

const input = JSON.parse(readFileSync(0, 'utf8'));
const t = input.tool_input ?? {};
const out = (decision, reason) => {
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: decision, permissionDecisionReason: reason } }));
  process.exit(0);
};

if (input.tool_name === 'Bash') {
  const cmd = t.command ?? '';
  if (/rm\s+-rf\s+(\/|~|\.)(\s|$)|git\s+push\b.*(--force|\s-f\b)|git\s+reset\s+--hard|supabase\s+db\s+reset|prisma\s+migrate\s+reset|drop\s+(table|database|schema)/i.test(cmd))
    out('deny', 'Guardián: comando destructivo bloqueado. Si de verdad hace falta, pídele al usuario que lo corra él.');
  if (/\b(npm\s+(i|install|add)|pnpm\s+add|yarn\s+add|bun\s+add|pip\s+install|poetry\s+add|uv\s+add)\b/.test(cmd))
    out('ask', 'Guardián: instalar dependencias requiere aprobación. ¿El paquete existe, es el oficial y hace falta?');
  process.exit(0);
}

const file = (t.file_path ?? '').replace(/\\/g, '/');
const after = [t.content, t.new_string, ...(t.edits ?? []).map((e) => e.new_string)].filter(Boolean).join('\n');
let before = [t.old_string, ...(t.edits ?? []).map((e) => e.old_string)].filter(Boolean).join('\n');
if (t.content !== undefined && existsSync(t.file_path)) before = readFileSync(t.file_path, 'utf8');

if (process.env.GUARDIAN_ALLOW_CONFIG !== '1' && (isEnvFile(file) || PROTECTED.some((p) => p.test(file))))
  out('deny', `Guardián: ${file} es un archivo protegido (config, CI, migraciones, dependencias o el propio guardián). No lo cambies sin pedido explícito del usuario: explícale qué quieres cambiar y por qué.`);

if (/guardian-ok/.test(after) && !/guardian-ok/.test(before))
  out('deny', 'Guardián: las excepciones "guardian-ok" solo las agrega una persona. Resuelve el problema de fondo.');

const count = (re, s) => (s.match(new RegExp(re.source, re.flags.replace('g', '') + 'g')) ?? []).length;
const nuevos = RULES.filter((r) => r.level === 'block' && applies(r, file) && count(r.re, after) > count(r.re, before));
if (nuevos.length)
  out('deny', `Guardián: este cambio agrega ${nuevos.map((r) => r.id).join(', ')}. No silencies errores ni apagues verificadores: corrige la causa (tipo real, manejo explícito del error, prueba que pruebe de verdad).`);
process.exit(0);
