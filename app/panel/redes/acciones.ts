"use server";

import { diaLargo } from "@/lib/agenda/formato";
import { RechazoModelo, fichaPropiedades } from "@/lib/asistente/cerebro";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { mensajeFallaIA, registrarFallaIA } from "@/lib/asistente/falla-ia";
import { dentroDelTope, motivoSinPresupuesto } from "@/lib/asistente/limites";
import type { Consumo } from "@/lib/asistente/costo";
import type { Corredor, Foto, Propiedad } from "@/lib/datos/tipos";
import { esFotoPropia, fotosPropias } from "@/lib/fotos/origen";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { nombreArchivo } from "@/lib/panel/nombre-archivo";
import { generarPdfPatty } from "@/lib/panel/pdf-patty";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { hayTurnoPorMinuto } from "@/lib/panel/turno-ia";
import {
  MAX_BYTES_FOTO,
  MAX_BYTES_TOTAL,
  MAX_FOTOS_ANALISIS,
  analisisDemo,
  dimensionesImagen,
  revisarAnalisis,
  tipoImagen,
  type FotoAnalizada,
  type FotoParaAnalisis,
} from "@/lib/redes/analisis-fotos";
import {
  MAX_POST,
  PEDIDOS_POR_MINUTO,
  cifrasDeLaCasa,
  estrategiaDemo,
  estrategiaMarkdown,
  limpiarCaption,
  pautaDemo,
  postDemo,
  presupuestoSugerido,
  revisarEstrategia,
  revisarPauta,
  revisarPost,
  type Contacto,
  type Pauta,
  type Presupuesto,
  type ResultadoPost,
} from "@/lib/redes/estratega";
import { fotosParaRedes, mejoresReales, opcionesDeFoto } from "@/lib/redes/fotos";

// Redes sociales (/panel/redes): la estratega comercial del corredor. Cada acción comprueba con la sesión que la casa
// es suya (corredor_id), frena ráfagas (6 pedidos por minuto), respeta los topes de gasto de IA (Energía) y suma el
// costo; en la demo (corredor inactivo) contesta con una versión simulada hecha por código, sin gastar. El texto que
// pega el corredor va al modelo como dato. Nada del contenido va a los registros. No se guarda nada en la base.

type Resultado<T> = ({ ok: true; demo: boolean; aviso: string | null } & T) | { ok: false; motivo: string };

const COLUMNAS =
  "id, codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno, descripcion, amenidades, url_e24, estado, fotos";
/** Casas con las que se trabaja: las que están a la venta o pausadas (no las vendidas ni alquiladas). */
const ESTADOS = ["activa", "reservada", "inactiva"];
const NO_ES_TUYA = "No encontré esa casa.";
const MUCHOS_PEDIDOS = "Vas muy rápido: espera un minuto y vuelve a pedírmelo.";
const NO_DISPONIBLE = "Esto todavía no está disponible.";
const AVISO_DEMO = "Demostración: lo arma el código con los datos de la casa, sin IA de verdad.";

type Sesion = Awaited<ReturnType<typeof sesionConCorredor>>;
type CasaConFotos = Propiedad & { fotos: Foto[] };

async function casaPropia(s: Sesion, id: unknown): Promise<CasaConFotos | null> {
  if (typeof id !== "string" || !id || id.length > 64) return null;
  const { data } = await s.supabase.from("propiedades").select(COLUMNAS).eq("corredor_id", s.corredor.id).eq("id", id).in("estado", ESTADOS).maybeSingle();
  return (data as CasaConFotos | null) ?? null;
}

const contactoDe = (c: Corredor): Contacto => ({ nombre: c.nombre_contacto, whatsapp: c.whatsapp_numero });
const turno = (corredorId: string) => hayTurnoPorMinuto("redes_estratega", corredorId, PEDIDOS_POR_MINUTO);

/** Dependencias si queda energía; si no, el motivo con las palabras de la Energía. */
async function conEnergia(corredor: Corredor) {
  const deps = dependenciasPara(corredor);
  const p = await deps.repo.presupuestoIA(corredor.id);
  if (!dentroDelTope(p)) return { ok: false as const, motivo: motivoSinPresupuesto(p, corredor.nombre_asistente) };
  return { ok: true as const, deps };
}

async function sumarConsumo(deps: ReturnType<typeof dependenciasPara>, corredorId: string, c: Consumo) {
  await deps.repo.registrarUso(corredorId, { llamadasClaude: 1, tokensEntrada: c.tokensEntrada, tokensSalida: c.tokensSalida, costoClaudeUsd: c.costoUsd });
}

/** Falla de la IA: lo que ya se pagó suma, la causa va a los registros (sin contenido) y el corredor lee qué pasó. */
async function falla(deps: ReturnType<typeof dependenciasPara>, corredor: Corredor, donde: string, e: unknown): Promise<{ ok: false; motivo: string }> {
  if (e instanceof RechazoModelo) {
    await sumarConsumo(deps, corredor.id, e.consumo).catch(() => {});
    return { ok: false, motivo: "La IA no quiso contestar eso. Revisa el texto y vuelve a intentarlo." };
  }
  const causa = registrarFallaIA(deps.registrar, { corredorId: corredor.id, donde }, e);
  console.error(JSON.stringify({ evento: `error_${donde}`, corredorId: corredor.id, causa, error: errorSeguro(e) }));
  return { ok: false, motivo: mensajeFallaIA(causa, corredor.nombre_asistente) };
}

const quitadasAviso = (n: number, que: string) =>
  n ? `Quité ${n === 1 ? `${que} que traía` : `${n} ${que}s que traían`} números que no están en la ficha.` : null;

// ---------------------------------------------------------------- Mejorar un post

/** "Mejorar un post": el texto que pegó (y, si eligió, la casa) → crítica y 2 o 3 versiones con WhatsApp y hashtags. */
export async function mejorarPost(casaId: unknown, captionCrudo: unknown): Promise<Resultado<{ post: ResultadoPost }>> {
  const s = await sesionConCorredor();
  const caption = limpiarCaption(captionCrudo);
  if (!caption) return { ok: false, motivo: "Pega el texto de tu publicación para revisarlo." };
  if (caption.length > MAX_POST) return { ok: false, motivo: `El texto es muy largo: déjalo en menos de ${MAX_POST.toLocaleString("es-CR")} letras (el límite de Instagram).` };
  const conCasa = typeof casaId === "string" && casaId !== "";
  const casa = conCasa ? await casaPropia(s, casaId) : null;
  if (conCasa && !casa) return { ok: false, motivo: NO_ES_TUYA };
  const corredor = s.corredor as Corredor;
  if (!(await turno(corredor.id))) return { ok: false, motivo: MUCHOS_PEDIDOS };
  const contacto = contactoDe(corredor);

  if (corredor.activo === false) return { ok: true, demo: true, aviso: AVISO_DEMO, post: postDemo(caption, casa, contacto) };
  const e = await conEnergia(corredor);
  if (!e.ok) return e;
  if (!e.deps.cerebro.mejorarPostRedes) return { ok: false, motivo: NO_DISPONIBLE };
  const ficha = casa ? fichaPropiedades([casa]) : null;
  try {
    const r = await e.deps.cerebro.mejorarPostRedes(corredor, { ficha, texto: caption });
    await sumarConsumo(e.deps, corredor.id, r.consumo);
    const revisado = revisarPost(r.post, { casa, contacto, permitidas: cifrasDeLaCasa(ficha, casa, contacto, caption) });
    if (!revisado.ok) return revisado;
    return { ok: true, demo: false, aviso: quitadasAviso(revisado.post.quitadas, "una versión o comentario"), post: revisado.post };
  } catch (err) {
    return falla(e.deps, corredor, "redes_post", err);
  }
}

// ---------------------------------------------------------------- Pautas

/** "Pautas": objetivo, público, ubicaciones y creativo de la IA; presupuesto sugerido y pasos, del código. */
export async function recomendarPauta(casaId: unknown): Promise<Resultado<{ pauta: Pauta; presupuesto: Presupuesto }>> {
  const s = await sesionConCorredor();
  const casa = await casaPropia(s, casaId);
  if (!casa) return { ok: false, motivo: NO_ES_TUYA };
  const corredor = s.corredor as Corredor;
  if (!(await turno(corredor.id))) return { ok: false, motivo: MUCHOS_PEDIDOS };
  const presupuesto = presupuestoSugerido(casa);

  if (corredor.activo === false) return { ok: true, demo: true, aviso: AVISO_DEMO, pauta: pautaDemo(casa), presupuesto };
  const e = await conEnergia(corredor);
  if (!e.ok) return e;
  if (!e.deps.cerebro.pautaRedes) return { ok: false, motivo: NO_DISPONIBLE };
  const ficha = fichaPropiedades([casa]);
  try {
    const r = await e.deps.cerebro.pautaRedes(corredor, { ficha });
    await sumarConsumo(e.deps, corredor.id, r.consumo);
    const revisada = revisarPauta(r.pauta, cifrasDeLaCasa(ficha, casa, contactoDe(corredor)));
    if (!revisada) return { ok: false, motivo: "La IA no devolvió una pauta que se pueda usar. Inténtalo de nuevo." };
    return { ok: true, demo: false, aviso: quitadasAviso(revisada.quitadas, "una frase"), pauta: revisada.pauta, presupuesto };
  } catch (err) {
    return falla(e.deps, corredor, "redes_pauta", err);
  }
}

// ---------------------------------------------------------------- Estrategia por casa

/** "Estrategia por casa": el documento en markdown (datos, presupuesto y métricas del código; el resto, revisado). */
export async function armarEstrategia(casaId: unknown): Promise<Resultado<{ markdown: string }>> {
  const s = await sesionConCorredor();
  const casa = await casaPropia(s, casaId);
  if (!casa) return { ok: false, motivo: NO_ES_TUYA };
  const corredor = s.corredor as Corredor;
  if (!(await turno(corredor.id))) return { ok: false, motivo: MUCHOS_PEDIDOS };
  const presupuesto = presupuestoSugerido(casa);

  if (corredor.activo === false) {
    return { ok: true, demo: true, aviso: AVISO_DEMO, markdown: estrategiaMarkdown(estrategiaDemo(casa), casa, presupuesto, true) };
  }
  const e = await conEnergia(corredor);
  if (!e.ok) return e;
  if (!e.deps.cerebro.estrategiaRedes) return { ok: false, motivo: NO_DISPONIBLE };
  const ficha = fichaPropiedades([casa]);
  try {
    const r = await e.deps.cerebro.estrategiaRedes(corredor, { ficha });
    await sumarConsumo(e.deps, corredor.id, r.consumo);
    const revisada = revisarEstrategia(r.estrategia, cifrasDeLaCasa(ficha, casa, contactoDe(corredor)));
    if (!revisada) return { ok: false, motivo: "La IA no devolvió una estrategia que se pueda usar. Inténtalo de nuevo." };
    return { ok: true, demo: false, aviso: quitadasAviso(revisada.quitadas, "una frase"), markdown: estrategiaMarkdown(revisada.estrategia, casa, presupuesto) };
  } catch (err) {
    return falla(e.deps, corredor, "redes_estrategia", err);
  }
}

/** PDF de la estrategia con la marca del corredor (las mismas piezas que el PDF de Patty). Sin IA; no se guarda. */
export async function pdfEstrategia(casaId: unknown, markdown: unknown): Promise<{ ok: true; datos: string; nombre: string } | { ok: false; motivo: string }> {
  const s = await sesionConCorredor();
  const casa = await casaPropia(s, casaId);
  if (!casa) return { ok: false, motivo: NO_ES_TUYA };
  const cuerpo = String(markdown ?? "").slice(0, 40_000);
  if (!cuerpo.trim()) return { ok: false, motivo: "Primero arma la estrategia." };
  const titulo = `Estrategia de redes · ${casa.titulo}`.slice(0, 120);
  try {
    const pdf = await generarPdfPatty({
      titulo,
      texto: cuerpo,
      diagramas: [],
      marca: s.corredor.marca ?? null,
      corredor: s.corredor.nombre,
      fecha: diaLargo(new Date(), s.corredor.zona_horaria),
      asistente: s.corredor.nombre_asistente || "Patty",
    });
    return { ok: true, datos: pdf.toString("base64"), nombre: nombreArchivo(`Estrategia ${casa.codigo}`, "pdf") };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_pdf_estrategia", corredorId: s.corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude armar el PDF. Inténtalo de nuevo." };
  }
}

// ---------------------------------------------------------------- Analizar fotos

/** Las fotos que se analizan: la mejor versión real de cada foto de la casa (nunca las ilustrativas), hasta 12. */
function fotosDeLaCasa(casa: CasaConFotos, corredor: Corredor): FotoParaAnalisis[] {
  const opciones = opcionesDeFoto(fotosParaRedes(casa.fotos ?? [], corredor, fotosPropias));
  return mejoresReales(opciones)
    .slice(0, MAX_FOTOS_ANALISIS)
    .map((o, i) => ({ id: `F${i + 1}`, url: o.url, nombre: o.nombre, ancho: null, alto: null, mejorada: o.tipo === "mejorada", original: o.original }));
}

type Bajada = { foto: FotoParaAnalisis; mediaType: "image/jpeg" | "image/png" | "image/webp"; datos: string };

/**
 * Baja las fotos del bucket propio del corredor (nunca otra dirección), una por una, con tiempo de espera, sin
 * redirecciones y con tope por foto y entre todas. Devuelve las que se pudieron leer y cuántas quedaron fuera.
 */
async function bajarFotos(fotos: FotoParaAnalisis[], corredorId: string): Promise<{ bajadas: Bajada[]; fuera: number }> {
  const bajadas: Bajada[] = [];
  let total = 0;
  let fuera = 0;
  for (const f of fotos) {
    if (!esFotoPropia(f.url, corredorId)) {
      fuera++;
      continue;
    }
    try {
      const res = await fetch(f.url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
      const largo = Number(res.headers.get("content-length") ?? 0);
      if (!res.ok || largo > MAX_BYTES_FOTO) {
        fuera++;
        continue;
      }
      const bytes = new Uint8Array(await res.arrayBuffer());
      const tipo = tipoImagen(bytes);
      if (!tipo || bytes.length > MAX_BYTES_FOTO || total + bytes.length > MAX_BYTES_TOTAL) {
        fuera++;
        continue;
      }
      total += bytes.length;
      const dim = dimensionesImagen(bytes);
      bajadas.push({ foto: { ...f, ancho: dim?.ancho ?? null, alto: dim?.alto ?? null }, mediaType: tipo, datos: Buffer.from(bytes).toString("base64") });
    } catch (e) {
      fuera++;
      console.error(JSON.stringify({ evento: "error_foto_analisis", corredorId, error: errorSeguro(e) }));
    }
  }
  return { bajadas, fuera };
}

/** "Analizar fotos": la IA califica cada foto real; portada, mejoras, faltantes y orden los arma el navegador con código. */
export async function analizarFotos(casaId: unknown): Promise<Resultado<{ analisis: FotoAnalizada[]; comentario: string; total: number }>> {
  const s = await sesionConCorredor();
  const casa = await casaPropia(s, casaId);
  if (!casa) return { ok: false, motivo: NO_ES_TUYA };
  const corredor = s.corredor as Corredor;
  const fotos = fotosDeLaCasa(casa, corredor);
  if (fotos.length === 0) return { ok: false, motivo: "Primero sube fotos de la casa." };
  if (!(await turno(corredor.id))) return { ok: false, motivo: MUCHOS_PEDIDOS };

  if (corredor.activo === false) {
    return {
      ok: true,
      demo: true,
      aviso: AVISO_DEMO,
      analisis: revisarAnalisis(analisisDemo(fotos), fotos),
      comentario: "En la demostración las notas son de ejemplo: con tu cuenta, la IA mira cada foto de verdad.",
      total: fotos.length,
    };
  }
  const e = await conEnergia(corredor);
  if (!e.ok) return e;
  if (!e.deps.cerebro.analizarFotosRedes) return { ok: false, motivo: NO_DISPONIBLE };
  const { bajadas, fuera } = await bajarFotos(fotos, corredor.id);
  if (bajadas.length === 0) return { ok: false, motivo: "No pude abrir las fotos de la casa. Inténtalo de nuevo en un rato." };
  const ficha = fichaPropiedades([casa]);
  try {
    const r = await e.deps.cerebro.analizarFotosRedes(corredor, {
      ficha,
      fotos: bajadas.map((b) => ({ id: b.foto.id, mediaType: b.mediaType, datos: b.datos })),
    });
    await sumarConsumo(e.deps, corredor.id, r.consumo);
    const analisis = revisarAnalisis(
      r.fotos,
      bajadas.map((b) => b.foto),
      cifrasDeLaCasa(ficha, casa, contactoDe(corredor)),
    );
    if (analisis.length === 0) return { ok: false, motivo: "La IA no devolvió notas para las fotos. Inténtalo de nuevo." };
    const sinAnalizar = fuera + (bajadas.length - analisis.length);
    return {
      ok: true,
      demo: false,
      aviso: sinAnalizar ? `${sinAnalizar === 1 ? "Una foto no se pudo" : `${sinAnalizar} fotos no se pudieron`} analizar (muy pesada o no abrió).` : null,
      analisis,
      comentario: r.comentario,
      total: fotos.length,
    };
  } catch (err) {
    return falla(e.deps, corredor, "redes_fotos", err);
  }
}
