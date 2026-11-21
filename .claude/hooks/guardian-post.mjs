#!/usr/bin/env node
// PostToolUse: ESLint sobre el archivo recién editado (ESLint 9, config de Next en eslint.config.mjs).
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
const f = JSON.parse(readFileSync(0, 'utf8')).tool_input?.file_path ?? '';
if (!/\.(m?[jt]sx?)$/.test(f)) process.exit(0);
try { execFileSync('npx', ['eslint', '--no-warn-ignored', f], { stdio: 'pipe', encoding: 'utf8' }); }
catch (e) { console.error(`ESLint en ${f}:\n${(e.stdout ?? '').slice(-2500)}`); process.exit(2); }
