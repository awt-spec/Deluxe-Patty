"use server";

import { revalidatePath } from "next/cache";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { mensajeFallaIA, registrarFallaIA } from "@/lib/asistente/falla-ia";
import { SIN_PRESUPUESTO, hayPresupuestoHoy } from "@/lib/asistente/limites";
import type { Corredor, FichaParcial, Foto } from "@/lib/datos/tipos";
import { fotosPropias } from "@/lib/fotos/origen";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { reportarFalla } from "@/lib/monitoreo/fallas";
import { ordenarFotos } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { hayTurnoPorMinuto } from "@/lib/panel/turno-ia";
import { reclamarEnvio } from "@/lib/panel/una-vez";
import { MAX_TEXTO_CASA, conversarCasaTexto, textosLimpios, type ModoTexto } from "@/lib/propiedades/casa-texto";
import { MAX_MENSAJES_FICHA, MAX_TEXTO_FICHA, fichaLimpia } from "@/lib/propiedades/conversar";
import { MAX_FOTOS_CASA_SITIO, armarPedidoCasa, leerRespuestaCasa, urlFuncionCasa, type TextosCasa } from "@/lib/sitio/casa";
import { configFotosSitio, enviarAlSitio, mensajeFallaSitio } from "@/lib/sitio/fotos";
import { fotosDeCasa, fuentesSitio, hostsDeFotos } from "@/lib/sitio/importar";
import { sitiosWeb } from "@/lib/sitio/modo-corredor";
import { createAdminClient } from "@/lib/supabase/admin";

// Casa nueva desde el chat de Patty con fotos y el texto pegado: (1) Claude arma la ficha y los textos es/en y el código
// pregunta lo que falte; (2) se guarda en el portal con "Sí, guardarla" (guardarCasaConversada, como siempre) y (3) si el
// corredor lo pide, se publica en el sitio con un POST firmado a `recibir-casa`. La casa del portal toma el código
// DP-XXXXXX que da el sitio y sus fotos la dirección de allá (`fuente`), así la importación la reconoce y no la duplica.

type Fallo = { ok: false; motivo: string };
type Sesion = Awaited<ReturnType<typeof sesionConCorredor>>;
const esDemo = (s: Sesion) => (s.corredor as Corredor).activo === false;
const MUCHOS = "Vas muy rápido: espera un minuto y vuelve a intentarlo.";
const SIN_SITIO = "Tu sitio web todavía no está conectado para recibir casas. Escríbele a soporte.";

async function slugDe(s: Sesion): Promise<string | null> {
  const { data } = await s.supabase.from("corredores").select("slug").eq("id", s.corredor.id).maybeSingle();
  return (data as { slug?: string } | null)?.slug ?? null;
}

function baseStorage(): string | null {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  return u ? u.replace(/\/+$/, "") : null;
}

/** ¿Se puede publicar en el sitio? (demo: sí, simulado). */
async function sitioListo(s: Sesion): Promise<boolean> {
  if (esDemo(s)) return true;
  const config = configFotosSitio(await slugDe(s));
  return !!config && !!urlFuncionCasa(config.url);
}

export type RespuestaCasaTexto =
  | {
      ok: true;
      ficha: FichaParcial;
      textos: TextosCasa;
      mensaje: string;
      pregunta: string | null;
      lista: boolean;
      puedeGuardar: boolean;
      resumen: string[];
      sitio: boolean;
    }
  | Fallo;

/** Un turno: lee el texto pegado (y las respuestas) y dice qué preguntar o que ya está lista. */
export async function armarCasaDesdeTexto(p: {
  texto: unknown;
  modo: unknown;
  mensajes: unknown;
  ficha: unknown;
  preguntadas: unknown;
}): Promise<RespuestaCasaTexto> {
  const s = await sesionConCorredor();
  const corredor = s.corredor as Corredor;
  const texto = typeof p?.texto === "string" ? p.texto.trim().slice(0, MAX_TEXTO_CASA) : "";
  if (texto.length < 3) return { ok: false, motivo: "Pégame el texto de la casa o cuéntamela con tus palabras." };
  const modo: ModoTexto = p.modo === "tal_cual" ? "tal_cual" : "mejorar";
  const mensajes = (Array.isArray(p.mensajes) ? p.mensajes : [])
    .slice(-MAX_MENSAJES_FICHA)
    .map((m) => ({
      autor: ((m as { autor?: unknown })?.autor === "asistente" ? "asistente" : "corredor") as "asistente" | "corredor",
      texto: String((m as { texto?: unknown })?.texto ?? "").slice(0, MAX_TEXTO_FICHA),
    }))
    .filter((m) => m.texto.trim());
  const preguntadas = (Array.isArray(p.preguntadas) ? p.preguntadas : []).filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 80)).slice(0, 30);
  const deps = dependenciasPara(corredor);
  if (!(await hayPresupuestoHoy(deps.repo, corredor))) return { ok: false, motivo: SIN_PRESUPUESTO };
  if (!(await hayTurnoPorMinuto("patty_casa_texto", corredor.id, 8))) return { ok: false, motivo: MUCHOS };
  try {
    const r = await conversarCasaTexto(deps.cerebro, corredor, {
      texto,
      modo,
      mensajes,
      actual: p.ficha ? fichaLimpia(p.ficha) : null,
      preguntadas,
    });
    await deps.repo.registrarUso(corredor.id, {
      llamadasClaude: 1,
      tokensEntrada: r.consumo.tokensEntrada,
      tokensSalida: r.consumo.tokensSalida,
      costoClaudeUsd: r.consumo.costoUsd,
    });
    return {
      ok: true,
      ficha: r.ficha,
      textos: r.textos,
      mensaje: r.mensaje,
      pregunta: r.pregunta,
      lista: r.lista,
      puedeGuardar: r.puedeGuardar,
      resumen: r.resumen,
      sitio: await sitioListo(s),
    };
  } catch (error) {
    const causa = registrarFallaIA(deps.registrar, { corredorId: corredor.id, donde: "casa_texto" }, error);
    return { ok: false, motivo: causa === "otra" ? "No te entendí bien esta vez. ¿Me lo repites?" : mensajeFallaIA(causa, corredor.nombre_asistente) };
  }
}

type FilaCasa = {
  id: string;
  codigo: string;
  estado: string;
  operacion: "venta" | "alquiler";
  tipo: FichaParcial["tipo"];
  precio: number | null;
  moneda: "USD" | "CRC" | null;
  provincia: string | null;
  canton: string | null;
  distrito: string | null;
  zona: string | null;
  habitaciones: number | null;
  banos: number | null;
  m2_construccion: number | null;
  m2_terreno: number | null;
  amenidades: string[] | null;
  descripcion: string | null;
  titulo: string;
  fotos: Foto[] | null;
};

/** La ficha que va al sitio sale de la casa guardada en el portal (no de lo que mande el navegador). */
function fichaDeFila(c: FilaCasa): FichaParcial {
  return fichaLimpia({ ...c, amenidades: c.amenidades ?? [] });
}

export type ResultadoPublicar = { ok: true; demo: boolean; codigo: string | null; urlCasa: string | null; fotos: string[] } | Fallo;

/**
 * "Sí, guardar y publicar en el sitio": la casa ya está guardada en el portal (con sus fotos). Se manda firmada a
 * `recibir-casa`; si el sitio la crea, la casa del portal toma su código DP-XXXXXX y sus fotos la `fuente` de allá.
 */
export async function publicarCasaEnSitio(p: { casaId: unknown; textos: unknown; envio: unknown }): Promise<ResultadoPublicar> {
  const s = await sesionConCorredor();
  const id = typeof p?.casaId === "string" && /^[0-9a-f-]{36}$/i.test(p.casaId) ? p.casaId : null;
  if (!id) return { ok: false, motivo: "No encontré la casa." };
  const { data } = await s.supabase
    .from("propiedades")
    .select("id, codigo, estado, operacion, tipo, precio, moneda, provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno, amenidades, descripcion, titulo, fotos")
    .eq("corredor_id", s.corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!data) return { ok: false, motivo: "No encontré la casa." };
  const casa = data as FilaCasa;
  if (/^DP-/i.test(casa.codigo)) return { ok: false, motivo: "Esa casa ya está en el sitio." };
  const textos = textosLimpios(p.textos) ?? {
    titulo_es: casa.titulo,
    titulo_en: casa.titulo,
    descripcion_es: casa.descripcion ?? casa.titulo,
    descripcion_en: casa.descripcion ?? casa.titulo,
    destacados_es: [],
    destacados_en: [],
  };
  // Demo: simulado, nunca llama al sitio.
  if (esDemo(s)) return { ok: true, demo: true, codigo: null, urlCasa: null, fotos: [] };

  const slug = await slugDe(s);
  const config = configFotosSitio(slug);
  const url = config ? urlFuncionCasa(config.url) : null;
  const exportacion = slug ? fuentesSitio()[slug] : null;
  const base = baseStorage();
  if (!config || !url || !exportacion || !base) return { ok: false, motivo: SIN_SITIO };
  const corredor = s.corredor as Corredor;
  const fotos = fotosPropias(ordenarFotos(casa.fotos ?? []), corredor.id).slice(0, MAX_FOTOS_CASA_SITIO);
  if (!fotos.length) return { ok: false, motivo: "La casa no tiene fotos todavía: súbele al menos una para publicarla en el sitio." };
  if (!(await hayTurnoPorMinuto("sitio_casa_publicar", corredor.id, 3))) return { ok: false, motivo: MUCHOS };

  const admin = createAdminClient();
  const envio = typeof p.envio === "string" && /^[0-9a-f-]{36}$/i.test(p.envio) ? p.envio.toLowerCase() : null;
  const turno = await reclamarEnvio(admin, "sitio_casa", corredor.id, envio, casa.id);
  if (!turno.primero) return { ok: false, motivo: "Esa casa ya se está publicando. Revisa el sitio en un momento." };

  const pedido = armarPedidoCasa({ ficha: fichaDeFila(casa), textos, fotos: fotos.map((f) => f.url), secreto: config.secreto });
  const r = await enviarAlSitio(url, pedido);
  if (!r.ok) {
    await turno.soltar();
    console.error(JSON.stringify({ evento: "error_sitio_casa", corredorId: corredor.id, causa: r.causa, status: r.status }));
    if (r.causa === "firma" || r.causa === "otra") reportarFalla("error_sitio_casa", { corredorId: corredor.id, error: `${r.causa}:${r.status ?? "red"}` });
    return { ok: false, motivo: mensajeFallaSitio(r.causa).replace("subir las fotos", "publicar la casa").replace("no se subió nada", "no se publicó nada") };
  }
  const hostExportacion = new URL(exportacion).host;
  const respuesta = leerRespuestaCasa(r.json, { hostsFotos: hostsDeFotos(hostExportacion), sitio: slug ? (sitiosWeb()[slug] ?? null) : null });
  if (!respuesta) {
    console.error(JSON.stringify({ evento: "error_sitio_casa", corredorId: corredor.id, causa: "respuesta" }));
    return { ok: true, demo: false, codigo: null, urlCasa: null, fotos: [] };
  }
  await anotarCasaPublicada(admin, corredor.id, casa.id, respuesta.codigo, fotos, respuesta.fotos, hostExportacion).catch((e) =>
    console.error(JSON.stringify({ evento: "error_sitio_casa_anotar", corredorId: corredor.id, error: errorSeguro(e) })),
  );
  console.info(JSON.stringify({ evento: "sitio_casa_publicada", corredorId: corredor.id, fotos: respuesta.fotos.length }));
  revalidatePath(`/panel/propiedades/${casa.id}`);
  revalidatePath("/panel/propiedades");
  return { ok: true, demo: false, codigo: respuesta.codigo, urlCasa: respuesta.urlCasa, fotos: respuesta.fotos };
}

/**
 * La casa del portal pasa a ser "la del sitio": toma su código DP-XXXXXX (la importación la encuentra por ahí y no
 * crea otra) y cada foto enviada lleva `fuente` = su dirección en el sitio (normalizada como la importación) y
 * `al_sitio`, para que no se copie de nuevo ni se quite mientras la exportación del sitio todavía no la lista.
 */
async function anotarCasaPublicada(
  admin: ReturnType<typeof createAdminClient>,
  corredorId: string,
  casaId: string,
  codigo: string,
  enviadas: Foto[],
  delSitio: string[],
  hostExportacion: string,
) {
  const ahora = new Date().toISOString();
  const { data } = await admin.from("propiedades").select("fotos").eq("corredor_id", corredorId).eq("id", casaId).maybeSingle();
  const actuales = ordenarFotos(((data as { fotos?: Foto[] } | null)?.fotos ?? []) as Foto[]);
  const fuentes = fotosDeCasa(delSitio, hostExportacion);
  const porUrl = new Map(enviadas.map((f, i) => [f.url, fuentes.length === enviadas.length ? fuentes[i] : undefined]));
  const fotos = actuales.map((f) => {
    const fuente = porUrl.get(f.url);
    return fuente ? { ...f, fuente, al_sitio: ahora } : { ...f, al_sitio: ahora };
  });
  const { error } = await admin.from("propiedades").update({ codigo, fotos }).eq("corredor_id", corredorId).eq("id", casaId);
  if (error) throw Object.assign(new Error("anotar"), { code: error.code });
}
