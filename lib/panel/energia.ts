import "server-only";
import { crearRepositorioSupabase } from "../datos/repositorio";
import { energiaDePresupuesto, type EstadoEnergia } from "../ia/energia";
import { errorSeguro } from "../monitoreo/errores";
import { createAdminClient } from "../supabase/admin";

// Energía de la asistente en el mes, para el corredor de la sesión. `presupuesto_ia()` solo la puede llamar el backend,
// así que va con service_role y el id del corredor que ya comprobó la sesión. Si falla, null: el panel sigue sin la barra.
export async function energiaDelCorredor(corredorId: string): Promise<EstadoEnergia | null> {
  try {
    return energiaDePresupuesto(await crearRepositorioSupabase(createAdminClient()).presupuestoIA(corredorId));
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_energia_ia", error: errorSeguro(e) }));
    return null;
  }
}
