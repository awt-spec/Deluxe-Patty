"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ETAPAS, type Busca, type Etapa } from "@/lib/crm/perfil";
import { leerNumero } from "@/lib/panel/formularios";
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
  await guardar(texto(f, "id"), { etapa, etapa_at: new Date().toISOString() }, "Etapa guardada.");
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
  const fecha = texto(f, "fecha");
  const quitar = f.get("quitar") !== null;
  await guardar(
    texto(f, "id"),
    quitar || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)
      ? { seguimiento_fecha: null, seguimiento_nota: null }
      : { seguimiento_fecha: fecha, seguimiento_nota: texto(f, "nota").slice(0, 500) || null },
    quitar ? "Listo, seguimiento hecho." : "Seguimiento guardado.",
  );
}

export async function guardarNotas(f: FormData) {
  await guardar(texto(f, "id"), { notas: texto(f, "notas").slice(0, 4000) || null, nombre: texto(f, "nombre").slice(0, 80) || null }, "Guardado.");
}
