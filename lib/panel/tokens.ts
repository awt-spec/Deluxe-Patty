import "server-only";
import { crearRepositorioSupabase } from "../datos/repositorio";
import { tokensDePresupuesto, type EstadoTokens } from "../ia/tokens";
import { errorSeguro } from "../monitoreo/errores";
import { createAdminClient } from "../supabase/admin";

// Tokens de IA del mes del corredor de la sesión. `presupuesto_ia()` solo la puede llamar el backend, así que va
// con service_role y el id del corredor que ya comprobó la sesión. Si falla, null: el panel sigue sin la barra.
export async function tokensDelCorredor(corredorId: string): Promise<EstadoTokens | null> {
  try {
    return tokensDePresupuesto(await crearRepositorioSupabase(createAdminClient()).presupuestoIA(corredorId));
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_tokens_ia", error: errorSeguro(e) }));
    return null;
  }
}
