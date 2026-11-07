import type { SupabaseClient } from "@supabase/supabase-js";
import type { Dependencias } from "../asistente/procesar";
import { armarPlan, datosDelPlan, fechaDelPlan } from "../asistente/plan";
import { minutosDe, minutosLocales } from "../agenda/tiempo";
import { COLUMNAS_CORREDOR } from "../datos/repositorio";
import type { Corredor } from "../datos/tipos";
import { errorSeguro } from "../monitoreo/errores";
import { sincronizarVisitas } from "./calendario";
import { conexionDe, type ConexionGoogle } from "./conexion";
import { procesarCorreos } from "./correo";
import { armarCorreo, enviarCorreo } from "./google";

// Lo que la asistente hace con Google cada 15 minutos para cada corredor activo que lo conectó:
// visitas al calendario, correos de clientes y, a su hora, el resumen del día por correo.

export interface ResumenGoogle {
  corredores: number;
  visitas: number;
  correos: number;
  borradores: number;
  resumenes: number;
  fallidos: number;
}

export async function tareasGoogle(deps: Dependencias, db: SupabaseClient, ahora = new Date()): Promise<ResumenGoogle> {
  const r: ResumenGoogle = { corredores: 0, visitas: 0, correos: 0, borradores: 0, resumenes: 0, fallidos: 0 };
  const { data: conectados } = await db.from("google_conexiones").select("corredor_id");
  const ids = (conectados ?? []).map((c) => c.corredor_id as string);
  if (ids.length === 0) return r;
  const { data } = await db.from("corredores").select(COLUMNAS_CORREDOR).eq("activo", true).in("id", ids);
  const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));

  for (const corredor of (data ?? []) as unknown as Corredor[]) {
    const conexion = await conexionDe(db, corredor.id);
    if (!conexion) continue;
    r.corredores++;
    try {
      const v = await sincronizarVisitas(db, conexion, corredor);
      r.visitas += v.creados + v.actualizados + v.borrados;
      r.fallidos += v.fallidos;
    } catch (e) {
      r.fallidos++;
      log("error_google_calendario", { corredorId: corredor.id, error: errorSeguro(e) });
    }
    try {
      const c = await procesarCorreos({ db, repo: deps.repo, cerebro: deps.cerebro }, corredor, conexion, ahora);
      r.correos += c.revisados;
      r.borradores += c.borradores;
      r.fallidos += c.fallidos;
    } catch (e) {
      r.fallidos++;
      log("error_google_correo", { corredorId: corredor.id, error: errorSeguro(e) });
    }
    try {
      if (await mandarResumen(deps, db, corredor, conexion, ahora)) r.resumenes++;
    } catch (e) {
      r.fallidos++;
      log("error_google_resumen", { corredorId: corredor.id, error: errorSeguro(e) });
    }
  }
  return r;
}

/** A la hora del plan, el plan del día le llega por correo a su Gmail (una vez por día). */
export async function mandarResumen(
  deps: Pick<Dependencias, "repo">,
  db: SupabaseClient,
  corredor: Corredor,
  conexion: ConexionGoogle,
  ahora: Date,
): Promise<boolean> {
  if (minutosLocales(ahora, corredor.zona_horaria) < minutosDe(corredor.hora_plan_dia)) return false;
  const fecha = fechaDelPlan(corredor, ahora);
  const { data } = await db.from("google_conexiones").select("resumen_enviado_fecha").eq("corredor_id", corredor.id).maybeSingle();
  if (!data || data.resumen_enviado_fecha === fecha) return false;
  // Se marca antes de mandar: si dos tareas coinciden, solo una lo manda.
  const { data: marcada } = await db
    .from("google_conexiones")
    .update({ resumen_enviado_fecha: fecha })
    .eq("corredor_id", corredor.id)
    .or(`resumen_enviado_fecha.is.null,resumen_enviado_fecha.neq.${fecha}`)
    .select("corredor_id");
  if (!marcada?.length) return false;
  const texto = armarPlan(corredor, await datosDelPlan(deps, corredor, ahora), ahora);
  const url = process.env.NEXT_PUBLIC_URL_APP;
  await enviarCorreo(
    await conexion.acceso(),
    armarCorreo({
      para: conexion.correo,
      asunto: `Tu plan de hoy, ${corredor.nombre_contacto}`,
      texto: `${texto}${url ? `\n\nAbre tu panel: ${url}/panel` : ""}\n\n— Tu asistente`,
    }),
  );
  return true;
}

/** Después de cambiar una visita desde el panel: al calendario de Google sin esperar la tarea. */
export async function sincronizarAhora(db: SupabaseClient, corredor: Corredor) {
  const conexion = await conexionDe(db, corredor.id);
  if (conexion) await sincronizarVisitas(db, conexion, corredor).catch(() => null);
}
