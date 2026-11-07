import type { Repositorio } from "../datos/repositorio";
import { describirBloqueo, type PedidoBloqueo } from "./bloquear";

/**
 * Aparta el rato pedido en la agenda del corredor y arma la confirmación. Las visitas que ya estaban
 * en ese rato no se cancelan solas: se le avisa para que las revise.
 */
export async function apartar(
  repo: Pick<Repositorio, "crearBloqueo" | "datosAgenda">,
  corredorId: string,
  pedido: PedidoBloqueo,
  ahora = new Date(),
): Promise<{ ok: true; texto: string } | { ok: false; texto: string }> {
  if (pedido.fin <= ahora) return { ok: false, texto: `Ese rato (${describirBloqueo(pedido)}) ya pasó.` };
  await repo.crearBloqueo(corredorId, pedido.inicio, pedido.fin, pedido.motivo);
  const { citas } = await repo.datosAgenda(corredorId, pedido.inicio, pedido.fin);
  const encima = citas.filter((c) => c.inicio < pedido.fin && c.fin > pedido.inicio).length;
  return {
    ok: true,
    texto:
      `Listo, bloqueé ${describirBloqueo(pedido)}${pedido.motivo ? ` (${pedido.motivo})` : ""}: no voy a agendar visitas ahí.` +
      (encima ? ` Ojo: ya tenías ${encima} ${encima === 1 ? "visita" : "visitas"} en ese rato; siguen en pie, revísalas en la Agenda.` : ""),
  };
}
