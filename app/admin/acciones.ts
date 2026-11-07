"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sesionSuperadmin } from "@/lib/admin/superadmin";
import { monto } from "@/lib/admin/montos";
import { createAdminClient } from "@/lib/supabase/admin";

// Cambios del superadministrador. Cada acción vuelve a comprobar que quien la hace es superadmin y
// escribe con el backend (plataforma y los topes de los corredores no los puede tocar nadie más).

function volver(aviso: string): never {
  revalidatePath("/admin");
  redirect(`/admin?aviso=${encodeURIComponent(aviso)}`);
}

export async function guardarTopesPlataforma(f: FormData) {
  await sesionSuperadmin();
  const dia = monto(f.get("tope_dia"), false);
  const mes = monto(f.get("tope_mes"), false);
  if (dia === "error" || mes === "error" || dia === null || mes === null) volver("Revisa los montos: números en dólares, de 0 a 10.000.");
  const { error } = await createAdminClient()
    .from("plataforma")
    .update({ tope_ia_dia_usd: dia, tope_ia_mes_usd: mes, updated_at: new Date().toISOString() })
    .eq("id", true);
  volver(error ? "No se pudo guardar." : "Topes de la plataforma guardados.");
}

export async function guardarCorredor(f: FormData) {
  await sesionSuperadmin();
  const id = String(f.get("id") ?? "");
  if (!/^[0-9a-f-]{36}$/.test(id)) volver("No encontré ese corredor.");
  const dia = monto(f.get("tope_dia"), true);
  const mes = monto(f.get("tope_mes"), true);
  if (dia === "error" || mes === "error") volver("Revisa los montos: números en dólares, de 0 a 10.000, o vacío para usar el de la plataforma.");
  const { error } = await createAdminClient()
    .from("corredores")
    .update({ tope_ia_dia_usd: dia, tope_ia_mes_usd: mes, imagenes_activas: f.get("imagenes") === "on" })
    .eq("id", id);
  volver(error ? "No se pudo guardar." : "Guardado.");
}
