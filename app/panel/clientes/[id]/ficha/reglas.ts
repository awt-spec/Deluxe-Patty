import { diaLargo } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, sumarDias } from "@/lib/agenda/tiempo";
import { comisionEstimada, monedaDe, montoExacto, type Moneda } from "@/lib/crm/dinero";
import { ETAPAS, telefonoBonito, type Busca, type Etapa } from "@/lib/crm/perfil";
import { resumenCampos } from "@/lib/panel/movil";
import { diasDesde, nombreDia, type EntradaQueSigue, type VisitaFicha } from "../que-sigue";
import type { CasaCorta, CasaFicha, ClienteFicha, DatosFicha } from "./tipos";

// Reglas de la ficha del cliente, sin React: qué se muestra según la etapa, los textos que se derivan de los datos,
// el dinero en juego y los resúmenes de las secciones plegadas del teléfono. Las piezas (*.tsx) solo dibujan.

export const ORIGEN: Record<string, string> = {
  anuncio: "un anuncio de Encuentra24",
  referido: "un referido",
  busqueda: "la búsqueda de dueños",
  whatsapp: "WhatsApp",
  otro: "otro medio",
  correo: "correo electrónico",
};

/** Las etapas del camino, en orden; "Perdido" va aparte. */
export const CAMINO = ETAPAS.filter((e) => e !== "perdido");

export const hace = (n: number) => (n === 0 ? "hoy" : n === 1 ? "ayer" : `hace ${n} días`);

/** "WhatsApp", "un referido"… o el origen tal cual si no se conoce. */
export const textoOrigen = (origen: string) => ORIGEN[origen] ?? origen;

/** "hoy", "ayer" o "el lunes 2 de noviembre". */
export const cuandoLlego = (llego: string) => (llego === "hoy" || llego === "ayer" ? llego : `el ${llego}`);

/** " (hace 20 días)" cuando ya pasó más de un día. */
export const antiguedad = (diasCliente: number) => (diasCliente > 1 ? ` (${hace(diasCliente)})` : "");

export type FechasFicha = { hoy: string; manana: string; diasEnEtapa: number; diasCliente: number; llego: string };

export function fechasFicha(c: Pick<ClienteFicha, "etapa_at" | "created_at">, ahora: Date, zona: string): FechasFicha {
  const local = fechaLocal(ahora, zona);
  return {
    hoy: fechaIso(local),
    manana: fechaIso(sumarDias(local, 1)),
    diasEnEtapa: diasDesde(c.etapa_at, ahora),
    diasCliente: diasDesde(c.created_at, ahora),
    llego: nombreDia(new Date(c.created_at), ahora, zona),
  };
}

export const nombreCliente = (c: Pick<ClienteFicha, "nombre" | "telefono">) => c.nombre ?? telefonoBonito(c.telefono);

export const estaActivo = (etapa: Etapa) => etapa !== "cerrado" && etapa !== "perdido";

export type EnJuego = { valor: number; moneda: Moneda; operacion: string | null; alquiler: boolean; comision: number };

/** Lo que vale el negocio: la oferta en su moneda o, si no hay, el precio de la casa que le interesa. */
export function enJuego(
  c: Pick<ClienteFicha, "oferta_monto" | "oferta_moneda" | "busca">,
  casaInteres: CasaCorta | null,
  comisionPct: number,
): EnJuego {
  const valor = Number(c.oferta_monto ?? 0) || casaInteres?.precio || 0;
  const moneda = c.oferta_monto ? monedaDe(c.oferta_moneda) : monedaDe(casaInteres?.moneda);
  // Venta o alquiler: lo dice la casa; si no hay casa, lo que el cliente busca.
  const operacion = casaInteres?.operacion ?? (c.busca ?? {}).operacion ?? null;
  return { valor, moneda, operacion, alquiler: operacion === "alquiler", comision: valor ? comisionEstimada(valor, comisionPct, operacion) : 0 };
}

export const sabeQueBusca = (busca: Busca) => !!(busca.operacion || busca.tipo || busca.zonas?.length || busca.presupuesto_max || busca.habitaciones);

export type CifraDinero = { monto: number; moneda: Moneda; que: string };

/** La cifra de dinero: el cierre, la oferta, el presupuesto o la casa que le interesa (cada uno en su moneda). */
export function cifraDinero(c: ClienteFicha, casaInteres: CasaCorta | null, alquiler: boolean): CifraDinero | null {
  const busca = c.busca ?? {};
  if (c.etapa === "cerrado" && c.cierre_precio) return { monto: Number(c.cierre_precio), moneda: monedaDe(c.cierre_moneda), que: "cerró en" };
  if (c.oferta_monto) return { monto: Number(c.oferta_monto), moneda: monedaDe(c.oferta_moneda), que: alquiler ? "ofreció al mes" : "ofreció" };
  if (busca.presupuesto_max) return { monto: Number(busca.presupuesto_max), moneda: monedaDe(busca.moneda), que: alquiler ? "presupuesto al mes" : "presupuesto" };
  if (casaInteres?.precio) return { monto: Number(casaInteres.precio), moneda: monedaDe(casaInteres.moneda), que: "la casa que le interesa" };
  return null;
}

/** A qué sección lleva la cifra de dinero: el presupuesto a "Qué busca"; lo demás (y siempre al cerrar) a lo que está en juego. */
export const anclaDinero = (etapa: Etapa, que: string) => (etapa === "cerrado" ? "#juego" : que.startsWith("presupuesto") ? "#busca" : "#juego");

export type DatoBusca = { k: string; v: string };

export function datosBusca(busca: Busca): DatoBusca[] {
  return [
    busca.operacion ? { k: "Para", v: busca.operacion === "alquiler" ? "Alquilar" : "Comprar" } : null,
    busca.tipo ? { k: "Tipo", v: busca.tipo } : null,
    busca.zonas?.length ? { k: "Zonas", v: busca.zonas.join(", ") } : null,
    busca.presupuesto_max ? { k: "Hasta", v: `${montoExacto(Number(busca.presupuesto_max), monedaDe(busca.moneda))}${busca.operacion === "alquiler" ? " al mes" : ""}` } : null,
    busca.habitaciones ? { k: "Cuartos", v: String(busca.habitaciones) } : null,
  ].filter((x): x is DatoBusca => !!x);
}

export type CasaLista = (CasaCorta | CasaFicha) & { estado: string; interes: boolean };

/** Las que le encajan, sin la que ya le interesa. */
export const otrasQueEncajan = (casasEncajan: CasaFicha[], casaInteres: CasaCorta | null) => casasEncajan.filter((p) => p.id !== casaInteres?.id);

/** Primero la casa que le interesa (si es de las activas), luego las que le encajan. */
export function casasDeFicha(casaInteres: CasaCorta | null, casasEncajan: CasaFicha[]): CasaLista[] {
  return [
    ...(casaInteres && casaInteres.estado === "activa" ? [{ ...casaInteres, interes: true }] : []),
    ...otrasQueEncajan(casasEncajan, casaInteres).map((p) => ({ ...p, estado: "activa", interes: false })),
  ];
}

export function contarVisitas(visitas: VisitaFicha[], ahora: Date): { hechas: number; proximas: number } {
  return {
    hechas: visitas.filter((v) => v.estado === "realizada").length,
    proximas: visitas.filter((v) => (v.estado === "agendada" || v.estado === "confirmada") && Date.parse(v.inicio) > ahora.getTime()).length,
  };
}

// Textos de las cifras de arriba.
export const numeroLlego = (diasCliente: number) => (diasCliente === 0 ? "Hoy" : diasCliente);
export const textoLlego = (diasCliente: number) => (diasCliente === 0 ? "llegó" : diasCliente === 1 ? "día desde que llegó" : "días desde que llegó");
export const textoSinMovimiento = (dias: number) => (dias === 1 ? "día sin movimiento" : "días sin movimiento");
export const textoHechas = (hechas: number) => (hechas === 1 ? "visita hecha" : "visitas hechas");
export const textoProximas = (proximas: number) => (proximas > 0 ? ` · ${proximas} ${proximas === 1 ? "próxima" : "próximas"}` : "");

/** "desde hoy" o "hace 5 días", junto al nombre de la etapa. */
export const desdeCuando = (diasEnEtapa: number) => (diasEnEtapa === 0 ? "desde hoy" : `hace ${diasEnEtapa} ${diasEnEtapa === 1 ? "día" : "días"}`);

export type EstadoPaso = "actual" | "hecho" | "falta";

/** Cómo se ve cada paso del camino: el de ahora, los ya pasados y los que faltan (perdido: todos faltan). */
export function estadoPaso(e: Etapa, i: number, etapa: Etapa): EstadoPaso {
  const indice = CAMINO.indexOf(etapa as (typeof CAMINO)[number]);
  return e === etapa ? "actual" : indice >= 0 && i < indice ? "hecho" : "falta";
}

export const venceRecordatorio = (fecha: string | null, hoy: string) => !!fecha && fecha <= hoy;

/** La pastilla del recordatorio: "Atrasado", "Hoy", "Mañana" o el día. */
export function pastillaRecordatorio(fecha: string, hoy: string, manana: string): string {
  if (fecha <= hoy) return fecha < hoy ? "Atrasado" : "Hoy";
  return fecha === manana ? "Mañana" : diaLargo(new Date(`${fecha}T12:00:00Z`), "UTC");
}

/** Qué muestra "Lo que está en juego": el cierre ya anotado, el formulario para anotarlo o la casa y la oferta. */
export type ModoJuego = "cerro" | "anotar-cierre" | "en-juego";
export const modoJuego = (etapa: Etapa, cierrePrecio: number | null): ModoJuego => (etapa === "cerrado" ? (cierrePrecio ? "cerro" : "anotar-cierre") : "en-juego");

// En el teléfono, lo secundario va plegado con su resumen (movil.tsx): el dinero en juego solo se abre solo si ya hay
// oferta, negociación o cierre.
export const juegoAbierto = (etapa: Etapa, ofertaMonto: number | null) => etapa === "negociando" || etapa === "cerrado" || !!ofertaMonto;

export function resumenJuego(casaInteres: CasaCorta | null, juego: Pick<EnJuego, "valor" | "moneda">, ofertaMonto: number | null): string {
  return `En juego: ${resumenCampos(
    [casaInteres?.titulo, juego.valor > 0 ? `${ofertaMonto ? "ofreció" : "vale"} ${montoExacto(juego.valor, juego.moneda)}` : null],
    60,
    "sin casa ni oferta anotada",
  )}`;
}

export function resumenCasas(casas: Pick<CasaLista, "interes">[]): string {
  return casas.length ? `Casas que le encajan: ${casas.length}${casas.some((p) => p.interes) ? " · una le interesa" : ""}` : "Casas que le encajan: ninguna todavía";
}

export const resumenNotas = (notas: string | null) => (notas ? `Notas: ${resumenCampos([notas], 58)}` : "Notas: sin notas todavía");


/** Lo que necesita "Qué sigue" (que-sigue.ts) a partir de los datos de la ficha. */
export function entradaQueSigue(d: DatosFicha, buscaConocida: boolean): EntradaQueSigue {
  const { c } = d;
  return {
    ahora: d.ahora,
    zona: d.zona,
    etapa: c.etapa,
    telefono: c.telefono,
    seguimientoFecha: c.seguimiento_fecha,
    seguimientoNota: c.seguimiento_nota,
    visitas: d.visitas,
    ofertaMonto: c.oferta_monto ? Number(c.oferta_monto) : null,
    ofertaMoneda: c.oferta_moneda,
    diasSinMovimiento: d.diasSinMovimiento,
    sabeQueBusca: buscaConocida,
    cierreAnotado: !!c.cierre_precio,
    motivoPerdida: c.motivo_perdida,
    casasQueEncajan: otrasQueEncajan(d.casasEncajan, d.casaInteres).length,
    tieneCasaInteres: !!d.casaInteres,
  };
}
