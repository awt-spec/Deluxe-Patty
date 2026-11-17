import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { createAdminClient } from "../supabase/admin";
import { clienteConSesion } from "../supabase/servidor";

// Superadministrador de la plataforma: ve el gasto de IA de todos los corredores y define los topes.
// Quién lo es está en la tabla superadmins (por correo de Supabase Auth), que solo lee el backend.
// A quien no lo es, /admin le responde "no existe" (no se revela que hay una pantalla ahí).

export async function esSuperadmin(correo: string | null | undefined): Promise<boolean> {
  if (!correo) return false;
  const { data, error } = await createAdminClient().from("superadmins").select("correo").eq("correo", correo.toLowerCase()).maybeSingle();
  return !error && !!data;
}

/**
 * Usuario con sesión que es superadministrador; si no, 404. La llaman el layout, CADA página de /admin (el layout no se
 * vuelve a dibujar en cada navegación, así que no basta) y cada acción. Con `cache` de React se consulta una sola vez
 * por petición aunque la llamen el layout y la página.
 */
export const sesionSuperadmin = cache(async () => {
  const supabase = await clienteConSesion();
  const { data } = await supabase.auth.getUser();
  const correo = data.user?.email ?? null;
  if (!data.user || !(await esSuperadmin(correo))) notFound();
  return { usuario: data.user, correo: correo! };
});
