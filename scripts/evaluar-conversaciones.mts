// Corre el set de conversaciones de prueba por la asistente real (Claude de verdad; base y WhatsApp
// simulados) y califica cada caso con las reglas de evals/conversaciones/calificar.ts.
//
//   ANTHROPIC_API_KEY=… npm run eval:conversaciones -- [--solo id1,id2] [--etiqueta agenda] [--veces 3]
//
// Cuesta llamadas a la API: con los 30 casos, del orden de 60–90 llamadas por vuelta.
// Deja resultados.jsonl y resumen.md en evals/resultados/<fecha>/ (fuera del repositorio).
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";
import { MODELO_CLASIFICAR, MODELO_REDACTAR, crearCerebroClaude } from "../lib/asistente/cerebro";
import { procesarMensaje, type Dependencias } from "../lib/asistente/procesar";
import type { Corredor, PropiedadConFotos } from "../lib/datos/tipos";
import type { EnviadorWhatsApp } from "../lib/whatsapp/enviar";
import { calificar, type Caso, type Revision, type Turno } from "../evals/conversaciones/calificar";
import { corredorBase, entrante, repoEnMemoria } from "../tests/dobles";

const { values: opciones } = parseArgs({
  options: {
    solo: { type: "string" },
    etiqueta: { type: "string" },
    veces: { type: "string", default: "1" },
    paralelo: { type: "string", default: "3" },
  },
});

if (!process.env.ANTHROPIC_API_KEY) throw new Error("Falta ANTHROPIC_API_KEY");

const carpeta = new URL("../evals/conversaciones/", import.meta.url);
const propiedades: PropiedadConFotos[] = JSON.parse(readFileSync(new URL("propiedades.json", carpeta), "utf8"));
const todos: Caso[] = JSON.parse(readFileSync(new URL("casos.json", carpeta), "utf8")).casos;

const solo = opciones.solo?.split(",");
const casos = todos.filter(
  (c) => (!solo || solo.includes(c.id)) && (!opciones.etiqueta || c.tags.includes(opciones.etiqueta)),
);
const veces = Number(opciones.veces);

// Lunes 19 de octubre de 2026, 9:00 en Costa Rica: la agenda tiene toda la semana por delante.
const INICIO = new Date("2026-10-19T15:00:00Z");
const CLIENTE = "+50688880001";

// Corredora como la de la semilla de Deluxe, contestando sola para que la agenda cree las citas.
function corredor(): Corredor {
  return {
    ...corredorBase(),
    tono: "Cordial y profesional, trato de usted, mensajes cortos, sin emojis.",
    reglas_escalamiento: ["negociación de precio", "comisiones", "ofertas formales", "quejas"],
    respuesta_automatica: true,
  };
}

interface Corrida {
  caso: string;
  vuelta: number;
  turnos: Turno[];
  revisiones: Revision[];
  llamadas: number;
  costoUsd: number;
  error?: string;
}

async function correr(caso: Caso, vuelta: number): Promise<Corrida> {
  const c = corredor();
  const db = repoEnMemoria(c);
  const gasto = { llamadas: 0, costoUsd: 0 };
  const registrarUso = db.repo.registrarUso;
  db.repo.registrarUso = async (id, d) => {
    gasto.llamadas += d.llamadasClaude ?? 0;
    gasto.costoUsd += d.costoClaudeUsd ?? 0;
    return registrarUso(id, d);
  };
  db.repo.propiedadesActivas = async () => propiedades;

  let turno: Turno | null = null;
  let n = 0;
  const enviado = async () => `wamid.eval.${++n}`;
  const whatsapp: EnviadorWhatsApp = {
    texto: async (_p, para, cuerpo) => {
      if (para === CLIENTE) turno?.respuestas.push(cuerpo);
      return enviado();
    },
    imagen: enviado,
    documento: enviado,
    plantilla: async (_p, para, _nombre, parametros) => {
      if (para === c.whatsapp_corredor) turno?.avisos.push(parametros.join(" | "));
      return enviado();
    },
  };

  let reloj = INICIO;
  const deps: Dependencias = {
    repo: db.repo,
    cerebro: crearCerebroClaude(),
    whatsapp,
    plantillaAviso: "aviso_corredor",
    plantillaRecordatorio: "recordatorio_visita",
    ahora: () => reloj,
    registrar: (evento) => {
      if (evento.startsWith("error_")) turno?.errores.push(evento);
    },
  };

  const turnos: Turno[] = [];
  try {
    for (const texto of caso.turnos) {
      turno = { cliente: texto, resultado: { tipo: "" }, intencion: null, respuestas: [], avisos: [], errores: [] };
      const r = await procesarMensaje(deps, entrante(texto, { telefono: CLIENTE, timestamp: reloj }));
      turno.resultado = { tipo: r.tipo, ...("accion" in r ? { accion: r.accion } : {}) };
      turno.intencion = db.mensajes.filter((m) => m.direccion === "entrante").at(-1)?.intencion ?? null;
      turnos.push(turno);
      reloj = new Date(reloj.getTime() + 2 * 60_000);
    }
  } catch (error) {
    return { caso: caso.id, vuelta, turnos, revisiones: calificar(caso, turnos, propiedades), ...gasto, error: String(error) };
  }
  return { caso: caso.id, vuelta, turnos, revisiones: calificar(caso, turnos, propiedades), ...gasto };
}

async function enParalelo<T, R>(items: T[], limite: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const salida: R[] = new Array(items.length);
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(limite, items.length) }, async () => {
      while (siguiente < items.length) {
        const i = siguiente++;
        salida[i] = await f(items[i]);
      }
    }),
  );
  return salida;
}

const trabajos = casos.flatMap((caso) => Array.from({ length: veces }, (_, v) => ({ caso, vuelta: v + 1 })));
console.log(`${casos.length} casos × ${veces} vuelta(s) = ${trabajos.length} conversaciones`);
const corridas = await enParalelo(trabajos, Number(opciones.paralelo), async ({ caso, vuelta }) => {
  const r = await correr(caso, vuelta);
  const mal = r.revisiones.filter((x) => !x.ok);
  console.log(`${mal.length || r.error ? "✗" : "✓"} ${caso.id}${veces > 1 ? ` #${vuelta}` : ""}${mal.length ? ` (${mal.map((x) => x.regla).join(", ")})` : ""}`);
  return r;
});

// Resumen
const fecha = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
const destino = new URL(`../evals/resultados/${fecha}/`, import.meta.url);
mkdirSync(destino, { recursive: true });
writeFileSync(new URL("resultados.jsonl", destino), corridas.map((r) => JSON.stringify(r)).join("\n") + "\n");

const pasan = corridas.filter((r) => !r.error && r.revisiones.every((x) => x.ok));
const reglas = new Map<string, { ok: number; total: number }>();
for (const r of corridas) {
  for (const x of r.revisiones) {
    const s = reglas.get(x.regla) ?? { ok: 0, total: 0 };
    s.total++;
    if (x.ok) s.ok++;
    reglas.set(x.regla, s);
  }
}
const etiquetas = new Map<string, { ok: number; total: number }>();
for (const r of corridas) {
  const caso = casos.find((c) => c.id === r.caso)!;
  const bien = pasan.includes(r);
  for (const t of caso.tags) {
    const s = etiquetas.get(t) ?? { ok: 0, total: 0 };
    s.total++;
    if (bien) s.ok++;
    etiquetas.set(t, s);
  }
}
const costo = corridas.reduce((s, r) => s + r.costoUsd, 0);
const llamadas = corridas.reduce((s, r) => s + r.llamadas, 0);
const pct = (s: { ok: number; total: number }) => `${s.ok}/${s.total}`;
const celda = (t: string) => t.replace(/\|/g, "\\|").replace(/\n/g, " ");

const md = [
  `# Set de conversaciones — ${fecha}`,
  "",
  `Modelos: ${MODELO_CLASIFICAR} (clasificar), ${MODELO_REDACTAR} (responder y agendar).`,
  `Pasan **${pasan.length} de ${corridas.length}** conversaciones. ${llamadas} llamadas a Claude, USD ${costo.toFixed(3)}.`,
  "",
  "## Por regla",
  "| Regla | Pasan |",
  "|---|---|",
  ...[...reglas].map(([k, s]) => `| ${k} | ${pct(s)} |`),
  "",
  "## Por tipo de caso",
  "| Tipo | Pasan |",
  "|---|---|",
  ...[...etiquetas].map(([k, s]) => `| ${k} | ${pct(s)} |`),
  "",
  "## Conversaciones",
  ...corridas.flatMap((r) => {
    const mal = r.revisiones.filter((x) => !x.ok);
    return [
      "",
      `### ${mal.length || r.error ? "✗" : "✓"} ${r.caso}${veces > 1 ? ` #${r.vuelta}` : ""}`,
      ...(r.error ? [`**Error:** ${r.error}`] : []),
      ...mal.map((x) => `- **${x.regla}**: ${x.detalle ?? ""}`),
      ...r.turnos.flatMap((t) => [
        `> **Cliente:** ${celda(t.cliente)}`,
        ...t.respuestas.map((x) => `> **Asistente:** ${celda(x)}`),
        ...t.avisos.map((x) => `> **Aviso a Patricia:** ${celda(x)}`),
        `> _${t.resultado.tipo}${t.resultado.accion ? ` · ${t.resultado.accion}` : ""} · intención ${t.intencion ?? "—"}_`,
        ">",
      ]),
    ];
  }),
  "",
].join("\n");
writeFileSync(new URL("resumen.md", destino), md);
console.log(`\nPasan ${pasan.length} de ${corridas.length}. USD ${costo.toFixed(3)}. Resumen: ${destino.pathname}resumen.md`);
