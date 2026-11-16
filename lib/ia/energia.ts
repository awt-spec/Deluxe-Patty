// "Energía" de la asistente: lo que ve el corredor del tope de gasto de IA del MES (presupuesto_ia(), definido por el
// superadministrador en /admin → IA y topes), como la batería de un teléfono: un porcentaje que baja. El monto del mes
// es el 100 % de la energía. Sin dinero ni cifras de tokens para el corredor. Funciones puras: sin base ni red.
import { estadoTokens, type NivelTokens } from "./tokens";

export type NivelEnergia = NivelTokens;

export interface EstadoEnergia {
  /** Porcentaje que queda, entero hacia abajo, de 0 a 100. Sin tope se toma como 100 (no se muestra). */
  restante: number;
  /** Porcentaje usado, entero, de 0 a 100. */
  usado: number;
  nivel: NivelEnergia;
}

/** Desde el gasto y el tope del mes en dólares (el tope 0 apaga la IA: agotado; sin tope: sin límite). */
export function estadoEnergia({ gastoMesUsd, topeMesUsd }: { gastoMesUsd: number; topeMesUsd: number | null | undefined }): EstadoEnergia {
  const e = estadoTokens({ gastoMesUsd, topeMesUsd });
  if (e.nivel === "sin_tope") return { restante: 100, usado: 0, nivel: "sin_tope" };
  if (e.nivel === "agotado" || e.total <= 0) return { restante: 0, usado: 100, nivel: "agotado" };
  const restante = Math.max(0, Math.min(100, Math.floor((e.restantes / e.total) * 100 + 1e-9)));
  return { restante, usado: Math.max(0, Math.min(100, e.pct)), nivel: e.nivel };
}

/** Desde lo que devuelve `presupuesto_ia()` (repositorio.presupuestoIA). */
export function energiaDePresupuesto(p: { gastoMes: number; topeMes: number | null }): EstadoEnergia {
  return estadoEnergia({ gastoMesUsd: p.gastoMes, topeMesUsd: p.topeMes });
}

const nombreDe = (n?: string | null) => (n ?? "").trim() || "Patty";

/** Título corto de la barra: "Energía de Patty" (con el nombre de la asistente del corredor). */
export function tituloEnergia(nombre?: string | null): string {
  return `Energía de ${nombreDe(nombre)}`;
}

/** Lo que dice la barra en una línea: "Energía de Patty: 62 %". */
export function textoEnergia(e: EstadoEnergia, nombre?: string | null): string {
  if (e.nivel === "sin_tope") return `${tituloEnergia(nombre)} sin límite`;
  return `${tituloEnergia(nombre)}: ${e.restante} %`;
}

/** La línea de abajo: lo que queda, o el aviso de poca energía o agotada. */
export function subtextoEnergia(e: EstadoEnergia, nombre?: string | null): string {
  const n = nombreDe(nombre);
  if (e.nivel === "agotado") return agotadoEnergia(n);
  if (e.nivel === "poco") return `Le queda poca energía a ${n} este mes`;
  if (e.nivel === "sin_tope") return "";
  return `Te queda ${e.restante} % este mes`;
}

export function agotadoEnergia(nombre?: string | null): string {
  return `${nombreDe(nombre)} se quedó sin energía este mes: los chats quedan para ti. Habla con soporte.`;
}
