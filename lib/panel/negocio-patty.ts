import { fechaLocal } from "../agenda/tiempo";
import { hayMonto, monedaDe, montoExacto, sumar, type Moneda, type Montos } from "../crm/dinero";
import { comisiones, delMes, ultimosMeses } from "../crm/ganado";
import { NOMBRE_ETAPA, type Etapa } from "../crm/perfil";
import type { EstadoEnergia } from "../ia/energia";

// Sección "Negocio" del contexto de Patty: cifras del negocio armadas por el código (sin IA), cortas, para que conteste
// «¿cómo va el mes?», «¿cuánto he ganado?» o «¿cuántos clientes negocian?» con números reales. Dólares y colones nunca
// se suman. Lo que está en cero no se escribe (salvo lo ganado, que siempre va) y la sección lo dice al final.
// Funciones puras: las filas las lee lib/panel/patty.ts filtradas por corredor_id.

export interface FilaClienteNegocio {
  etapa: string;
  oferta_monto: number | string | null;
  oferta_moneda: string | null;
  cierre_at: string | null;
  cierre_comision: number | string | null;
  cierre_moneda: string | null;
}

export interface EntradaNegocio {
  clientes: FilaClienteNegocio[];
  /** Estado de cada casa del corredor (activa, reservada, inactiva, vendida, alquilada). */
  casas: { estado: string }[];
  /** Visitas agendadas o confirmadas en los próximos 7 días. */
  visitasProximas: number;
  /** Visitas que se hicieron en los últimos 7 días. */
  visitasHechas: number;
  /** Dueños directos encontrados en los últimos 7 días. */
  duenosNuevos: number;
  /** Mensajes que llegaron por WhatsApp este mes (null si no se sabe). */
  mensajesMes: number | null;
  energia: EstadoEnergia | null;
}

export interface ResumenNegocio {
  mes: { nombre: string; ganado: Montos; cierres: number };
  mesPasado: { nombre: string; ganado: Montos; cierres: number };
  embudo: { etapa: Etapa; n: number }[];
  ofertas: { n: number; montos: Montos };
  casas: { activas: number; reservadas: number; pausadas: number; vendidas: number; alquiladas: number };
  visitasProximas: number;
  visitasHechas: number;
  duenosNuevos: number;
  mensajesMes: number | null;
  energia: EstadoEnergia | null;
}

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const ETAPAS: Etapa[] = ["nuevo", "interesado", "visita", "negociando", "cerrado", "perdido"];
const nombreMes = (clave: string) => MESES[Number(clave.slice(5, 7)) - 1] ?? clave;

export function resumirNegocio(e: EntradaNegocio, ahora: Date, zona: string): ResumenNegocio {
  const [pasado, actual] = ultimosMeses(ahora, zona, 2);
  const cerrados = e.clientes.filter((c) => c.etapa === "cerrado");
  const delMesDe = (clave: string) => {
    const lista = delMes(cerrados, clave, zona, (c) => c.cierre_at);
    return { nombre: nombreMes(clave), ganado: comisiones(lista), cierres: lista.length };
  };
  const conOferta = e.clientes.filter((c) => c.etapa === "negociando" && Number(c.oferta_monto ?? 0) > 0);
  const cuenta = (estado: string) => e.casas.filter((c) => c.estado === estado).length;
  return {
    mes: delMesDe(actual),
    mesPasado: delMesDe(pasado),
    embudo: ETAPAS.map((etapa) => ({ etapa, n: e.clientes.filter((c) => c.etapa === etapa).length })),
    ofertas: { n: conOferta.length, montos: sumar(conOferta.map((c) => ({ monto: Number(c.oferta_monto), moneda: monedaDe(c.oferta_moneda) }))) },
    casas: { activas: cuenta("activa"), reservadas: cuenta("reservada"), pausadas: cuenta("inactiva"), vendidas: cuenta("vendida"), alquiladas: cuenta("alquilada") },
    visitasProximas: e.visitasProximas,
    visitasHechas: e.visitasHechas,
    duenosNuevos: e.duenosNuevos,
    mensajesMes: e.mensajesMes,
    energia: e.energia,
  };
}

/** "$12.500 y ₡850.000" (cada moneda por su lado, exacta) o null si no hay nada. */
function montos(m: Montos): string | null {
  if (!hayMonto(m)) return null;
  return (["USD", "CRC"] as Moneda[])
    .filter((k) => m[k] > 0)
    .map((k) => montoExacto(m[k], k))
    .join(" y ");
}

const veces = (n: number, uno: string, varios: string) => `${n} ${n === 1 ? uno : varios}`;

function lineaGanado(etiqueta: string, g: { nombre: string; ganado: Montos; cierres: number }): string {
  const plata = montos(g.ganado);
  if (!g.cierres && !plata) return `- ${etiqueta} (${g.nombre}): sin cierres.`;
  return `- ${etiqueta} (${g.nombre}): ${plata ?? "sin comisión anotada"} en comisiones, ${veces(g.cierres, "cierre", "cierres")}.`;
}

/** El texto de la sección, corto. */
export function seccionNegocio(r: ResumenNegocio): string {
  const embudo = r.embudo.filter((x) => x.n > 0).map((x) => `${NOMBRE_ETAPA[x.etapa]} ${x.n}`);
  const c = r.casas;
  const casas = [
    c.activas ? `${c.activas} activas` : null,
    c.reservadas ? `${c.reservadas} reservadas` : null,
    c.pausadas ? `${c.pausadas} pausadas` : null,
    c.vendidas ? `${c.vendidas} vendidas` : null,
    c.alquiladas ? `${c.alquiladas} alquiladas` : null,
  ].filter(Boolean);
  const plataOfertas = montos(r.ofertas.montos);
  const lineas = [
    "Negocio (cifras exactas del sistema; dólares y colones van por separado y nunca se suman):",
    lineaGanado("Ganado este mes", r.mes),
    lineaGanado("Ganado el mes pasado", r.mesPasado),
    embudo.length ? `- Clientes por etapa: ${embudo.join(", ")}.` : null,
    r.ofertas.n ? `- Ofertas en negociación: ${r.ofertas.n}${plataOfertas ? `, por ${plataOfertas} en total` : ""}.` : null,
    r.visitasProximas || r.visitasHechas
      ? `- Visitas: ${[r.visitasProximas ? `${r.visitasProximas} en los próximos 7 días` : null, r.visitasHechas ? `${r.visitasHechas} hechas en los últimos 7 días` : null].filter(Boolean).join(", ")}.`
      : null,
    casas.length ? `- Casas: ${casas.join(", ")}.` : null,
    r.duenosNuevos ? `- Dueños directos nuevos en los últimos 7 días: ${r.duenosNuevos}.` : null,
    r.mensajesMes ? `- Mensajes de WhatsApp que llegaron este mes: ${r.mensajesMes}.` : null,
    r.energia && r.energia.nivel !== "sin_tope" ? `- Energía de la asistente este mes: le queda ${r.energia.restante} %.` : null,
    "- Lo que no aparece en esta lista está en cero.",
  ];
  return lineas.filter(Boolean).join("\n");
}

/** Mes local de `ahora` como "2026-11-01" (como lo guarda uso_mensual.mes). */
export function inicioDeMes(ahora: Date, zona: string): string {
  const h = fechaLocal(ahora, zona);
  return `${h.anio}-${String(h.mes).padStart(2, "0")}-01`;
}
