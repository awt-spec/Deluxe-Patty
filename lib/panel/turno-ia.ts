import { errorSeguro } from "../monitoreo/errores";
import { createAdminClient } from "../supabase/admin";

/**
 * Freno de ráfagas de las funciones con IA del panel que se piden a mano (chat del estudio de redes, Redes sociales):
 * hasta `porMinuto` pedidos por minuto y corredor, con `reclamar_alerta` (atómico en la base). Si la base no responde,
 * no se frena: los topes de gasto siguen frenando. Nada del pedido va a los registros.
 */
export async function hayTurnoPorMinuto(prefijo: string, corredorId: string, porMinuto: number): Promise<boolean> {
  try {
    const db = createAdminClient();
    for (let i = 0; i < porMinuto; i++) {
      const { data, error } = await db.rpc("reclamar_alerta", { p_clave: `${prefijo}:${corredorId}:${i}`, p_minutos: 1 });
      if (error) throw new Error(error.message);
      if (data === true) return true;
    }
    return false;
  } catch (e) {
    console.error(JSON.stringify({ evento: `error_freno_${prefijo}`, corredorId, error: errorSeguro(e) }));
    return true;
  }
}
