// Monta (o pone al día) el proyecto real de Supabase por su API de administración, sin conexión directa
// a Postgres: aplica las migraciones pendientes en orden, carga la semilla si el corredor no existe,
// configura Auth y revisa que todas las tablas tengan RLS. Se puede correr las veces que haga falta.
//
//   SUPABASE_ACCESS_TOKEN=… npx tsx scripts/montar-supabase.mts <project-ref> [https://dominio-de-la-app]
//
// Deja NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY en .env.local
// (ignorado por git) para copiarlas a Vercel. Nunca imprime la service_role.
import { chmodSync, existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";

const [ref, appUrl] = process.argv.slice(2);
const token = process.env.SUPABASE_ACCESS_TOKEN;
if (!ref || !/^[a-z]{20}$/.test(ref) || !token) {
  console.error("Uso: SUPABASE_ACCESS_TOKEN=… npx tsx scripts/montar-supabase.mts <project-ref> [https://dominio-de-la-app]");
  process.exit(1);
}
if (appUrl && !/^https?:\/\/[^/]+$/.test(appUrl)) {
  console.error("La dirección de la app va sin barra final, por ejemplo https://asistente.ejemplo.com");
  process.exit(1);
}
// Solo para probar el script contra una imitación local de la API.
const API = process.env.SUPABASE_API_URL ?? "https://api.supabase.com";
const raiz = new URL("../", import.meta.url);

async function api<T>(metodo: string, ruta: string, cuerpo?: unknown): Promise<T> {
  const res = await fetch(`${API}/v1/projects/${ref}${ruta}`, {
    method: metodo,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
  });
  const texto = await res.text();
  if (!res.ok) throw new Error(`${metodo} ${ruta}: ${res.status} ${texto.slice(0, 500)}`);
  return (texto ? JSON.parse(texto) : null) as T;
}

const sql = <T = Record<string, unknown>,>(query: string) => api<T[]>("POST", "/database/query", { query });
const literal = (s: string) => `'${s.replace(/'/g, "''")}'`;

// 1. Proyecto activo
const proyecto = await api<{ name: string; status: string; region: string }>("GET", "");
console.log(`Proyecto: ${proyecto.name} (${proyecto.region}), estado ${proyecto.status}`);
if (proyecto.status !== "ACTIVE_HEALTHY") throw new Error("El proyecto todavía no está listo; espera a que termine de crearse.");

// 2. Migraciones, con el mismo registro que usa la CLI de Supabase (supabase db push sigue sirviendo).
await sql(`
  create schema if not exists supabase_migrations;
  create table if not exists supabase_migrations.schema_migrations (
    version text primary key, statements text[], name text
  );`);
const aplicadas = new Set(
  (await sql<{ version: string }>("select version from supabase_migrations.schema_migrations")).map((f) => String(f.version)),
);
const archivos = readdirSync(new URL("supabase/migrations/", raiz)).filter((f) => f.endsWith(".sql")).sort();
for (const archivo of archivos) {
  const [version, ...resto] = archivo.replace(/\.sql$/, "").split("_");
  if (aplicadas.has(version)) continue;
  const contenido = readFileSync(new URL(`supabase/migrations/${archivo}`, raiz), "utf8");
  // Cada migración y su registro van juntos: si falla, no queda a medias.
  await sql(`begin;
${contenido}
;
insert into supabase_migrations.schema_migrations (version, name) values (${literal(version)}, ${literal(resto.join("_"))});
commit;`);
  console.log(`migración aplicada: ${archivo}`);
}
console.log(`Migraciones al día (${archivos.length}).`);

// 3. Semilla de Deluxe, solo la primera vez.
const [{ n }] = await sql<{ n: number }>("select count(*)::int as n from public.corredores where slug = 'deluxe-properties'");
if (n === 0) {
  await sql(`begin;\n${readFileSync(new URL("supabase/seed.sql", raiz), "utf8")}\n;\ncommit;`);
  console.log("Semilla cargada: Deluxe Properties, horario provisional y 3 propiedades de ejemplo.");
} else {
  console.log("Deluxe ya existe: la semilla no se vuelve a cargar.");
}

// 4. Revisión: RLS en todas las tablas y buckets creados.
const sinRls = await sql<{ tabla: string }>(`
  select c.relname as tabla from pg_class c join pg_namespace s on s.oid = c.relnamespace
  where s.nspname = 'public' and c.relkind = 'r' and not c.relrowsecurity`);
if (sinRls.length) throw new Error(`Tablas sin RLS: ${sinRls.map((t) => t.tabla).join(", ")}`);
const buckets = await sql<{ id: string; public: boolean; file_size_limit: number | null }>(
  "select id, public, file_size_limit from storage.buckets where id in ('fotos', 'fichas') order by id",
);
if (buckets.length !== 2 || buckets.some((b) => !b.public || !b.file_size_limit)) {
  throw new Error(`Buckets incompletos: ${JSON.stringify(buckets)}`);
}
console.log("Revisado: todas las tablas tienen RLS y los buckets fotos y fichas tienen límites.");

// 5. Auth: sin registros abiertos (el acceso lo da scripts/dar-acceso.mts) y enlace mágico a la app.
const sitio = appUrl ?? "http://localhost:3000";
await api("PATCH", "/config/auth", {
  site_url: sitio,
  uri_allow_list: [`${sitio}/auth/confirmar`, ...(appUrl ? [] : ["http://localhost:3000/auth/confirmar"])].join(","),
  disable_signup: true,
  external_email_enabled: true,
  mailer_otp_exp: 3600,
});
console.log(`Auth: sin registros abiertos; los enlaces de entrada llevan a ${sitio}/auth/confirmar.`);
if (!appUrl) console.log("  (Cuando exista el dominio de Vercel, vuelve a correr el script con esa dirección.)");

// 6. Llaves para Vercel en .env.local (la service_role no se imprime).
const llaves = await api<{ name: string; api_key: string }[]>("GET", "/api-keys?reveal=true");
const anon = llaves.find((k) => k.name === "anon")?.api_key;
const servicio = llaves.find((k) => k.name === "service_role")?.api_key;
if (!anon || !servicio) throw new Error("No encontré las llaves anon y service_role del proyecto.");
const url = `https://${ref}.supabase.co`;
const destino = new URL(".env.local", raiz);
const previo = existsSync(destino) ? readFileSync(destino, "utf8") : "";
const sinViejas = previo
  .split("\n")
  .filter((l) => !/^(NEXT_PUBLIC_SUPABASE_URL|NEXT_PUBLIC_SUPABASE_ANON_KEY|SUPABASE_SERVICE_ROLE_KEY|SUPABASE_URL)=/.test(l))
  .join("\n")
  .trim();
writeFileSync(
  destino,
  [
    sinViejas,
    `NEXT_PUBLIC_SUPABASE_URL=${url}`,
    `NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`,
    `SUPABASE_URL=${url}`,
    `SUPABASE_SERVICE_ROLE_KEY=${servicio}`,
  ]
    .filter(Boolean)
    .join("\n") + "\n",
);
chmodSync(destino, 0o600);
console.log(`Listo. ${url} — llaves guardadas en .env.local (anon ${anon.slice(0, 12)}…; service_role no se muestra).`);
