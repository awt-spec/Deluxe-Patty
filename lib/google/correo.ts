import type { SupabaseClient } from "@supabase/supabase-js";
import type { Cerebro } from "../asistente/cerebro";
import { hayPresupuestoHoy } from "../asistente/limites";
import { fusionarBusca, type Busca } from "../crm/perfil";
import type { Repositorio } from "../datos/repositorio";
import type { Corredor } from "../datos/tipos";
import { errorSeguro } from "../monitoreo/errores";
import { normalizarTelefono } from "../panel/formularios";
import { anotarError, type ConexionGoogle } from "./conexion";
import { armarCorreo, correosNuevos, crearBorrador, leerCorreo, type Correo } from "./google";

// La asistente revisa el Gmail del corredor: si un correo es de un cliente, lo anota en el CRM (o
// completa su ficha) y deja una respuesta como borrador en el mismo hilo, para que el corredor la revise
// y la mande desde Gmail. Nunca manda sola un correo a un cliente. Lo que no es de clientes se ignora.
// No se guarda el contenido de los correos: solo de quién, el asunto y una frase de resumen.

export interface DependenciasCorreo {
  db: SupabaseClient;
  repo: Pick<Repositorio, "propiedadesActivas" | "correccionesRecientes" | "conocimientoActivo" | "registrarUso" | "costoClaudeDelDia">;
  cerebro: Pick<Cerebro, "clasificarCorreo" | "responder">;
}

export interface ResumenCorreos {
  revisados: number;
  clientes: number;
  borradores: number;
  fallidos: number;
}

const DIA = 24 * 60 * 60_000;

export async function procesarCorreos(d: DependenciasCorreo, corredor: Corredor, conexion: ConexionGoogle, ahora = new Date()): Promise<ResumenCorreos> {
  const r: ResumenCorreos = { revisados: 0, clientes: 0, borradores: 0, fallidos: 0 };
  const acceso = await conexion.acceso();
  // La primera vez, solo lo del último día (no se contestan correos viejos).
  const desde = conexion.correoLeidoHasta ?? ahora.getTime() - DIA;
  const ids = await correosNuevos(acceso, desde);
  if (ids.length === 0) return r;

  const { data: vistos } = await d.db.from("correos_procesados").select("gmail_id").eq("corredor_id", corredor.id).in("gmail_id", ids);
  const yaVistos = new Set((vistos ?? []).map((v) => v.gmail_id as string));
  let hasta = desde;

  // Del más viejo al más nuevo, para que "leído hasta" avance en orden.
  for (const id of ids.filter((i) => !yaVistos.has(i)).reverse()) {
    if (!(await hayPresupuestoHoy(d.repo, corredor, ahora))) break;
    try {
      const correo = await leerCorreo(acceso, id);
      hasta = Math.max(hasta, correo.recibido);
      if (correo.correoDe === conexion.correo.toLowerCase()) continue;
      r.revisados++;
      const hecho = await procesarUno(d, corredor, acceso, correo);
      if (hecho.cliente) r.clientes++;
      if (hecho.borrador) r.borradores++;
    } catch (e) {
      r.fallidos++;
      await anotarError(d.db, corredor.id, errorSeguro(e));
    }
  }
  if (hasta > desde) {
    await d.db.from("google_conexiones").update({ correo_leido_hasta: hasta }).eq("corredor_id", corredor.id);
  }
  return r;
}

async function procesarUno(d: DependenciasCorreo, corredor: Corredor, acceso: string, correo: Correo) {
  const c = await d.cerebro.clasificarCorreo(corredor, correo);
  await d.repo.registrarUso(corredor.id, {
    llamadasClaude: 1,
    tokensEntrada: c.consumo.tokensEntrada,
    tokensSalida: c.consumo.tokensSalida,
    costoClaudeUsd: c.consumo.costoUsd,
  });
  const fila = {
    corredor_id: corredor.id,
    gmail_id: correo.id,
    hilo_id: correo.hilo,
    remitente: correo.correoDe.slice(0, 200),
    asunto: correo.asunto.slice(0, 300) || null,
    resumen: c.resumen || null,
  };
  if (!c.esCliente) {
    await d.db.from("correos_procesados").upsert({ ...fila, tipo: "otro" });
    return { cliente: false, borrador: false };
  }

  const correoCliente = c.correo ?? correo.correoDe;
  const contactoId = await anotarCliente(d.db, corredor.id, {
    telefono: c.telefono ? normalizarTelefono(c.telefono) : null,
    nombre: c.nombre,
    correo: correoCliente,
    busca: c.busca,
  });

  // La respuesta la redacta la misma asistente de WhatsApp, con las casas y lo que el corredor le enseñó.
  const [propiedades, correcciones, conocimiento] = await Promise.all([
    d.repo.propiedadesActivas(corredor.id),
    d.repo.correccionesRecientes(corredor.id, 8).catch(() => []),
    d.repo.conocimientoActivo(corredor.id, 60).catch(() => []),
  ]);
  const pedido =
    `(Este cliente escribió por correo electrónico. Contesta como un correo breve, con saludo y despedida firmada por ${corredor.nombre_contacto}.` +
    (c.telefono ? "" : " Pídele su número de WhatsApp para coordinar más rápido.") +
    `)\n\nAsunto: ${correo.asunto}\n\n${correo.texto.slice(0, 4000)}`;
  const respuesta = await d.cerebro.responder(corredor, propiedades, [], pedido, correcciones, conocimiento);
  await d.repo.registrarUso(corredor.id, {
    llamadasClaude: 1,
    tokensEntrada: respuesta.consumo.tokensEntrada,
    tokensSalida: respuesta.consumo.tokensSalida,
    costoClaudeUsd: respuesta.consumo.costoUsd,
  });
  const asunto = /^re:/i.test(correo.asunto) ? correo.asunto : `Re: ${correo.asunto || "Su consulta"}`;
  await crearBorrador(acceso, correo.hilo, armarCorreo({ para: correoCliente, asunto, texto: respuesta.texto, enRespuestaA: correo.messageId }));
  await d.db.from("correos_procesados").upsert({ ...fila, tipo: "cliente", contacto_id: contactoId, borrador: true });
  return { cliente: true, borrador: true };
}

/**
 * El cliente en el CRM: por teléfono (o, sin teléfono, por correo si ya existía). Sin teléfono y sin
 * ficha previa no se crea (el CRM necesita el número); queda el borrador que se lo pide.
 */
async function anotarCliente(
  db: SupabaseClient,
  corredorId: string,
  c: { telefono: string | null; nombre: string | null; correo: string; busca: Busca },
): Promise<string | null> {
  type Existente = { id: string; nombre: string | null; email: string | null; busca: Busca; etapa: string };
  let existente = null as Existente | null;
  const columnas = "id, nombre, email, busca, etapa";
  if (c.telefono) {
    const { data } = await db.from("contactos").select(columnas).eq("corredor_id", corredorId).eq("telefono", c.telefono).maybeSingle();
    existente = data as Existente | null;
  }
  if (!existente) {
    const { data } = await db.from("contactos").select(columnas).eq("corredor_id", corredorId).eq("email", c.correo).limit(1).maybeSingle();
    existente = data as Existente | null;
  }
  if (existente) {
    await db
      .from("contactos")
      .update({
        nombre: existente.nombre ?? c.nombre,
        email: existente.email ?? c.correo,
        busca: fusionarBusca(existente.busca ?? {}, c.busca),
        ...(existente.etapa === "nuevo" ? { etapa: "interesado", etapa_at: new Date().toISOString() } : {}),
      })
      .eq("corredor_id", corredorId)
      .eq("id", existente.id);
    return existente.id;
  }
  if (!c.telefono) return null;
  const { data, error } = await db
    .from("contactos")
    .insert({
      corredor_id: corredorId,
      telefono: c.telefono,
      nombre: c.nombre,
      email: c.correo,
      origen: "correo",
      busca: c.busca,
      etapa: "interesado",
    })
    .select("id")
    .single();
  if (error) throw new Error(`contacto_correo_${error.code}`);
  return data.id as string;
}
