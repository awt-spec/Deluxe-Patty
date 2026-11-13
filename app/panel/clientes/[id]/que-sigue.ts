import { diaLargo, etiquetaHorario, horaCorta } from "@/lib/agenda/formato";
import { fechaIso, fechaLocal, sumarDias } from "@/lib/agenda/tiempo";
import { monedaDe, montoExacto } from "@/lib/crm/dinero";
import type { Etapa } from "@/lib/crm/perfil";

// "Qué sigue" con un cliente: una sola recomendación, armada por código con lo que la ficha ya tiene (sin IA).
// Va por prioridad: lo que ya toca hacer, la visita que viene, la que pasó sin anotar, la oferta, el cliente
// quieto y lo que falta saber. También las utilidades de días de la ficha (cuántos días, "Hoy", "Ayer").

const DIA = 86_400_000;
/** Días sin movimiento a partir de los cuales conviene escribirle. */
export const DIAS_QUIETO = 3;
/** Una visita que pasó hace más que esto ya no se pregunta. */
const DIAS_VISITA_SIN_ANOTAR = 14;

export type VisitaFicha = { id: string; inicio: string; fin: string | null; estado: string; casa: string | null };

export interface EntradaQueSigue {
  ahora: Date;
  zona: string;
  etapa: Etapa;
  telefono: string;
  seguimientoFecha: string | null;
  seguimientoNota: string | null;
  visitas: VisitaFicha[];
  ofertaMonto: number | null;
  ofertaMoneda: string | null;
  diasSinMovimiento: number;
  sabeQueBusca: boolean;
  cierreAnotado: boolean;
  motivoPerdida: string | null;
  casasQueEncajan: number;
  tieneCasaInteres: boolean;
}

export type AccionQueSigue = { texto: string; href: string; externo?: boolean; tipo: "whatsapp" | "llamar" | "agenda" | "ficha" };

export type MotivoQueSigue =
  | "recordatorio"
  | "cierre"
  | "perdido"
  | "visita-proxima"
  | "visita-sin-resultado"
  | "oferta"
  | "sin-movimiento"
  | "que-busca"
  | "ofrecer"
  | "al-dia";

export interface QueSigue {
  motivo: MotivoQueSigue;
  /** Toca hacerlo ya: se pinta más fuerte. */
  urgente: boolean;
  titulo: string;
  detalle?: string;
  accion: AccionQueSigue;
  otra?: AccionQueSigue;
}

/** Días completos entre una fecha y ahora (nunca negativo). */
export function diasDesde(fecha: string | Date | null | undefined, ahora: Date): number {
  if (!fecha) return 0;
  const t = typeof fecha === "string" ? Date.parse(fecha) : fecha.getTime();
  return Number.isFinite(t) ? Math.max(0, Math.floor((ahora.getTime() - t) / DIA)) : 0;
}

/** "hoy", "mañana", "ayer" o "sábado 14 de noviembre", en la zona del corredor. */
export function nombreDia(fecha: Date, ahora: Date, zona: string): string {
  const dia = fechaIso(fechaLocal(fecha, zona));
  const hoy = fechaLocal(ahora, zona);
  if (dia === fechaIso(hoy)) return "hoy";
  if (dia === fechaIso(sumarDias(hoy, 1))) return "mañana";
  if (dia === fechaIso(sumarDias(hoy, -1))) return "ayer";
  return diaLargo(fecha, zona);
}

/** Título de un día de la historia: "Hoy", "Ayer" o "jueves 12 de noviembre". */
export function tituloDia(fecha: Date, ahora: Date, zona: string): string {
  const n = nombreDia(fecha, ahora, zona);
  return n === "hoy" ? "Hoy" : n === "ayer" ? "Ayer" : n === "mañana" ? "Mañana" : n;
}

/** Agrupa eventos (ya ordenados) por día local, sin cambiar el orden. */
export function agruparPorDia<T extends { cuando: Date }>(eventos: T[], ahora: Date, zona: string): { clave: string; titulo: string; eventos: T[] }[] {
  const grupos: { clave: string; titulo: string; eventos: T[] }[] = [];
  for (const e of eventos) {
    const clave = fechaIso(fechaLocal(e.cuando, zona));
    const ultimo = grupos[grupos.length - 1];
    if (ultimo && ultimo.clave === clave) ultimo.eventos.push(e);
    else grupos.push({ clave, titulo: tituloDia(e.cuando, ahora, zona), eventos: [e] });
  }
  return grupos;
}

/** "el sábado 14 de noviembre a las 9:00 a. m.", "hoy a las 3:00 p. m.". */
function cuandoVisita(fecha: Date, ahora: Date, zona: string): string {
  const dia = nombreDia(fecha, ahora, zona);
  return dia === "hoy" || dia === "mañana" ? `${dia} a las ${horaCorta(fecha, zona)}` : `el ${etiquetaHorario(fecha, zona).replace(", ", " a las ")}`;
}

const pendiente = (estado: string) => estado === "agendada" || estado === "confirmada";
const finDe = (v: VisitaFicha) => (v.fin ? Date.parse(v.fin) : Date.parse(v.inicio) + 60 * 60_000);

export function queSigue(e: EntradaQueSigue): QueSigue {
  const digitos = e.telefono.replace(/\D/g, "");
  const whatsapp = (texto = "Escribirle por WhatsApp"): AccionQueSigue => ({ texto, href: `https://wa.me/${digitos}`, externo: true, tipo: "whatsapp" });
  const llamar = (texto = "Llamar"): AccionQueSigue => ({ texto, href: `tel:${e.telefono}`, tipo: "llamar" });
  const ancla = (texto: string, id: string): AccionQueSigue => ({ texto, href: `#${id}`, tipo: "ficha" });
  const hoy = fechaIso(fechaLocal(e.ahora, e.zona));
  const activo = e.etapa !== "cerrado" && e.etapa !== "perdido";

  // 1. El recordatorio que ya toca (hoy o atrasado).
  if (e.seguimientoFecha && e.seguimientoFecha <= hoy) {
    const nota = e.seguimientoNota?.trim() || "escribirle";
    const atrasado = e.seguimientoFecha < hoy;
    const dia = new Date(`${e.seguimientoFecha}T12:00:00Z`);
    return {
      motivo: "recordatorio",
      urgente: true,
      titulo: atrasado ? `Quedó pendiente: ${nota}` : `Hoy toca: ${nota}`,
      detalle: atrasado ? `Era para el ${diaLargo(dia, "UTC")}.` : "Es tu recordatorio de hoy.",
      accion: /llam/i.test(nota) ? llamar("Llamarlo ahora") : whatsapp(),
      otra: ancla("Ya lo hice", "recordatorio"),
    };
  }

  // 2. Cerrado o perdido: lo que queda por anotar.
  if (e.etapa === "cerrado") {
    return e.cierreAnotado
      ? {
          motivo: "cierre",
          urgente: false,
          titulo: "Cerró. ¡Felicidades!",
          detalle: "Ponle un recordatorio para saludarlo más adelante: un cliente contento recomienda.",
          accion: ancla("Poner un recordatorio", "recordatorio"),
        }
      : {
          motivo: "cierre",
          urgente: true,
          titulo: "Anota cómo cerró",
          detalle: "El precio y tu comisión, para que cuenten en lo ganado del mes.",
          accion: ancla("Anotar el cierre", "cierre"),
        };
  }
  if (e.etapa === "perdido") {
    return {
      motivo: "perdido",
      urgente: false,
      titulo: e.motivoPerdida ? `Se perdió: ${e.motivoPerdida.charAt(0).toLowerCase()}${e.motivoPerdida.slice(1)}` : "Se perdió",
      detalle: "Si vuelve a escribir, toca la etapa en la que va.",
      accion: whatsapp(),
    };
  }

  const ahoraMs = e.ahora.getTime();
  // 3. La visita que viene (la más cercana).
  const proxima = e.visitas
    .filter((v) => pendiente(v.estado) && Date.parse(v.inicio) > ahoraMs)
    .sort((a, b) => Date.parse(a.inicio) - Date.parse(b.inicio))[0];
  if (proxima) {
    const cuando = cuandoVisita(new Date(proxima.inicio), e.ahora, e.zona);
    const porConfirmar = proxima.estado === "agendada";
    return {
      motivo: "visita-proxima",
      urgente: nombreDia(new Date(proxima.inicio), e.ahora, e.zona) === "hoy",
      titulo: `Visita ${cuando}`,
      detalle: [proxima.casa, porConfirmar ? "Falta confirmarla" : "Confirmada"].filter(Boolean).join(" · "),
      accion: { texto: porConfirmar ? "Confirmar la visita" : "Ver la visita", href: `/panel/agenda/visita/${proxima.id}`, tipo: "agenda" },
      otra: whatsapp("Recordársela por WhatsApp"),
    };
  }

  // 4. Una visita que ya pasó y no dice cómo salió.
  const sinAnotar = e.visitas
    .filter((v) => pendiente(v.estado) && finDe(v) < ahoraMs && ahoraMs - finDe(v) < DIAS_VISITA_SIN_ANOTAR * DIA)
    .sort((a, b) => Date.parse(b.inicio) - Date.parse(a.inicio))[0];
  if (sinAnotar) {
    const dia = nombreDia(new Date(sinAnotar.inicio), e.ahora, e.zona);
    return {
      motivo: "visita-sin-resultado",
      urgente: true,
      titulo: "¿Cómo salió la visita?",
      detalle: `Fue ${dia === "hoy" || dia === "ayer" ? dia : `el ${dia}`}${sinAnotar.casa ? ` · ${sinAnotar.casa}` : ""}. Anota si llegó y qué le pareció.`,
      accion: { texto: "Anotar cómo salió", href: `/panel/agenda/visita/${sinAnotar.id}`, tipo: "agenda" },
    };
  }

  // 5. Una oferta en juego.
  if (e.ofertaMonto && e.ofertaMonto > 0) {
    return {
      motivo: "oferta",
      urgente: false,
      titulo: `Ofreció ${montoExacto(e.ofertaMonto, monedaDe(e.ofertaMoneda))}: llámalo por la oferta`,
      detalle: "Cuéntale qué dijo el dueño y en qué quedan.",
      accion: llamar(),
      otra: whatsapp("WhatsApp"),
    };
  }

  // 6. Quieto hace días.
  if (activo && e.diasSinMovimiento >= DIAS_QUIETO) {
    return {
      motivo: "sin-movimiento",
      urgente: true,
      titulo: `Lleva ${e.diasSinMovimiento} días sin movimiento`,
      detalle: "Escríbele para saber cómo va su búsqueda.",
      accion: whatsapp(),
      otra: llamar(),
    };
  }

  // 7. Recién llegado y no se sabe qué busca.
  if ((e.etapa === "nuevo" || e.etapa === "interesado") && !e.sabeQueBusca) {
    return {
      motivo: "que-busca",
      urgente: false,
      titulo: "Pregúntale qué busca",
      detalle: "Para qué es (comprar o alquilar), la zona, el presupuesto y cuántos cuartos.",
      accion: whatsapp("Preguntarle por WhatsApp"),
      otra: ancla("Ya lo sé: anotarlo", "busca"),
    };
  }

  // 8. Tienes casas que le sirven y todavía no eligió.
  if (e.sabeQueBusca && e.casasQueEncajan > 0 && !e.tieneCasaInteres) {
    return {
      motivo: "ofrecer",
      urgente: false,
      titulo: e.casasQueEncajan === 1 ? "Tienes 1 casa que le encaja" : `Tienes ${e.casasQueEncajan} casas que le encajan`,
      detalle: "Mándale la que más le pueda gustar.",
      accion: ancla("Ver las casas", "casas"),
      otra: whatsapp("WhatsApp"),
    };
  }

  // 9. Todo al día.
  const futuro = e.seguimientoFecha && e.seguimientoFecha > hoy;
  return {
    motivo: "al-dia",
    urgente: false,
    titulo: "Todo al día",
    detalle: futuro
      ? `Tu recordatorio es ${
          e.seguimientoFecha === fechaIso(sumarDias(fechaLocal(e.ahora, e.zona), 1)) ? "mañana" : `el ${diaLargo(new Date(`${e.seguimientoFecha}T12:00:00Z`), "UTC")}`
        }: ${e.seguimientoNota?.trim() || "escribirle"}.`
      : "Ponle un recordatorio para no perderle la pista.",
    accion: futuro ? whatsapp() : ancla("Poner un recordatorio", "recordatorio"),
  };
}
