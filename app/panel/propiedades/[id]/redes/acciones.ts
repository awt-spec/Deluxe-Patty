"use server";

import { revalidatePath } from "next/cache";
import { fichaPropiedades } from "@/lib/asistente/cerebro";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { SIN_PRESUPUESTO, hayPresupuestoHoy } from "@/lib/asistente/limites";
import type { Consumo } from "@/lib/asistente/costo";
import type { Corredor, Foto, Propiedad } from "@/lib/datos/tipos";
import { ESTILOS } from "@/lib/fotos/editor";
import { mejorarFotos } from "@/lib/fotos/mejorar";
import { fotosPropias } from "@/lib/fotos/origen";
import { crearVariante, puedeUsarImagenes } from "@/lib/fotos/variantes";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { sesionConCorredor } from "@/lib/panel/sesion";
import {
  aplicarVideo,
  esCostosa,
  fotosParaChat,
  historialValido,
  interpretarDemo,
  limpiarPedido,
  normalizarImagen,
  normalizarVideo,
  resumenVideo,
  vetoImagen,
  type EstadoVideo,
  type OperacionCruda,
  type OperacionImagen,
  type OperacionVideo,
} from "@/lib/redes/chat";
import { cifrasPermitidas } from "@/lib/redes/cifras";
import { ESTILOS_LISTA, type EstiloVideo } from "@/lib/redes/estilo-video";
import { fotosParaRedes, mejoresReales, opcionesDeFoto, type OpcionFoto } from "@/lib/redes/fotos";
import { lineaContacto, precioCasa } from "@/lib/redes/texto";
import { MAX_TEXTO_REDES, esModoTexto, revisarTextoIA, textoDemo } from "@/lib/redes/texto-ia";
import {
  FORMATOS_VIDEO,
  MAX_FOTOS_VIDEO,
  MAX_TEXTO_ESCENA,
  guionDemo,
  guionPorDefecto,
  revisarGuion,
  type Escena,
  type FormatoVideo,
  type FotoParaGuion,
} from "@/lib/redes/video";
import { createAdminClient } from "@/lib/supabase/admin";

// Lo que hace la IA en "Imagen para redes": mejorar una foto, reescribir el texto y proponer el guion del
// video. Cada acción comprueba con la sesión que la casa es del corredor (corredor_id), respeta el tope de
// gasto de IA y, en la demo (corredor inactivo), no gasta: responde con una versión simulada.

type Resultado<T> = ({ ok: true } & T) | { ok: false; motivo: string };

const COLUMNAS =
  "id, codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno, descripcion, amenidades, url_e24, estado, fotos";

async function casaPropia(id: unknown) {
  const s = await sesionConCorredor();
  if (typeof id !== "string" || !id) return null;
  const { data } = await s.supabase.from("propiedades").select(COLUMNAS).eq("corredor_id", s.corredor.id).eq("id", id).maybeSingle();
  if (!data) return null;
  const casa = data as Propiedad & { fotos: Foto[] };
  return { corredor: s.corredor as Corredor, casa, opciones: opcionesDeFoto(fotosParaRedes(casa.fotos ?? [], s.corredor, fotosPropias)) };
}

const NO_ES_TUYA = "No encontré esa casa.";
const contactoDe = (c: Corredor) => ({ nombre: c.nombre_contacto, whatsapp: c.whatsapp_numero });

async function sumarConsumo(repo: ReturnType<typeof dependenciasPara>["repo"], corredorId: string, c: Consumo) {
  await repo.registrarUso(corredorId, { llamadasClaude: 1, tokensEntrada: c.tokensEntrada, tokensSalida: c.tokensSalida, costoClaudeUsd: c.costoUsd });
}

/** "Mejorar esta foto con IA": la misma mejora de la ficha de la casa, solo para la foto elegida. */
export async function mejorarFotoRedes(propiedadId: unknown, url: unknown): Promise<Resultado<{ url: string }>> {
  const r = await casaPropia(propiedadId);
  if (!r) return { ok: false, motivo: NO_ES_TUYA };
  const opcion = r.opciones.find((o) => o.url === url);
  if (!opcion) return { ok: false, motivo: "No encontré esa foto en la casa." };
  if (opcion.ilustrativa) return { ok: false, motivo: "Esta es una imagen ilustrativa. Elige la foto original para mejorarla." };
  if (opcion.tipo === "mejorada") return { ok: true, url: opcion.url };
  const yaMejorada = r.opciones.find((o) => o.tipo === "mejorada" && o.original === opcion.original);
  if (yaMejorada) return { ok: true, url: yaMejorada.url };

  const deps = dependenciasPara(r.corredor);
  // Mismas reglas que las demás imágenes con IA: configuradas, permitidas a la cuenta, no en la demo y dentro del tope.
  const bloqueo = await puedeUsarImagenes(deps, r.corredor);
  if (bloqueo) return { ok: false, motivo: bloqueo };
  try {
    const m = await mejorarFotos(deps, r.corredor, r.casa.codigo, async () => {}, opcion.original);
    revalidatePath(`/panel/propiedades/${r.casa.id}`);
    const nueva = m.mejoradas[0];
    return nueva ? { ok: true, url: nueva.url } : { ok: false, motivo: m.mensajes[0] ?? "No pude mejorar la foto ahora. Inténtalo de nuevo en un rato." };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_foto_redes", corredorId: r.corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude mejorar la foto ahora. Inténtalo de nuevo en un rato." };
  }
}

/** Botones de IA del texto: mejorarlo, más corto, más vendedor o en inglés. */
export async function mejorarTextoRedes(propiedadId: unknown, texto: unknown, modo: unknown): Promise<Resultado<{ texto: string; aviso: string | null }>> {
  const r = await casaPropia(propiedadId);
  if (!r) return { ok: false, motivo: NO_ES_TUYA };
  if (!esModoTexto(modo)) return { ok: false, motivo: "No entendí qué quieres hacer con el texto." };
  const anterior = String(texto ?? "").trim();
  if (!anterior) return { ok: false, motivo: "Primero escribe algo en el texto (o toca «Volver al original»)." };
  if (anterior.length > MAX_TEXTO_REDES) return { ok: false, motivo: `El texto es muy largo: déjalo en menos de ${MAX_TEXTO_REDES.toLocaleString("es-CR")} letras.` };

  // La cuenta de demo no gasta IA de verdad.
  if (r.corredor.activo === false) return { ok: true, texto: textoDemo(modo, anterior), aviso: "En la demostración el texto no lo escribe la IA de verdad." };
  const deps = dependenciasPara(r.corredor);
  if (!(await hayPresupuestoHoy(deps.repo, r.corredor))) return { ok: false, motivo: SIN_PRESUPUESTO };

  const ficha = fichaPropiedades([r.casa]);
  try {
    const propuesto = await deps.cerebro.textoRedes(r.corredor, ficha, anterior, modo);
    // Ya se pagó: suma aunque después se descarte.
    await sumarConsumo(deps.repo, r.corredor.id, propuesto.consumo);
    const revisado = revisarTextoIA(propuesto.texto, { ficha, anterior, casa: r.casa, contacto: contactoDe(r.corredor), modo });
    if (!revisado.ok) return revisado;
    return {
      ok: true,
      texto: revisado.texto,
      aviso: revisado.repuesto.length ? `La IA había quitado ${revisado.repuesto.join(" y ")}: lo volví a poner al final.` : null,
    };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_texto_redes", corredorId: r.corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude mejorar el texto ahora. Inténtalo de nuevo en un rato." };
  }
}

/**
 * "Proponer guion con IA" del video: el orden de las fotos elegidas y un texto corto por foto. Las fotos
 * llegan por URL desde el navegador y solo se aceptan las de esta casa.
 */
export async function proponerGuionVideo(
  propiedadId: unknown,
  urls: unknown,
): Promise<Resultado<{ escenas: { url: string; texto: string }[]; aviso: string | null }>> {
  const r = await casaPropia(propiedadId);
  if (!r) return { ok: false, motivo: NO_ES_TUYA };
  const pedidas = (Array.isArray(urls) ? urls : []).filter((u): u is string => typeof u === "string");
  const fotos: FotoParaGuion[] = [...new Set(pedidas)]
    .map((u) => r.opciones.find((o) => o.url === u))
    .filter((o): o is NonNullable<typeof o> => !!o)
    .slice(0, MAX_FOTOS_VIDEO)
    .map((o, i) => ({ id: `F${i + 1}`, url: o.url, nombre: o.nombre, ilustrativa: o.ilustrativa }));
  if (fotos.length === 0) return { ok: false, motivo: "Elige al menos una foto de la casa para el video." };

  if (r.corredor.activo === false) {
    return { ok: true, escenas: guionDemo(fotos), aviso: "En la demostración el guion no lo propone la IA de verdad." };
  }
  const deps = dependenciasPara(r.corredor);
  if (!(await hayPresupuestoHoy(deps.repo, r.corredor))) return { ok: false, motivo: SIN_PRESUPUESTO };

  const ficha = fichaPropiedades([r.casa]);
  try {
    // Las fotos del bucket propio se le muestran al modelo (por su dirección) para que elija mejor el orden.
    const g = await deps.cerebro.guionVideo(r.corredor, ficha, fotos, true);
    await sumarConsumo(deps.repo, r.corredor.id, g.consumo);
    const permitidas = cifrasPermitidas(ficha, precioCasa(r.casa), lineaContacto(r.casa, contactoDe(r.corredor)));
    const revisado = revisarGuion(g, fotos, permitidas);
    if (!revisado.ok) return revisado;
    return {
      ok: true,
      escenas: revisado.escenas,
      aviso: revisado.quitados ? `Quité ${revisado.quitados === 1 ? "un texto que traía" : `${revisado.quitados} textos que traían`} cifras que no están en la ficha.` : null,
    };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_guion_redes", corredorId: r.corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude proponer el guion ahora. Arma el video a mano o inténtalo de nuevo en un rato." };
  }
}

// --- "Pídeselo a …": el chat del estudio ---------------------------------------------------------------
// El pedido del corredor va al modelo como dato (recortado a 500 caracteres) y el modelo devuelve operaciones;
// aquí se validan contra la casa y lo de ahora, y el navegador las aplica (con "Deshacer"). Nada del contenido
// del pedido va a los registros.

const PEDIDOS_POR_MINUTO = 6;
const MUCHOS_PEDIDOS = "Vas muy rápido: espera un minuto y vuelve a pedírmelo.";
const SIN_ENTENDER = "No te entendí. Dímelo con otras palabras, por ejemplo con el número de la escena o de la foto.";

/** Hasta 6 pedidos por minuto y corredor (con reclamar_alerta, atómico en la base). */
async function hayTurnoChat(corredorId: string): Promise<boolean> {
  try {
    const db = createAdminClient();
    for (let i = 0; i < PEDIDOS_POR_MINUTO; i++) {
      const { data, error } = await db.rpc("reclamar_alerta", { p_clave: `redes_chat:${corredorId}:${i}`, p_minutos: 1 });
      if (error) throw new Error(error.message);
      if (data === true) return true;
    }
    return false;
  } catch (e) {
    // Si la base no responde, no se frena (los topes de gasto siguen frenando).
    console.error(JSON.stringify({ evento: "error_freno_chat_redes", corredorId, error: errorSeguro(e) }));
    return true;
  }
}

const TIPOS_ESCENA = new Set<Escena["tipo"]>(["portada", "foto", "datos", "cierre"]);

/** El video que manda el navegador: solo escenas válidas y fotos de esta casa (la marca ilustrativa sale de la casa). */
function leerEstadoVideo(crudo: unknown, opciones: OpcionFoto[]): EstadoVideo | null {
  const c = crudo as { escenas?: unknown; estilo?: unknown; formato?: unknown } | null;
  if (!c || !Array.isArray(c.escenas) || c.escenas.length === 0 || c.escenas.length > MAX_FOTOS_VIDEO + 4) return null;
  const porUrl = new Map(opciones.map((o) => [o.url, o]));
  const escenas: Escena[] = [];
  for (const e of c.escenas as Record<string, unknown>[]) {
    const tipo = e?.tipo as Escena["tipo"];
    if (!TIPOS_ESCENA.has(tipo) || typeof e.id !== "string" || e.id.length > 40) return null;
    const url = (e.foto as { url?: unknown } | undefined)?.url;
    const opcion = typeof url === "string" ? porUrl.get(url) : undefined;
    if ((tipo === "portada" || tipo === "foto") && !opcion) return null;
    const duracion = Number(e.duracion);
    escenas.push({
      id: e.id,
      tipo,
      ...(opcion ? { foto: { url: opcion.url, ilustrativa: opcion.ilustrativa } } : {}),
      texto: String(e.texto ?? "").slice(0, MAX_TEXTO_ESCENA),
      duracion: Number.isFinite(duracion) ? duracion : 3,
    });
  }
  const estilo = ESTILOS_LISTA.includes(c.estilo as EstiloVideo) ? (c.estilo as EstiloVideo) : null;
  const formato = typeof c.formato === "string" && c.formato in FORMATOS_VIDEO ? (c.formato as FormatoVideo) : null;
  if (!estilo || !formato) return null;
  return { escenas, estilo, formato };
}

type Interpretado = { respuesta: string; operaciones: OperacionCruda[]; edicion?: { permitido: boolean; razon: string | null } | null };

/** Demo: lo entiende el código. Si no: tope de gasto, Claude y su costo. */
async function interpretar(
  r: NonNullable<Awaited<ReturnType<typeof casaPropia>>>,
  pestana: "video" | "imagen",
  estado: string,
  pedido: string,
  historial: unknown,
  escenas?: Escena[],
): Promise<{ ok: true; i: Interpretado } | { ok: false; motivo: string }> {
  if (r.corredor.activo === false) return { ok: true, i: interpretarDemo(pestana, pedido, { escenas }) };
  const deps = dependenciasPara(r.corredor);
  if (!deps.cerebro.chatRedes) return { ok: false, motivo: "Esto todavía no está disponible." };
  if (!(await hayPresupuestoHoy(deps.repo, r.corredor))) return { ok: false, motivo: SIN_PRESUPUESTO };
  const fotos = fotosParaChat(r.opciones);
  const i = await deps.cerebro.chatRedes(
    r.corredor,
    { pestana, ficha: fichaPropiedades([r.casa]), estado, fotos: fotos.map((f) => ({ id: f.id, nombre: f.nombre, url: f.url, ilustrativa: f.ilustrativa })), historial: historialValido(historial), pedido },
    true,
  );
  await sumarConsumo(deps.repo, r.corredor.id, i.consumo);
  return { ok: true, i };
}

/** Pestaña Video: el pedido se vuelve operaciones validadas (el navegador las aplica sobre el video de ahora). */
export async function pedirVideoRedes(
  propiedadId: unknown,
  estadoCrudo: unknown,
  pedidoCrudo: unknown,
  historial: unknown,
): Promise<Resultado<{ respuesta: string; ops: OperacionVideo[]; hechos: string[] }>> {
  const r = await casaPropia(propiedadId);
  if (!r) return { ok: false, motivo: NO_ES_TUYA };
  const pedido = limpiarPedido(pedidoCrudo);
  if (!pedido) return { ok: false, motivo: "Escríbeme qué quieres cambiar del video." };
  const estado = leerEstadoVideo(estadoCrudo, r.opciones);
  if (!estado) return { ok: false, motivo: "No pude leer el video. Toca «Empezar de nuevo» y vuelve a pedírmelo." };
  if (!(await hayTurnoChat(r.corredor.id))) return { ok: false, motivo: MUCHOS_PEDIDOS };

  const fotos = fotosParaChat(r.opciones);
  try {
    const x = await interpretar(r, "video", resumenVideo(estado, fotos), pedido, historial, estado.escenas);
    if (!x.ok) return x;
    const permitidas = cifrasPermitidas(fichaPropiedades([r.casa]), precioCasa(r.casa), lineaContacto(r.casa, contactoDe(r.corredor)), r.casa.titulo);
    const n = normalizarVideo(x.i.operaciones, estado, fotos, permitidas);
    const reales = mejoresReales(r.opciones).map((o) => ({ url: o.url, ilustrativa: o.ilustrativa }));
    const { hechos } = aplicarVideo(estado, n.ops, { porDefecto: () => guionPorDefecto(reales, { titulo: r.casa.titulo }) });
    const notas = [
      n.conCifras ? "No puse un texto porque traía un número que no está en la ficha." : null,
      n.ignoradas && hechos.length ? "Una parte no la pude hacer." : null,
    ].filter((t): t is string => !!t);
    const respuesta = hechos.length || !n.ignoradas ? x.i.respuesta || "Listo." : SIN_ENTENDER;
    return { ok: true, respuesta: [respuesta, ...notas].join(" "), ops: n.ops, hechos };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_chat_video_redes", corredorId: r.corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude hacerlo ahora. Inténtalo de nuevo en un rato o cámbialo a mano." };
  }
}

/**
 * Pestaña Imagen: elegir la foto, mejorarla, quitar cosas sueltas o amueblar. Lo que cambiaría la casa o taparía
 * un daño se niega aquí, en código, antes de gastar en Claude y en OpenAI. Las ediciones con IA no se hacen en este
 * paso: vuelven para que el corredor confirme («Esto usa IA de imágenes. ¿Hacerlo?») y entonces va
 * `editarFotoRedes` o `mejorarFotoRedes`.
 */
export async function pedirImagenRedes(
  propiedadId: unknown,
  elegidaCruda: unknown,
  pedidoCrudo: unknown,
  historial: unknown,
): Promise<Resultado<{ respuesta: string; ops: OperacionImagen[]; bloqueo: string | null }>> {
  const r = await casaPropia(propiedadId);
  if (!r) return { ok: false, motivo: NO_ES_TUYA };
  const pedido = limpiarPedido(pedidoCrudo);
  if (!pedido) return { ok: false, motivo: "Escríbeme qué quieres hacer con la imagen." };
  const veto = vetoImagen(pedido);
  if (veto) return { ok: true, respuesta: veto, ops: [], bloqueo: null };
  if (!(await hayTurnoChat(r.corredor.id))) return { ok: false, motivo: MUCHOS_PEDIDOS };

  const fotos = fotosParaChat(r.opciones);
  const elegida = fotos.find((f) => f.url === elegidaCruda) ?? fotos[0] ?? null;
  const estado = elegida ? `Foto elegida ahora: ${elegida.id} (${elegida.nombre}${elegida.ilustrativa ? ", ilustrativa" : ""}).` : "Ninguna foto elegida.";
  try {
    const x = await interpretar(r, "imagen", estado, pedido, historial);
    if (!x.ok) return x;
    // Si el modelo dice que no se puede, solo queda elegir foto (nada de IA de imágenes).
    const negadaPorModelo = x.i.edicion && x.i.edicion.permitido === false;
    const crudas = negadaPorModelo ? x.i.operaciones.filter((o) => o.op === "elegir_foto") : x.i.operaciones;
    const n = normalizarImagen(crudas, fotos, elegida?.url ?? null, pedido);
    const negada = n.negada ?? (negadaPorModelo ? x.i.respuesta || "Eso no lo puedo hacer con IA: solo quito cosas sueltas o pongo muebles." : null);
    const costosa = n.ops.find(esCostosa);
    let bloqueo: string | null = null;
    if (costosa) {
      bloqueo = costosa.op === "mejorar_foto" && r.corredor.activo === false ? "En la demostración no se mejoran fotos." : await puedeUsarImagenes(dependenciasPara(r.corredor), r.corredor);
    }
    const respuesta = negada ?? (n.ops.length || !n.ignoradas ? x.i.respuesta || "Listo." : SIN_ENTENDER);
    return { ok: true, respuesta, ops: bloqueo ? n.ops.filter((o) => !esCostosa(o)) : n.ops, bloqueo };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_chat_imagen_redes", corredorId: r.corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude hacerlo ahora. Inténtalo de nuevo en un rato." };
  }
}

/** Después del «Sí»: quitar cosas sueltas o amueblar, como variante ilustrativa (la original no se toca). */
export async function editarFotoRedes(
  propiedadId: unknown,
  url: unknown,
  pedido: unknown,
): Promise<Resultado<{ url: string }>> {
  const r = await casaPropia(propiedadId);
  if (!r) return { ok: false, motivo: NO_ES_TUYA };
  const opcion = r.opciones.find((o) => o.url === url && o.tipo === "original");
  if (!opcion) return { ok: false, motivo: "No encontré esa foto en la casa." };
  const p = pedido as { tipo?: unknown; que?: unknown; estilo?: unknown; cuarto?: unknown } | null;
  const que = String(p?.que ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  const cuarto = String(p?.cuarto ?? "").replace(/\s+/g, " ").trim().slice(0, 60);
  let variante: Parameters<typeof crearVariante>[5];
  if (p?.tipo === "quitar_objetos") {
    if (!que) return { ok: false, motivo: "Dime qué quieres quitar de la foto." };
    const veto = vetoImagen(`quita ${que}`);
    if (veto) return { ok: false, motivo: veto };
    variante = { tipo: "limpia", queQuitar: que };
  } else if (p?.tipo === "amueblar") {
    if (typeof p.estilo !== "string" || !(p.estilo in ESTILOS)) return { ok: false, motivo: "Elige un estilo de muebles." };
    const veto = cuarto ? vetoImagen(cuarto) : null;
    if (veto) return { ok: false, motivo: veto };
    variante = { tipo: "amueblada", estilo: p.estilo as keyof typeof ESTILOS, ...(cuarto ? { cuarto } : {}) };
  } else return { ok: false, motivo: "No entendí qué hacer con la foto." };

  const deps = dependenciasPara(r.corredor);
  try {
    const v = await crearVariante(deps, r.corredor, r.casa.id, r.casa.fotos ?? [], opcion.url, variante);
    if (v.ok) revalidatePath(`/panel/propiedades/${r.casa.id}`);
    return v;
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_variante_redes", corredorId: r.corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude hacer la imagen ahora. Inténtalo de nuevo en un rato." };
  }
}

/**
 * Pestaña Texto: reescribe según lo que pide el corredor. Mismas revisiones que los botones; además, las cifras que
 * él mismo escribió en el pedido («tiene 2 parqueos») se aceptan, y ninguna otra.
 */
export async function pedirTextoRedes(
  propiedadId: unknown,
  textoCrudo: unknown,
  pedidoCrudo: unknown,
  historial: unknown,
): Promise<Resultado<{ respuesta: string; texto: string }>> {
  const r = await casaPropia(propiedadId);
  if (!r) return { ok: false, motivo: NO_ES_TUYA };
  const pedido = limpiarPedido(pedidoCrudo);
  if (!pedido) return { ok: false, motivo: "Escríbeme qué quieres cambiar del texto." };
  const anterior = String(textoCrudo ?? "").trim();
  if (!anterior) return { ok: false, motivo: "Primero escribe algo en el texto (o toca «Volver al original»)." };
  if (anterior.length > MAX_TEXTO_REDES) return { ok: false, motivo: `El texto es muy largo: déjalo en menos de ${MAX_TEXTO_REDES.toLocaleString("es-CR")} letras.` };
  if (!(await hayTurnoChat(r.corredor.id))) return { ok: false, motivo: MUCHOS_PEDIDOS };

  if (r.corredor.activo === false) {
    return { ok: true, respuesta: "(Demostración) Aquí la IA reescribiría el texto como me pediste.", texto: textoDemo("mejorar", anterior) };
  }
  const deps = dependenciasPara(r.corredor);
  if (!deps.cerebro.textoRedesPedido) return { ok: false, motivo: "Esto todavía no está disponible." };
  if (!(await hayPresupuestoHoy(deps.repo, r.corredor))) return { ok: false, motivo: SIN_PRESUPUESTO };
  const ficha = fichaPropiedades([r.casa]);
  try {
    const propuesto = await deps.cerebro.textoRedesPedido(r.corredor, ficha, anterior, pedido, historialValido(historial));
    await sumarConsumo(deps.repo, r.corredor.id, propuesto.consumo);
    const ingles = /ingl[eé]s|english/i.test(pedido);
    const revisado = revisarTextoIA(propuesto.texto, { ficha, anterior, casa: r.casa, contacto: contactoDe(r.corredor), modo: ingles ? "ingles" : "mejorar", dichoPorCorredor: pedido });
    if (!revisado.ok) return revisado;
    const repuesto = revisado.repuesto.length ? ` La IA había quitado ${revisado.repuesto.join(" y ")}: lo volví a poner al final.` : "";
    return { ok: true, respuesta: `${propuesto.respuesta || "Listo."}${repuesto}`, texto: revisado.texto };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_chat_texto_redes", corredorId: r.corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude cambiar el texto ahora. Inténtalo de nuevo en un rato." };
  }
}
