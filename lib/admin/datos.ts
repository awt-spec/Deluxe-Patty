import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

// Datos que comparten las pantallas de /admin: corredores con su uso de IA, mensajes y conexión. Lee con el
// backend (service_role): solo lo llaman páginas que ya comprobaron que quien mira es superadministrador.

export interface CorredorAdmin {
  id: string;
  slug: string;
  nombre: string;
  nombre_contacto: string;
  activo: boolean;
  zona_horaria: string;
  tope_mensajes_mes: number;
  aviso_mensajes_mes: number;
  respuesta_automatica: boolean;
  whatsapp_numero: string | null;
  whatsapp_phone_number_id: string | null;
  whatsapp_corredor: string | null;
  tope_ia_dia_usd: number | null;
  tope_ia_mes_usd: number | null;
  imagenes_activas: boolean;
}

export interface UsoIA {
  costoClaude: number;
  costoImagenes: number;
  imagenes: number;
  llamadas: number;
}

export interface FilaAdmin {
  c: CorredorAdmin;
  hoy: UsoIA;
  mes: UsoIA;
  mensajesMes: number;
  gastoHoy: number;
  gastoMes: number;
  topeDia: number;
  topeMes: number;
  /** Mensajes de clientes que entraron en las últimas 24 horas y cuándo entró el último. */
  entrantes24h: number;
  ultimoEntrante: string | null;
}

const fechaEn = (zona: string, d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: zona }).format(d);

export async function cargarPlataforma(db: SupabaseClient) {
  const { data } = await db.from("plataforma").select("tope_ia_dia_usd, tope_ia_mes_usd, updated_at").eq("id", true).maybeSingle();
  return {
    topeDia: Number(data?.tope_ia_dia_usd ?? 10),
    topeMes: Number(data?.tope_ia_mes_usd ?? 150),
    actualizado: (data?.updated_at as string | undefined) ?? null,
  };
}

export const COLUMNAS_ADMIN =
  "id, slug, nombre, nombre_contacto, activo, zona_horaria, tope_mensajes_mes, aviso_mensajes_mes, respuesta_automatica, whatsapp_numero, whatsapp_phone_number_id, whatsapp_corredor, tope_ia_dia_usd, tope_ia_mes_usd, imagenes_activas";

export async function cargarCorredores(db: SupabaseClient, soloId?: string): Promise<{ filas: FilaAdmin[]; plataforma: Awaited<ReturnType<typeof cargarPlataforma>> }> {
  const plataforma = await cargarPlataforma(db);
  const consulta = db.from("corredores").select(COLUMNAS_ADMIN).order("activo", { ascending: false }).order("nombre");
  const { data } = soloId ? await consulta.eq("id", soloId) : await consulta;
  const corredores = (data ?? []) as CorredorAdmin[];

  // Uso de hoy y del mes en la fecha local de cada corredor (la misma que usan los topes).
  const dias = [...new Set(corredores.map((c) => fechaEn(c.zona_horaria)))];
  const meses = [...new Set(dias.map((d) => `${d.slice(0, 7)}-01`))];
  const [{ data: hoyData }, { data: mesData }] = await Promise.all([
    db.from("uso_diario").select("corredor_id, dia, costo_claude_usd, costo_imagenes_usd, imagenes, llamadas_claude").in("dia", dias.length ? dias : ["1900-01-01"]),
    db.from("uso_mensual").select("corredor_id, mes, mensajes_total, costo_claude_usd, costo_imagenes_usd, imagenes, llamadas_claude").in("mes", meses.length ? meses : ["1900-01-01"]),
  ]);
  type FilaUso = Record<string, unknown>;
  const usoDe = (filas: FilaUso[] | null, c: CorredorAdmin, clave: "dia" | "mes") => {
    const hoy = fechaEn(c.zona_horaria);
    const buscado = clave === "dia" ? hoy : `${hoy.slice(0, 7)}-01`;
    const f = (filas ?? []).find((x) => x.corredor_id === c.id && x[clave] === buscado);
    const uso: UsoIA = {
      costoClaude: Number(f?.costo_claude_usd ?? 0),
      costoImagenes: Number(f?.costo_imagenes_usd ?? 0),
      imagenes: Number(f?.imagenes ?? 0),
      llamadas: Number(f?.llamadas_claude ?? 0),
    };
    return { uso, mensajes: Number(f?.mensajes_total ?? 0) };
  };

  const desde = new Date(Date.now() - 24 * 3600_000).toISOString();
  const filas = await Promise.all(
    corredores.map(async (c): Promise<FilaAdmin> => {
      const hoy = usoDe(hoyData as FilaUso[] | null, c, "dia").uso;
      const mes = usoDe(mesData as FilaUso[] | null, c, "mes");
      const [{ count }, { data: ultimo }] = await Promise.all([
        db.from("mensajes").select("id", { count: "exact", head: true }).eq("corredor_id", c.id).eq("direccion", "entrante").gte("created_at", desde),
        db.from("mensajes").select("created_at").eq("corredor_id", c.id).eq("direccion", "entrante").order("created_at", { ascending: false }).limit(1),
      ]);
      return {
        c,
        hoy,
        mes: mes.uso,
        mensajesMes: mes.mensajes,
        gastoHoy: hoy.costoClaude + hoy.costoImagenes,
        gastoMes: mes.uso.costoClaude + mes.uso.costoImagenes,
        topeDia: c.tope_ia_dia_usd ?? plataforma.topeDia,
        topeMes: c.tope_ia_mes_usd ?? plataforma.topeMes,
        entrantes24h: count ?? 0,
        ultimoEntrante: (ultimo?.[0]?.created_at as string | undefined) ?? null,
      };
    }),
  );
  return { filas, plataforma };
}

/** Qué llaves de WhatsApp están puestas en el servidor (solo si existen, nunca su valor). */
export function llavesWhatsApp() {
  return {
    token: !!process.env.WHATSAPP_ACCESS_TOKEN,
    secreto: !!process.env.WHATSAPP_APP_SECRET,
    verificacion: !!process.env.WHATSAPP_VERIFY_TOKEN,
    urlApp: !!process.env.NEXT_PUBLIC_URL_APP,
    soporte: !!process.env.SOPORTE_WHATSAPP && !!process.env.SOPORTE_PHONE_NUMBER_ID,
  };
}
