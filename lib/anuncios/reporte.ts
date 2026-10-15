import type { AnuncioResumen } from "../datos/tipos";

export const DIAS_REPORTE = 30;

function diasHasta(fecha: string, hoy: string): number {
  return Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);
}

/** Qué anuncios traen contactos y cuáles conviene mejorar o renovar. Lo arma el código. */
export function armarReporte(anuncios: AnuncioResumen[], hoy: string): string {
  const publicados = anuncios.filter((a) => a.estado !== "borrador");
  if (publicados.length === 0) {
    return "Todavía no tengo anuncios tuyos de Encuentra24 registrados, así que no hay contactos que atribuir.";
  }
  const nombre = (a: AnuncioResumen) => a.titulo ?? a.propiedad_titulo ?? `ref. ${a.referencia}`;
  const ordenados = [...publicados].sort((a, b) => b.contactos_periodo - a.contactos_periodo);
  const conContactos = ordenados.filter((a) => a.contactos_periodo > 0);
  const sinContactos = ordenados.filter((a) => a.contactos_periodo === 0 && a.estado === "activo");
  const porVencer = ordenados.filter((a) => a.estado === "activo" && a.vence_en && diasHasta(a.vence_en, hoy) <= 7);
  const vencidos = ordenados.filter((a) => a.estado === "vencido");

  const l = [`*Tus anuncios de Encuentra24 (últimos ${DIAS_REPORTE} días)*`, ""];
  if (conContactos.length) {
    l.push("*Traen contactos*");
    for (const a of conContactos) {
      l.push(`• ${nombre(a)}: ${a.contactos_periodo} ${a.contactos_periodo === 1 ? "contacto" : "contactos"}`);
    }
  } else {
    l.push("Ningún anuncio trajo contactos atribuidos en este periodo.");
  }
  if (sinContactos.length) {
    l.push("", "*Sin contactos: conviene mejorar foto principal, título o precio*");
    for (const a of sinContactos) l.push(`• ${nombre(a)}`);
  }
  if (porVencer.length) {
    l.push("", "*Por vencer: renuévalos*");
    for (const a of porVencer) {
      const d = diasHasta(a.vence_en!, hoy);
      l.push(`• ${nombre(a)}: ${d <= 0 ? "vence hoy" : `vence en ${d} ${d === 1 ? "día" : "días"}`}`);
    }
  }
  if (vencidos.length) {
    l.push("", "*Vencidos*");
    for (const a of vencidos) l.push(`• ${nombre(a)}`);
  }
  l.push("", "Solo cuento contactos que llegaron por el enlace de WhatsApp del anuncio.");
  return l.join("\n");
}
