// scripts/guardian/rules.mjs — reglas compartidas por la CI (guardian.yml) y los hooks de Claude Code (.claude/hooks/).
// Solo miran líneas NUEVAS: el código viejo no hace fallar nada. Ajustes para este proyecto:
// - console-log y datos-simulados son avisos: el monitoreo escribe JSON por consola y la demo simula a propósito.
// - Las excepciones de ESLint van con su razón en la línea ("-- porque…"), como pide CLAUDE.md.
export const isTest = (f) => /(\.test\.|\.spec\.|__tests__\/|(^|\/)tests?\/|__mocks__\/|\.stories\.|(^|\/)evals\/)/.test(f);
export const isCode = (f) => /\.(m?[jt]sx?|cjs|py)$/.test(f);
export const isEnvFile = (f) => /(^|\/)\.env(?!\.example$)(\.|$)/.test(f);
export const OK_PRAGMA = /guardian-ok:\s*\S/;
// El propio guardián contiene los patrones que busca: no se revisa su contenido (sí sale como archivo protegido).
export const isGuardian = (f) => /(^|\/)(scripts\/guardian|\.claude\/hooks)\//.test(f);

// files: 'any' = cualquier archivo; si no, solo código. scope: 'prod' = fuera de pruebas; 'test' = solo pruebas.
export const RULES = [
  { id: 'ts-ignore',        level: 'block', re: /@ts-ignore|@ts-nocheck/ },
  { id: 'as-any',           level: 'block', re: /\bas any\b|<any>/, scope: 'prod' },
  { id: 'eslint-disable',   level: 'block', re: /eslint-disable(?![^\n]*--\s*\S)/ },
  { id: 'catch-vacio',      level: 'block', re: /catch\s*(\([^)]*\))?\s*\{\s*\}/ },
  { id: 'catch-silencioso', level: 'block', re: /\.catch\(\s*\(?\s*\w*\s*\)?\s*=>\s*(\{\s*\}|null|undefined)\s*\)/ },
  { id: 'except-generico',  level: 'warn',  re: /except\s*:|except\s+Exception\s*:/ },
  { id: 'test-skip-only',   level: 'block', re: /\b(it|test|describe)\.(skip|only)\b|\bx(it|describe|test)\(|@pytest\.mark\.skip/, scope: 'test' },
  { id: 'bypass-auth',      level: 'block', re: /isAdmin\s*[:=]\s*true|skipAuth|bypassAuth|DISABLE_AUTH/i, scope: 'prod' },
  { id: 'datos-simulados',  level: 'warn',  re: /mock(ed)?Data|fakeData|lorem ipsum|jsonplaceholder|not implemented/i, scope: 'prod' },
  { id: 'console-log',      level: 'warn',  re: /console\.log\(/, scope: 'prod' },
  { id: 'secreto',          level: 'block', files: 'any', re: /sk-[A-Za-z0-9_-]{20,}|sk_live_[A-Za-z0-9]{10,}|AKIA[0-9A-Z]{16}|eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\./ },
  { id: 'verificador-off',  level: 'block', files: 'any', re: /ignoreBuildErrors|ignoreDuringBuilds|"strict"\s*:\s*false|"noImplicitAny"\s*:\s*false/ },
];

// Archivos que la IA no toca sin permiso explícito (arrancar Claude Code con GUARDIAN_ALLOW_CONFIG=1).
// Migraciones: CLAUDE.md pide que una ya aplicada nunca se edite.
export const PROTECTED = [
  /(^|\/)tsconfig[^/]*\.json$/, /(^|\/)(\.eslintrc[^/]*|eslint\.config\.[^/]+)$/,
  /(^|\/)(next|vite|vitest|jest)\.config\.[^/]+$/, /(^|\/)\.github\/workflows\//,
  /(^|\/)package\.json$/, /(^|\/)supabase\/migrations\//, /(^|\/)vercel\.json$/,
  /(^|\/)scripts\/guardian\//, /(^|\/)\.claude\/(settings[^/]*\.json|hooks\/)/, /(^|\/)\.husky\//,
];

export function applies(rule, file) {
  if (isGuardian(file)) return false;
  if (rule.files !== 'any' && !isCode(file)) return false;
  if (rule.scope === 'prod' && isTest(file)) return false;
  if (rule.scope === 'test' && !isTest(file)) return false;
  return true;
}
