// Reglas puras de las pantallas del panel en el teléfono (< 900 px): dónde arranca la semana, los puntos del mes,
// la barra que se esconde al bajar, el resumen de una sección plegada y cuánto mover la página para que se vea lo
// que cambió encima de una hoja. Sin DOM: los componentes cliente las usan y las pruebas las cubren.

/** Columna con la que abre la semana en el teléfono: la de hoy si está en la semana mostrada; si no, el lunes (0). */
export function columnaInicialSemana(dias: string[], hoy: string): number {
  const i = dias.indexOf(hoy);
  return i < 0 ? 0 : i;
}

/** Puntos de un día en el mes: hasta `max` puntos y "+N" con el resto. */
export function puntosDelDia(visitas: number, max = 3): { puntos: number; mas: number } {
  const n = Math.max(0, Math.floor(visitas));
  return { puntos: Math.min(n, max), mas: Math.max(0, n - max) };
}

/**
 * Día elegido al abrir el mes en el teléfono: el pedido (`?dia=`) si cae en ese mes; si no, hoy si el mes es el de
 * hoy; si no, el primer día del mes con visitas; si no, el 1. Fechas AAAA-MM-DD; `mes` es "AAAA-MM".
 */
export function diaInicialMes(mes: string, hoy: string, conVisitas: string[], pedido?: string | null): string {
  if (pedido && /^\d{4}-\d{2}-\d{2}$/.test(pedido) && pedido.startsWith(mes)) return pedido;
  if (hoy.startsWith(mes)) return hoy;
  const primero = [...conVisitas].filter((d) => d.startsWith(mes)).sort()[0];
  return primero ?? `${mes}-01`;
}

/**
 * Barra que se esconde con el desplazamiento: al bajar más de `umbral` px se oculta, al subir se muestra, y cerca
 * de arriba siempre se ve. `null` = no cambia (movimientos chicos, para que no parpadee).
 */
export function cambioBarra(anterior: number, actual: number, umbral = 8, arriba = 80): "ocultar" | "mostrar" | null {
  if (actual <= arriba) return "mostrar";
  const d = actual - anterior;
  if (d > umbral) return "ocultar";
  if (d < -umbral) return "mostrar";
  return null;
}

/** Resumen de lo ya llenado en una sección plegada: los valores no vacíos, separados por " · ", cortado a `max`. */
export function resumenCampos(valores: (string | null | undefined)[], max = 64, vacio = "Sin llenar"): string {
  const llenos = valores.map((v) => (v ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (!llenos.length) return vacio;
  const texto = llenos.join(" · ");
  return texto.length > max ? `${texto.slice(0, max - 1).trimEnd()}…` : texto;
}

/** "Qué busca: comprar · Escazú · hasta $1.100.000" con los datos que la ficha ya armó (Para, Tipo, Zonas, Hasta, Cuartos). */
export function resumenBusca(datos: { k: string; v: string }[]): string {
  const partes = datos.map(({ k, v }) =>
    k === "Para" ? v.toLowerCase() : k === "Hasta" ? `hasta ${v}` : k === "Cuartos" ? `${v} ${v === "1" ? "cuarto" : "cuartos"}` : v,
  );
  return `Qué busca: ${resumenCampos(partes, 70, "todavía no lo dijo")}`;
}

/** Lo que dice la barra de una línea después de aplicar un cambio: "Listo: <primer cambio>" (o el texto corto). */
export function resumenListo(texto: string, cambios?: string[], max = 48): string {
  const base = (cambios?.find((c) => c.trim()) ?? texto).replace(/\s+/g, " ").trim();
  const corto = base.length > max ? `${base.slice(0, max - 1).trimEnd()}…` : base;
  return corto ? `Listo: ${corto.charAt(0).toLowerCase()}${corto.slice(1)}` : "Listo";
}

/**
 * Cuánto mover la página (px, positivo = bajar) para que un elemento quede a la vista entre `arriba` (lo pegajoso de
 * arriba) y `abajo` (donde empieza la hoja). Si cabe, se centra en ese espacio; si no, su borde de arriba queda en
 * `arriba`. 0 si ya se ve entero.
 */
export function desplazamientoParaVer(el: { top: number; alto: number }, arriba: number, abajo: number): number {
  const espacio = abajo - arriba;
  if (el.top >= arriba && el.top + el.alto <= abajo) return 0;
  if (el.alto >= espacio) return Math.round(el.top - arriba);
  return Math.round(el.top - (arriba + (espacio - el.alto) / 2));
}
