// Perfil de un cliente en el CRM: en qué etapa va y qué busca. La asistente lo llena con lo que el
// cliente dice en el chat; el corredor lo corrige desde su panel.

export const ETAPAS = ["nuevo", "interesado", "visita", "negociando", "cerrado", "perdido"] as const;
export type Etapa = (typeof ETAPAS)[number];

export const NOMBRE_ETAPA: Record<Etapa, string> = {
  nuevo: "Nuevo",
  interesado: "Interesado",
  visita: "Visita",
  negociando: "Negociando",
  cerrado: "Cerró",
  perdido: "Perdido",
};

export interface Busca {
  operacion?: "venta" | "alquiler";
  tipo?: string;
  zonas?: string[];
  presupuesto_max?: number;
  moneda?: "USD" | "CRC";
  habitaciones?: number;
}

const ORDEN: Record<Etapa, number> = { nuevo: 0, interesado: 1, visita: 2, negociando: 3, cerrado: 4, perdido: 4 };

/**
 * La etapa que sugiere la asistente solo hace avanzar al cliente: nunca lo devuelve atrás ni toca a uno
 * que el corredor ya marcó como cerrado o perdido. null si no cambia.
 */
export function avanzarEtapa(actual: Etapa, sugerida: Etapa | null): Etapa | null {
  if (!sugerida || actual === "cerrado" || actual === "perdido") return null;
  if (sugerida === "cerrado" || sugerida === "perdido") return null;
  return ORDEN[sugerida] > ORDEN[actual] ? sugerida : null;
}

/** Junta lo nuevo que dijo el cliente con lo que ya se sabía; las zonas se suman sin repetir. */
export function fusionarBusca(actual: Busca, nuevo: Busca): Busca {
  const r: Busca = { ...actual };
  if (nuevo.operacion) r.operacion = nuevo.operacion;
  if (nuevo.tipo) r.tipo = nuevo.tipo;
  if (nuevo.presupuesto_max && nuevo.presupuesto_max > 0) {
    r.presupuesto_max = nuevo.presupuesto_max;
    r.moneda = nuevo.moneda ?? r.moneda ?? "USD";
  }
  if (nuevo.habitaciones && nuevo.habitaciones > 0) r.habitaciones = nuevo.habitaciones;
  if (nuevo.zonas?.length) {
    const vistas = new Set((r.zonas ?? []).map((z) => z.toLowerCase()));
    r.zonas = [...(r.zonas ?? []), ...nuevo.zonas.filter((z) => z.trim() && !vistas.has(z.toLowerCase()))].slice(0, 6);
  }
  return r;
}

export const buscaVacia = (b: Busca) =>
  !b.operacion && !b.tipo && !b.zonas?.length && !b.presupuesto_max && !b.habitaciones;

/** "Compra · casa · Escazú, Santa Ana · hasta $500.000 · 3 cuartos" */
export function resumenBusca(b: Busca): string {
  const precio = (n: number) => `${b.moneda === "CRC" ? "₡" : "$"}${Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")}`;
  return [
    b.operacion === "venta" ? "Compra" : b.operacion === "alquiler" ? "Alquiler" : null,
    b.tipo ?? null,
    b.zonas?.length ? b.zonas.join(", ") : null,
    b.presupuesto_max ? `hasta ${precio(b.presupuesto_max)}` : null,
    b.habitaciones ? `${b.habitaciones} ${b.habitaciones === 1 ? "cuarto" : "cuartos"}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

interface PropiedadParaEncajar {
  operacion: string;
  tipo: string;
  precio: number | null;
  moneda: string;
  zona: string | null;
  canton?: string | null;
  habitaciones: number | null;
}

/** ¿La propiedad encaja con lo que busca el cliente? Lo que el cliente no dijo no descarta nada. */
export function encaja(b: Busca, p: PropiedadParaEncajar): boolean {
  if (buscaVacia(b)) return false;
  if (b.operacion && p.operacion !== b.operacion) return false;
  if (b.tipo && p.tipo && !p.tipo.toLowerCase().includes(b.tipo.toLowerCase()) && !b.tipo.toLowerCase().includes(p.tipo.toLowerCase())) return false;
  if (b.presupuesto_max && p.precio !== null && (p.moneda ?? "USD") === (b.moneda ?? "USD") && p.precio > b.presupuesto_max * 1.1) return false;
  if (b.habitaciones && p.habitaciones !== null && p.habitaciones < b.habitaciones) return false;
  if (b.zonas?.length) {
    const donde = `${p.zona ?? ""} ${p.canton ?? ""}`.toLowerCase();
    if (!b.zonas.some((z) => donde.includes(z.toLowerCase()))) return false;
  }
  return true;
}
