"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fechaIso, fechaLocal, sumarDias } from "@/lib/agenda/tiempo";
import { ETAPAS, MOTIVOS_PERDIDA, type Busca, type Etapa } from "@/lib/crm/perfil";
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
    .map((z) => z.trim())
    .filter(Boolean)
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
