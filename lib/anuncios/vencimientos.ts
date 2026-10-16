import type { Dependencias } from "../asistente/contexto";
import { conversacionDelCorredor, enviarAlCorredor } from "../asistente/corredor";
import { fechaIso, fechaLocal, sumarDias } from "../agenda/tiempo";
import { errorSeguro } from "../monitoreo/errores";

export const DIAS_AVISO_VENCIMIENTO = 5;

function fechaCorta(iso: string): string {
  const [a, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("es-CR", { day: "numeric", month: "long", timeZone: "UTC" }).format(
    new Date(Date.UTC(a, m - 1, d)),
  );
}

/**
 * Avisa al corredor, una sola vez por anuncio, los anuncios activos que vencen en los próximos
 * 5 días. Un solo mensaje por corredor. Corre cada hora (Vercel Cron).
 */
export async function avisarVencimientos(deps: Dependencias): Promise<{ avisados: number; fallidos: number }> {
  const ahora = deps.ahora?.() ?? new Date();
  const log = deps.registrar ?? ((evento, datos) => console.info(JSON.stringify({ evento, ...datos })));
  const resumen = { avisados: 0, fallidos: 0 };

  for (const corredor of await deps.repo.corredoresActivos()) {
    try {
      const hoy = fechaLocal(ahora, corredor.zona_horaria);
      const candidatos = await deps.repo.anunciosPorVencer(
        corredor.id,
        fechaIso(hoy),
        fechaIso(sumarDias(hoy, DIAS_AVISO_VENCIMIENTO)),
      );
      const marcados = new Set(await deps.repo.marcarAvisoVencimiento(corredor.id, candidatos.map((a) => a.id)));
      const anuncios = candidatos.filter((a) => marcados.has(a.id));
      if (anuncios.length === 0) continue;

      const partes = anuncios.map((a) => `${a.titulo ?? `ref. ${a.referencia}`} (vence el ${fechaCorta(a.vence_en)})`);
      const texto =
        anuncios.length === 1
          ? `Tu anuncio de Encuentra24 ${partes[0]} está por vencer. Renuévalo para no perder posición.`
          : `Tienes ${anuncios.length} anuncios de Encuentra24 por vencer: ${partes.join("; ")}. Renuévalos para no perder posición.`;
      const conversacion = await conversacionDelCorredor(deps, corredor);
      await enviarAlCorredor(deps, corredor, conversacion, texto, { plantillaSiCerrada: texto, ahora });
      resumen.avisados += anuncios.length;
    } catch (error) {
      resumen.fallidos++;
      log("error_aviso_vencimiento", { corredorId: corredor.id, error: errorSeguro(error) });
    }
  }
  return resumen;
}
