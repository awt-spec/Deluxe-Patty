import { fechaLocal, minutosDe, minutosLocales } from "./tiempo";

// Revisión de la hora de una visita que el corredor agenda o mueve a mano desde el panel. Es su agenda: fuera de su
// horario o en un rato que apartó no se le impide, pero se le avisa y se le pide confirmar. Lo que sí se rechaza es
// una hora que ya pasó. Las visitas encimadas las sigue frenando la base (restricción de exclusión).

/** Minutos de gracia para "ya pasó": el formulario pudo quedar abierto un rato. */
export const MARGEN_PASADO_MIN = 10;

export interface FranjaHorario {
  dia_semana: number;
  hora_inicio: string;
  hora_fin: string;
}

export type RevisionHora =
  | { ok: false; motivo: string }
  | { ok: true; avisos: ("fuera_de_horario" | "rato_apartado")[]; pregunta: string | null };

export function revisarHoraVisita(v: {
  inicio: Date;
  fin: Date;
  ahora: Date;
  zona: string;
  franjas: FranjaHorario[];
  bloqueos: { inicio: string; fin: string }[];
  /** Para la pregunta: "¿Agendar igual?" o "¿Moverla igual?". */
  accion?: "agendar" | "mover";
}): RevisionHora {
  if (v.inicio.getTime() < v.ahora.getTime() - MARGEN_PASADO_MIN * 60_000) {
    return { ok: false, motivo: "Esa hora ya pasó. Elige un día y una hora de ahora en adelante." };
  }
  const avisos: ("fuera_de_horario" | "rato_apartado")[] = [];
  // Sin horario guardado no hay con qué comparar (la puesta en marcha ya se lo pide).
  if (v.franjas.length > 0) {
    const dia = fechaLocal(v.inicio, v.zona).diaSemana;
    const desde = minutosLocales(v.inicio, v.zona);
    const hasta = desde + Math.round((v.fin.getTime() - v.inicio.getTime()) / 60_000);
    const cabe = v.franjas.some((f) => f.dia_semana === dia && desde >= minutosDe(f.hora_inicio) && hasta <= minutosDe(f.hora_fin));
    if (!cabe) avisos.push("fuera_de_horario");
  }
  if (v.bloqueos.some((b) => Date.parse(b.inicio) < v.fin.getTime() && Date.parse(b.fin) > v.inicio.getTime())) avisos.push("rato_apartado");
  const partes = avisos.map((a) => (a === "fuera_de_horario" ? "fuera de tu horario de visitas" : "en un rato que apartaste"));
  return { ok: true, avisos, pregunta: partes.length ? `Eso cae ${partes.join(" y ")}. ¿${v.accion === "mover" ? "Moverla" : "Agendar"} igual?` : null };
}

/** Lo que el formulario manda de vuelta al confirmar: amarra la confirmación a ese día y hora (si cambian, se revisa otra vez). */
export const firmaConfirmacion = (fecha: string, hora: string) => `${fecha}T${hora}`;
