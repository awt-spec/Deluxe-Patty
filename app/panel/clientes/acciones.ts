"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fechaIso, fechaLocal, sumarDias } from "@/lib/agenda/tiempo";
import { normalizarZona } from "@/lib/agenda/zonas";
import { anotar, comisionEstimada, type TipoActividad } from "@/lib/crm/actividades";
import { ETAPAS, MOTIVOS_PERDIDA, NOMBRE_ETAPA, type Busca, type Etapa } from "@/lib/crm/perfil";
import { leerNumero, normalizarTelefono } from "@/lib/panel/formularios";
import { createAdminClient } from "@/lib/supabase/admin";
import { sesionConCorredor } from "@/lib/panel/sesion";

// El corredor edita el CRM de sus clientes con su sesión: la política de contactos (RLS) solo le deja
// tocar los suyos y el permiso por columna, solo estos campos (nunca el teléfono).

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const numeroDe = (v: string) => {
  const n = leerNumero(v);
  return typeof n === "number" ? n : null;
};
const idValido = (id: string) => /^[0-9a-f-]{36}$/.test(id);

async function guardar(id: string, cambios: Record<string, unknown>, aviso: string) {
  if (!idValido(id)) redirect("/panel/clientes");
  const { supabase, corredor } = await sesionConCorredor();
  const { error } = await supabase.from("contactos").update(cambios).eq("corredor_id", corredor.id).eq("id", id);
  revalidatePath(`/panel/clientes/${id}`);
  revalidatePath("/panel/clientes");
  revalidatePath("/panel");
  redirect(`/panel/clientes/${id}?aviso=${encodeURIComponent(error ? "No se pudo guardar. Vuelve a intentarlo." : aviso)}`);
}

export async function cambiarEtapa(f: FormData) {
  const etapa = texto(f, "etapa") as Etapa;
  if (!ETAPAS.includes(etapa)) redirect("/panel/clientes");
  // Si el cliente se pierde, se guarda por qué (uno de los botones); si vuelve, se borra el motivo.
  const motivo = texto(f, "motivo");
  const motivo_perdida = etapa === "perdido" && (MOTIVOS_PERDIDA as readonly string[]).includes(motivo) ? motivo : null;
  await registrarEtapa(texto(f, "id"), etapa, motivo_perdida);
  await guardar(
    texto(f, "id"),
    { etapa, etapa_at: new Date().toISOString(), motivo_perdida },
    etapa === "perdido" && !motivo_perdida ? "Listo. Si quieres, dinos por qué se perdió." : "Listo, guardado.",
  );
}

export async function guardarBusca(f: FormData) {
  const operacion = texto(f, "operacion");
  const zonas = texto(f, "zonas")
    .split(",")
    .map((z) => normalizarZona(z))
    .filter(Boolean)
    .filter((z, i, todas) => todas.findIndex((x) => x.toLowerCase() === z.toLowerCase()) === i)
    .slice(0, 6);
  const presupuesto = numeroDe(texto(f, "presupuesto"));
  const habitaciones = numeroDe(texto(f, "habitaciones"));
  const busca: Busca = {
    ...(operacion === "venta" || operacion === "alquiler" ? { operacion } : {}),
    ...(texto(f, "tipo") ? { tipo: texto(f, "tipo").slice(0, 40) } : {}),
    ...(zonas.length ? { zonas } : {}),
    ...(presupuesto && presupuesto > 0 ? { presupuesto_max: presupuesto, moneda: texto(f, "moneda") === "CRC" ? "CRC" : "USD" } : {}),
    ...(habitaciones && habitaciones > 0 ? { habitaciones: Math.round(habitaciones) } : {}),
  };
  await guardar(texto(f, "id"), { busca }, "Guardado.");
}

export async function guardarSeguimiento(f: FormData) {
  // Atajos "Mañana", "En 3 días", "En una semana": el botón trae los días y la fecha se calcula aquí.
  const dias = Number(texto(f, "dias"));
  let fecha = texto(f, "fecha");
  if ([1, 3, 7].includes(dias)) {
    const { corredor } = await sesionConCorredor();
    fecha = fechaIso(sumarDias(fechaLocal(new Date(), corredor.zona_horaria), dias));
  }
  const quitar = f.get("quitar") !== null;
  await guardar(
    texto(f, "id"),
    quitar || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)
      ? { seguimiento_fecha: null, seguimiento_nota: null }
      : { seguimiento_fecha: fecha, seguimiento_nota: texto(f, "nota").slice(0, 500) || null },
    quitar ? "Listo, ya está hecho." : "Listo, te lo recuerdo ese día.",
  );
}

export async function guardarNotas(f: FormData) {
  await guardar(texto(f, "id"), { notas: texto(f, "notas").slice(0, 4000) || null, nombre: texto(f, "nombre").slice(0, 80) || null }, "Guardado.");
}

/**
 * Cliente que llegó por fuera de WhatsApp (un referido, una llamada). Los contactos los escribe el
 * backend: primero se comprueba con la sesión cuál es el corredor y luego se guarda con su corredor_id.
 */
export async function agregarCliente(f: FormData) {
  const { corredor } = await sesionConCorredor();
  const telefono = normalizarTelefono(texto(f, "telefono"));
  const nombre = texto(f, "nombre").slice(0, 80) || null;
  if (!telefono) redirect(`/panel/clientes/nuevo?aviso=${encodeURIComponent("Revisa el teléfono: 8 números, o con +506.")}`);
  const origen = texto(f, "origen") === "referido" ? "referido" : "otro";
  const admin = createAdminClient();
  const { data: ya } = await admin
    .from("contactos")
    .select("id")
    .eq("corredor_id", corredor.id)
    .eq("telefono", telefono)
    .maybeSingle();
  if (ya) redirect(`/panel/clientes/${ya.id}?aviso=${encodeURIComponent("Ese cliente ya estaba: aquí está.")}`);
  const { data, error } = await admin
    .from("contactos")
    .insert({ corredor_id: corredor.id, telefono, nombre, origen, notas: texto(f, "notas").slice(0, 4000) || null })
    .select("id")
    .single();
  if (error || !data) redirect(`/panel/clientes/nuevo?aviso=${encodeURIComponent("No se pudo guardar. Vuelve a intentarlo.")}`);
  revalidatePath("/panel/clientes");
  redirect(`/panel/clientes/${data.id}?aviso=${encodeURIComponent("Cliente agregado.")}`);
}

/** Mover un cliente de etapa desde el tablero (arrastrando). Devuelve si se guardó. */
export async function moverEtapa(id: string, etapa: string): Promise<boolean> {
  if (!idValido(id) || !(ETAPAS as readonly string[]).includes(etapa)) return false;
  const { supabase, corredor } = await sesionConCorredor();
  const { error } = await supabase
    .from("contactos")
    .update({ etapa, etapa_at: new Date().toISOString(), ...(etapa === "perdido" ? {} : { motivo_perdida: null }) })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  if (!error) await anotar(createAdminClient(), corredor.id, id, "etapa", `Pasó a ${NOMBRE_ETAPA[etapa as Etapa]}`);
  revalidatePath("/panel/clientes");
  return !error;
}

/** El cliente es del corredor de la sesión (RLS). Devuelve el corredor o vuelve a Clientes. */
async function clientePropio(id: string) {
  if (!idValido(id)) redirect("/panel/clientes");
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase.from("contactos").select("id").eq("corredor_id", corredor.id).eq("id", id).maybeSingle();
  if (!data) redirect("/panel/clientes");
  return corredor;
}

async function registrarEtapa(id: string, etapa: Etapa, motivo: string | null) {
  const corredor = await clientePropio(id);
  await anotar(createAdminClient(), corredor.id, id, "etapa", `Pasó a ${NOMBRE_ETAPA[etapa]}${motivo ? `: ${motivo}` : ""}`);
}

function volverA(id: string, aviso: string): never {
  revalidatePath(`/panel/clientes/${id}`);
  revalidatePath("/panel/clientes");
  revalidatePath("/panel");
  redirect(`/panel/clientes/${id}?aviso=${encodeURIComponent(aviso)}`);
}

const POR_DEFECTO: Record<string, string> = { llamada: "Lo llamé", mensaje: "Le escribí", visita: "Lo vi en persona" };

/** "Anotar": lo que pasó con el cliente (lo llamé, le escribí, lo vi, otra cosa). */
export async function anotarActividad(f: FormData) {
  const id = texto(f, "id");
  const corredor = await clientePropio(id);
  const tipo = texto(f, "tipo") as TipoActividad;
  if (!["llamada", "mensaje", "visita", "nota"].includes(tipo)) volverA(id, "Elige qué pasó.");
  const nota = texto(f, "texto");
  const ok = await anotar(createAdminClient(), corredor.id, id, tipo, nota || POR_DEFECTO[tipo] || "");
  volverA(id, ok ? "Anotado." : "Escribe qué pasó.");
}

const montoDe = (v: string) => {
  const n = leerNumero(v);
  return typeof n === "number" && n > 0 ? Math.round(n * 100) / 100 : null;
};

async function casaPropia(corredorId: string, casa: string) {
  if (!idValido(casa)) return null;
  const { data } = await createAdminClient()
    .from("propiedades")
    .select("id, titulo, precio")
    .eq("corredor_id", corredorId)
    .eq("id", casa)
    .maybeSingle();
  return data as { id: string; titulo: string; precio: number | null } | null;
}

const dolares = (n: number) => `$${n.toLocaleString("es-CR")}`;

/** Casa que le interesa y oferta (si la hay). Con oferta, el cliente pasa a "Negociando". */
export async function guardarOportunidad(f: FormData) {
  const id = texto(f, "id");
  const corredor = await clientePropio(id);
  const casa = texto(f, "casa") ? await casaPropia(corredor.id, texto(f, "casa")) : null;
  const oferta = montoDe(texto(f, "oferta"));
  const db = createAdminClient();
  const { data: antes } = await db.from("contactos").select("etapa, oferta_monto").eq("corredor_id", corredor.id).eq("id", id).single();
  const pasa = !!oferta && ["nuevo", "interesado", "visita"].includes(antes?.etapa as string);
  const { error } = await db
    .from("contactos")
    .update({
      propiedad_interes_id: casa?.id ?? null,
      oferta_monto: oferta,
      ...(pasa ? { etapa: "negociando", etapa_at: new Date().toISOString() } : {}),
    })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  if (error) volverA(id, "No se pudo guardar. Vuelve a intentarlo.");
  if (oferta && oferta !== Number(antes?.oferta_monto ?? 0)) {
    await anotar(db, corredor.id, id, "oferta", `Oferta de ${dolares(oferta)}${casa ? ` por ${casa.titulo}` : ""}`);
  }
  if (pasa) await anotar(db, corredor.id, id, "etapa", "Pasó a Negociando");
  volverA(id, pasa ? "Guardado. Lo pasé a Negociando." : "Guardado.");
}

/** "Cerró": qué casa, a qué precio y cuánto se ganó. */
export async function guardarCierre(f: FormData) {
  const id = texto(f, "id");
  const corredor = await clientePropio(id);
  const casa = await casaPropia(corredor.id, texto(f, "casa"));
  const precio = montoDe(texto(f, "precio"));
  if (!precio) volverA(id, "Escribe el precio final.");
  const comision = montoDe(texto(f, "comision")) ?? comisionEstimada(precio, corredor.comision_pct);
  const db = createAdminClient();
  const { error } = await db
    .from("contactos")
    .update({
      etapa: "cerrado",
      etapa_at: new Date().toISOString(),
      motivo_perdida: null,
      cierre_propiedad_id: casa?.id ?? null,
      cierre_precio: precio,
      cierre_comision: comision,
      cierre_at: new Date().toISOString(),
    })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  if (error) volverA(id, "No se pudo guardar. Vuelve a intentarlo.");
  await anotar(db, corredor.id, id, "cierre", `Cerró${casa ? ` ${casa.titulo}` : ""} en ${dolares(precio)} · comisión ${dolares(comision)}`);
  volverA(id, "¡Felicidades! Cierre guardado.");
}

/** Une dos clientes que son la misma persona: el de la ficha queda y el elegido se le une. */
export async function unirCliente(f: FormData) {
  const queda = texto(f, "id");
  const sale = texto(f, "otro");
  const corredor = await clientePropio(queda);
  await clientePropio(sale);
  const { data, error } = await createAdminClient().rpc("unir_contactos", { p_corredor: corredor.id, p_queda: queda, p_sale: sale });
  volverA(queda, !error && data ? "Listo, quedaron unidos en este cliente." : "No se pudieron unir. Vuelve a intentarlo.");
}
