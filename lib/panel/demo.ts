import "server-only";
import { createAdminClient } from "../supabase/admin";
import { clienteConSesion } from "../supabase/servidor";

// Cuenta de demo: un usuario (DEMO_CORREO) que solo es miembro de corredores inactivos con datos
// ficticios (scripts/crear-demo.mts). Se entra sin correo: el servidor genera el enlace mágico con
// service_role y lo canjea en el acto. Sin DEMO_CORREO el botón no aparece.

/** El correo tal como lo guarda Supabase: sin espacios ni mayúsculas que se cuelan al copiarlo en Vercel. */
const correoDemo = () => process.env.DEMO_CORREO?.trim().toLowerCase() || null;

export const demoDisponible = () => !!correoDemo();

/** En qué paso falló la demo, para los registros de Vercel (sin correos ni datos personales). */
function fallo(paso: string, error?: { status?: number; code?: string } | null): false {
  console.error(JSON.stringify({ evento: "error_demo", paso, status: error?.status ?? null, codigo: error?.code ?? null }));
  return false;
}

/**
 * Abre la sesión de la demo. Antes comprueba que ese usuario no sea miembro de ningún corredor activo:
 * si alguien enlazara por error la cuenta de demo a un corredor real, la demo no abre.
 */
export async function abrirSesionDemo(): Promise<boolean> {
  const correo = correoDemo();
  if (!correo) return false;
  const admin = createAdminClient();
  const { data: enlace, error } = await admin.auth.admin.generateLink({ type: "magiclink", email: correo });
  const usuario = enlace?.user?.id;
  const token = enlace?.properties?.hashed_token;
  if (error || !usuario || !token) return fallo("generar_enlace", error);

  const { data: miembros, error: eMiembros } = await admin
    .from("miembros")
    .select("corredores!inner(activo)")
    .eq("user_id", usuario);
  const corredores = (miembros ?? []).flatMap((m) => m.corredores as unknown as { activo: boolean } | { activo: boolean }[]);
  if (eMiembros) return fallo("miembros", eMiembros);
  if (corredores.length === 0) return fallo("sin_corredor_demo");
  if (corredores.some((c) => c.activo)) return fallo("enlazada_a_corredor_activo");

  const supabase = await clienteConSesion();
  const { error: e2 } = await supabase.auth.verifyOtp({ type: "email", token_hash: token });
  return e2 ? fallo("canjear_enlace", e2) : true;
}
