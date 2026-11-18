// Formatos para lo que ve el corredor: fechas y precios como se escriben en Costa Rica.

/** "2026-10-19" → "19 de octubre". */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(a, m - 1, d)),
  );
}

/**
 * Un instante ("2026-11-18T04:40:00Z") como día corto en la zona del corredor: a las 22:40 del 17 en Costa Rica dice
 * "17 de noviembre", no el 18 (antes se cortaba el texto ISO, que está en UTC).
 */
export function fechaCortaEn(instante: string, zona = "America/Costa_Rica"): string {
  const d = new Date(instante);
  if (Number.isNaN(d.getTime())) return fechaCorta(instante);
  return new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", timeZone: zona }).format(d);
}

/** Hoy (o `dias` después) como "2026-11-17" en la zona del corredor. */
export function diaEn(zona = "America/Costa_Rica", dias = 0, ahora = new Date()): string {
  const d = new Date(ahora.getTime() + dias * 86_400_000);
  // en-CA escribe AAAA-MM-DD.
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: zona }).format(d);
}

/** 520000, "USD" → "$520.000"; otras monedas con su código. */
export function precio(valor: number, moneda: string | null): string {
  const cifra = Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return moneda === "USD" || moneda === null ? `$${cifra}` : `${moneda} ${cifra}`;
}
