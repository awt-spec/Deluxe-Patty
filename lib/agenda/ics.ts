import type { CitaCalendario } from "../datos/tipos";

// Calendario iCalendar (RFC 5545) de solo lectura con las citas del corredor, para suscribirse
// desde el calendario del teléfono (iPhone, Google Calendar, Outlook).

function escapar(texto: string): string {
  return texto
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r\n|\r|\n/g, "\\n");
}

function fechaUtc(d: Date): string {
  return d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

// Líneas de máximo 75 octetos; las continuaciones empiezan con un espacio.
function plegar(linea: string): string {
  const bytes = new TextEncoder();
  if (bytes.encode(linea).length <= 75) return linea;
  const partes: string[] = [];
  let actual = "";
  for (const ch of linea) {
    const limite = partes.length === 0 ? 75 : 74;
    if (bytes.encode(actual + ch).length > limite) {
      partes.push(actual);
      actual = ch;
    } else {
      actual += ch;
    }
  }
  partes.push(actual);
  return partes.join("\r\n ");
}

export function calendarioIcs(nombre: string, citas: CitaCalendario[], ahora = new Date()): string {
  const lineas = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//Asistente corredores//Agenda//ES",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapar(`Visitas · ${nombre}`)}`,
    "REFRESH-INTERVAL;VALUE=DURATION:PT15M",
    "X-PUBLISHED-TTL:PT15M",
  ];
  for (const c of citas) {
    const cliente = c.cliente_nombre ?? c.cliente_telefono;
    const resumen = `Visita: ${cliente}${c.propiedad_titulo ? ` · ${c.propiedad_titulo}` : ""}`;
    const descripcion = [
      `Cliente: ${cliente}`,
      `Teléfono: ${c.cliente_telefono}`,
      c.propiedad_titulo ? `Propiedad: ${c.propiedad_titulo}${c.propiedad_codigo ? ` (${c.propiedad_codigo})` : ""}` : null,
      c.notas ? `Notas: ${c.notas}` : null,
    ]
      .filter(Boolean)
      .join("\n");
    const estado =
      c.estado === "cancelada" ? "CANCELLED" : c.estado === "agendada" ? "TENTATIVE" : "CONFIRMED";
    lineas.push(
      "BEGIN:VEVENT",
      `UID:${c.id}@asistente`,
      `DTSTAMP:${fechaUtc(ahora)}`,
      `LAST-MODIFIED:${fechaUtc(c.updated_at)}`,
      `DTSTART:${fechaUtc(c.inicio)}`,
      `DTEND:${fechaUtc(c.fin)}`,
      `SUMMARY:${escapar(resumen)}`,
      `DESCRIPTION:${escapar(descripcion)}`,
      `STATUS:${estado}`,
      "END:VEVENT",
    );
  }
  lineas.push("END:VCALENDAR");
  return lineas.map(plegar).join("\r\n") + "\r\n";
}
