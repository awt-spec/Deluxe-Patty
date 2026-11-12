import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { horaCorta, etiquetaHorario } from "../agenda/formato";
import { horariosLibres, type Intervalo } from "../agenda/disponibilidad";
import { fechaIso, fechaLocal } from "../agenda/tiempo";
import type { Dependencias } from "../asistente/contexto";
import { anotar } from "../crm/actividades";
import { COLUMNAS_CORREDOR } from "../datos/repositorio";
import type { Corredor, Foto, Propiedad } from "../datos/tipos";
import { crearVisita } from "../panel/visitas";
import { ordenarFotos } from "../panel/formularios";
import { errorSeguro } from "../monitoreo/errores";
import { CODIGO_SITIO } from "./importar";

// El sitio web público del corredor (hecho aparte, por ejemplo en Lovable) habla con el portal por aquí:
//  - las casas activas, con solo lo que se puede publicar (nunca notas, comisiones ni clientes);
//  - las horas libres de su agenda real (horario, bloqueos, visitas y traslados);
//  - pedir una visita: crea el cliente (si no existía) y la visita "por confirmar", y le avisa al corredor.
// El corredor se identifica por su slug. Nada de esto devuelve ni registra datos de otros clientes.

export type CasaPublica = {
  id: string;
  codigo: string;
  titulo: string;
  tipo: string;
  operacion: string;
  precio: number | null;
  moneda: string;
  provincia: string | null;
  canton: string | null;
  distrito: string | null;
  zona: string | null;
  habitaciones: number | null;
  banos: number | null;
  m2_construccion: number | null;
  m2_terreno: number | null;
  descripcion: string | null;
  amenidades: string[];
  fotos: string[];
  url_e24: string | null;
  /** Enlace de WhatsApp a la asistente con la referencia de la casa (null si el corredor no tiene número). */
  whatsapp: string | null;
};

const SLUG = /^[a-z0-9][a-z0-9-]{1,60}$/;
const ID = /^[0-9a-f-]{36}$/;

export async function corredorPorSlug(db: SupabaseClient, slug: string): Promise<Corredor | null> {
  if (!SLUG.test(slug)) return null;
  const { data } = await db.from("corredores").select(COLUMNAS_CORREDOR).eq("slug", slug).maybeSingle();
  return (data as Corredor | null) ?? null;
}

export function enlaceWhatsApp(numero: string | null, casa: { codigo: string; titulo: string }): string | null {
  const digitos = (numero ?? "").replace(/\D/g, "");
  if (digitos.length < 8) return null;
  // La referencia (el código) le dice a la asistente de qué casa le hablan.
  const texto = `Hola, me interesa la propiedad ${casa.codigo} (${casa.titulo}) que vi en su sitio web.`;
  return `https://wa.me/${digitos}?text=${encodeURIComponent(texto)}`;
}

/** Cuántas casas vinieron del sitio y siguen activas (para comprobar desde afuera que la importación corre). */
export async function cuentaImportadas(db: SupabaseClient, corredor: Corredor): Promise<number> {
  const { data } = await db.from("propiedades").select("codigo").eq("corredor_id", corredor.id).eq("estado", "activa").like("codigo", "DP-%").limit(1000);
  return ((data ?? []) as { codigo: string }[]).filter((p) => CODIGO_SITIO.test(p.codigo)).length;
}

export async function casasPublicas(db: SupabaseClient, corredor: Corredor): Promise<CasaPublica[]> {
  const { data } = await db
    .from("propiedades")
    .select(
      "id, codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno, descripcion, amenidades, url_e24, fotos",
    )
    .eq("corredor_id", corredor.id)
    .eq("estado", "activa")
    .order("created_at", { ascending: false })
    .limit(200);
  return ((data ?? []) as (Propiedad & { fotos: Foto[] })[])
    // Sin fotos no se publica: el sitio no muestra casas vacías. Las que vinieron del propio sitio (DP-XXXXXX) ya están
    // allá con su ficha completa: no se devuelven (si no, el sitio mostraría la copia en vez de la suya).
    .filter((p) => (p.fotos ?? []).length > 0 && !CODIGO_SITIO.test(p.codigo))
    .map((p) => ({
      id: p.id,
      codigo: p.codigo,
      titulo: p.titulo,
      tipo: p.tipo,
      operacion: p.operacion,
      precio: p.precio,
      moneda: p.moneda,
      provincia: p.provincia,
      canton: p.canton,
      distrito: p.distrito,
      zona: p.zona,
      habitaciones: p.habitaciones,
      banos: p.banos,
      m2_construccion: p.m2_construccion,
      m2_terreno: p.m2_terreno,
      descripcion: p.descripcion,
      amenidades: p.amenidades ?? [],
      // Solo las fotos originales: las mejoradas o con IA las revisa el corredor antes de publicarlas.
      fotos: ordenarFotos(p.fotos ?? []).map((f) => f.url),
      url_e24: p.url_e24,
      whatsapp: enlaceWhatsApp(corredor.whatsapp_numero, p),
    }));
}

async function zonaDeCasa(db: SupabaseClient, corredor: Corredor, casaId: string | null): Promise<{ id: string; titulo: string; zona: string | null } | null> {
  if (!casaId || !ID.test(casaId)) return null;
  const { data } = await db
    .from("propiedades")
    .select("id, titulo, zona, canton")
    .eq("corredor_id", corredor.id)
    .eq("id", casaId)
    .eq("estado", "activa")
    .maybeSingle();
  return data ? { id: data.id as string, titulo: data.titulo as string, zona: (data.zona as string | null) ?? (data.canton as string | null) } : null;
}

/** Horas libres de la agenda real, agrupadas por día (en la zona del corredor). */
export async function libresDe(deps: Dependencias, corredor: Corredor, zonaVisita: string | null, ahora = new Date()): Promise<Intervalo[]> {
  const hasta = new Date(ahora.getTime() + (corredor.horizonte_agenda_dias + 1) * 86_400_000);
  const datos = await deps.repo.datosAgenda(corredor.id, ahora, hasta);
  return horariosLibres({
    ahora,
    zona: corredor.zona_horaria,
    horarios: datos.horarios,
    bloqueos: datos.bloqueos,
    citas: datos.citas,
    duracionMin: corredor.duracion_visita_min,
    margenMin: corredor.margen_visitas_min,
    anticipacionHoras: corredor.anticipacion_min_horas,
    horizonteDias: corredor.horizonte_agenda_dias,
    zonaVisita,
    zonaBase: corredor.zona_base ?? null,
  });
}

export type DiaLibre = { fecha: string; etiqueta: string; horas: { inicio: string; hora: string }[] };

export function agruparPorDia(libres: Intervalo[], zona: string, maxDias = 14): DiaLibre[] {
  const dias = new Map<string, DiaLibre>();
  for (const l of libres) {
    const fecha = fechaIso(fechaLocal(l.inicio, zona));
    if (!dias.has(fecha)) {
      if (dias.size >= maxDias) break;
      dias.set(fecha, { fecha, etiqueta: etiquetaHorario(l.inicio, zona).split(",")[0], horas: [] });
    }
    dias.get(fecha)!.horas.push({ inicio: l.inicio.toISOString(), hora: horaCorta(l.inicio, zona) });
  }
  return [...dias.values()];
}

export async function horariosPublicos(deps: Dependencias, db: SupabaseClient, corredor: Corredor, casaId: string | null) {
  const casa = await zonaDeCasa(db, corredor, casaId);
  return agruparPorDia(await libresDe(deps, corredor, casa?.zona ?? null), corredor.zona_horaria);
}

/** Teléfono en formato internacional (+506…). Un número de 8 dígitos se toma como de Costa Rica. */
export function normalizarTelefono(entrada: string): string | null {
  const digitos = entrada.replace(/\D/g, "");
  if (digitos.length === 8) return `+506${digitos}`;
  if (digitos.length >= 10 && digitos.length <= 15) return `+${digitos}`;
  return null;
}

export type PedidoVisita = { casa: string | null; inicio: Date; nombre: string; telefono: string; correo: string | null; notas: string | null };

/** Valida lo que manda el formulario del sitio. El campo `empresa` es una trampa para robots: debe venir vacío. */
export function leerPedido(cuerpo: unknown): { ok: true; pedido: PedidoVisita } | { ok: false; motivo: string; robot?: boolean } {
  const c = (cuerpo && typeof cuerpo === "object" ? cuerpo : {}) as Record<string, unknown>;
  const texto = (v: unknown, max: number) => (typeof v === "string" ? v.trim().slice(0, max) : "");
  if (texto(c.empresa, 200)) return { ok: false, motivo: "No se pudo enviar.", robot: true };
  if (c.acepta !== true) return { ok: false, motivo: "Acepta el aviso de privacidad para continuar." };
  const nombre = texto(c.nombre, 80);
  if (nombre.length < 2) return { ok: false, motivo: "Escribe tu nombre." };
  const telefono = normalizarTelefono(texto(c.telefono, 30));
  if (!telefono) return { ok: false, motivo: "Escribe un WhatsApp válido (con código de país si no es de Costa Rica)." };
  const correo = texto(c.correo, 120) || null;
  if (correo && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(correo)) return { ok: false, motivo: "El correo no parece válido." };
  const inicio = new Date(texto(c.inicio, 40));
  if (Number.isNaN(inicio.getTime())) return { ok: false, motivo: "Elige un día y una hora." };
  const casa = texto(c.casa, 40) || null;
  if (casa && !ID.test(casa)) return { ok: false, motivo: "No encontré esa propiedad." };
  return { ok: true, pedido: { casa, inicio, nombre, telefono, correo, notas: texto(c.notas, 500) || null } };
}

/** Huella de quien pide (para frenar ráfagas sin guardar la dirección IP). */
export const huella = (texto: string) => createHash("sha256").update(texto).digest("hex").slice(0, 32);

export async function pedirVisita(
  deps: Dependencias,
  db: SupabaseClient,
  corredor: Corredor,
  pedido: PedidoVisita,
): Promise<{ ok: true; cuando: string; casa: string | null } | { ok: false; motivo: string; estado: number }> {
  const casa = await zonaDeCasa(db, corredor, pedido.casa);
  if (pedido.casa && !casa) return { ok: false, motivo: "Esa propiedad ya no está disponible.", estado: 404 };
  // La hora tiene que seguir libre en la agenda real (otro cliente pudo tomarla).
  const libres = await libresDe(deps, corredor, casa?.zona ?? null);
  if (!libres.some((l) => l.inicio.getTime() === pedido.inicio.getTime())) {
    return { ok: false, motivo: "Esa hora ya no está libre. Elige otra.", estado: 409 };
  }
  const contacto = await deps.repo.contacto(corredor.id, pedido.telefono, pedido.nombre);
  // Datos que el cliente dio en el sitio: el correo, solo si no había uno.
  if (pedido.correo) await db.from("contactos").update({ email: pedido.correo }).eq("corredor_id", corredor.id).eq("id", contacto.id).is("email", null);
  const r = await crearVisita(deps, db, corredor, {
    contactoId: contacto.id,
    propiedadId: casa?.id ?? null,
    inicio: pedido.inicio,
    minutos: corredor.duracion_visita_min,
    avisarCliente: false,
  });
  if (!r.ok) return { ok: false, motivo: "Esa hora ya no está libre. Elige otra.", estado: 409 };
  const cuando = etiquetaHorario(pedido.inicio, corredor.zona_horaria);
  await anotar(db, corredor.id, contacto.id, "otro", `Pidió la visita desde el sitio web${pedido.notas ? `. Comentario: ${pedido.notas}` : ""}`, "asistente");
  await avisar(deps, corredor, `Nueva visita desde tu sitio web: ${pedido.nombre} (${pedido.telefono}), ${cuando}${casa ? `, ${casa.titulo}` : ""}. Confírmala en tu Agenda.`);
  return { ok: true, cuando, casa: casa?.titulo ?? null };
}

async function avisar(deps: Dependencias, corredor: Corredor, texto: string) {
  if (!corredor.whatsapp_corredor || !corredor.whatsapp_phone_number_id) return;
  try {
    await deps.whatsapp.plantilla(corredor.whatsapp_phone_number_id, corredor.whatsapp_corredor, deps.plantillaAviso, [texto]);
    await deps.repo.registrarUso(corredor.id, { mensajesSalientes: 1 });
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_aviso_sitio", corredorId: corredor.id, error: errorSeguro(e) }));
  }
}

/** Encabezados para que el sitio (otro dominio) pueda leer estas respuestas. Los datos son públicos. */
export const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Access-Control-Max-Age": "86400",
};
