// Formatos para lo que ve el corredor: fechas y precios como se escriben en Costa Rica.

/** "2026-10-19" → "19 de octubre". */
export function fechaCorta(iso: string): string {
  const [a, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(a, m - 1, d)),
  );
}

/** 520000, "USD" → "$520.000"; otras monedas con su código. */
export function precio(valor: number, moneda: string | null): string {
  const cifra = Math.round(valor).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return moneda === "USD" || moneda === null ? `$${cifra}` : `${moneda} ${cifra}`;
}
