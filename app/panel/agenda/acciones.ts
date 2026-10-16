"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Cambia el enlace privado del calendario (por si se compartió sin querer). El enlace viejo deja de
 * funcionar. El token no es legible ni editable con la sesión: se escribe con el backend, solo para el
 * corredor de la sesión.
 */
export async function cambiarEnlaceCalendario() {
  const { corredor } = await sesionConCorredor();
  const { error } = await createAdminClient()
    .from("corredores")
    .update({ token_calendario: randomBytes(32).toString("hex") })
    .eq("id", corredor.id);
  revalidatePath("/panel/agenda");
  redirect(
    `/panel/agenda?aviso=${encodeURIComponent(
      error ? "No se pudo cambiar el enlace." : "Listo: el enlace anterior ya no funciona. Vuelve a suscribirte con el nuevo.",
    )}`,
  );
}
