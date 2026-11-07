import "server-only";
import { notFound } from "next/navigation";
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

/** Usuario con sesión que es superadministrador; si no, 404. Las páginas y acciones de /admin la usan. */
export async function sesionSuperadmin() {
  const supabase = await clienteConSesion();
  const { data } = await supabase.auth.getUser();
  const correo = data.user?.email ?? null;
  if (!data.user || !(await esSuperadmin(correo))) notFound();
  return { usuario: data.user, correo: correo! };
}
