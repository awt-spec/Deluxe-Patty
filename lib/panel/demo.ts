import "server-only";
import { createAdminClient } from "../supabase/admin";
import { clienteConSesion } from "../supabase/servidor";

// Cuenta de demo: un usuario (DEMO_CORREO) que solo es miembro de corredores inactivos con datos
// ficticios (scripts/crear-demo.mts). Se entra sin correo: el servidor genera el enlace mágico con
// service_role y lo canjea en el acto. Sin DEMO_CORREO el botón no aparece.

export const demoDisponible = () => !!process.env.DEMO_CORREO;

/**
 * Abre la sesión de la demo. Antes comprueba que ese usuario no sea miembro de ningún corredor activo:
 * si alguien enlazara por error la cuenta de demo a un corredor real, la demo no abre.
 */
export async function abrirSesionDemo(): Promise<boolean> {
  const correo = process.env.DEMO_CORREO;
  if (!correo) return false;
  const admin = createAdminClient();
  const { data: enlace, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
  const usuario = enlace?.user?.id;
  const token = enlace?.properties?.hashed_token;
  if (error || !usuario || !token) return false;

  const { data: miembros } = await admin
    .from("miembros")
    .select("corredores!inner(activo)")
    .eq("user_id", usuario);
  const corredores = (miembros ?? []).flatMap((m) => m.corredores as unknown as { activo: boolean } | { activo: boolean }[]);
  if (corredores.length === 0 || corredores.some((c) => c.activo)) return false;

  const supabase = await clienteConSesion();
  const { error: e2 } = await supabase.auth.verifyOtp({ type: "email", token_hash: token });
  return !e2;
}
