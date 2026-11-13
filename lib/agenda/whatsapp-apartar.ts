import type { Consumo } from "../asistente/costo";
import type { Dependencias } from "../asistente/contexto";
import type { Corredor } from "../datos/tipos";
import { errorSeguro } from "../monitoreo/errores";
import { choquesConVisitas, resumenGuardado } from "./apartar-ia";
import { AYUDA_BLOQUEO } from "./bloquear";
import { entenderPedidoApartado } from "./entender-apartado";
import { horaCorta } from "./formato";

// "Apartar tiempo" por WhatsApp cuando el código no lo entiende solo. Por WhatsApp no hay dónde dejar una propuesta
// esperando un "SÍ" sin una tabla nueva (envios_pendientes es para mensajes que esperan la ventana de 24 horas), así
// que se guarda directo SOLO si no hay dudas ni choques con visitas, y se responde con el resumen armado por el
// código y "escríbeme «quitar lo del …» si me equivoqué". Con dudas o choques no se guarda nada: se pregunta o se
// manda a la pantalla Apartar tiempo, donde se confirma con la tarjeta.

const MAX_QUITAR_WHATSAPP = 10;

export async function apartarPorWhatsApp(
  deps: Pick<Dependencias, "repo" | "cerebro">,
  corredor: Corredor,
  texto: string,
  ahora: Date,
  usoClaude: (c: Consumo) => Promise<void>,
): Promise<{ texto: string; guardado: boolean }> {
  const zona = corredor.zona_horaria;
  const r = await entenderPedidoApartado(deps, corredor, texto, ahora, { usoClaude });
  if (!r.ok) return { texto: r.motivo, guardado: false };
  const { apartados, quitar, dudas, notas } = r.revisado;
  const aviso = r.aviso ? `${r.aviso} ` : "";
  if (dudas.length) {
    return {
      texto: `${aviso}Antes de apartarlo: ${dudas.map((d) => d.pregunta).join(" ")} Escríbemelo de nuevo con eso, todo junto.`,
      guardado: false,
    };
  }
  if (!apartados.length && !quitar.length) {
    return { texto: [`${aviso}No entendí qué día.`, ...notas, AYUDA_BLOQUEO].join(" "), guardado: false };
  }

  try {
    const lineas: string[] = [];
    let n = 0;
    let quitados = 0;
    if (apartados.length) {
      const desde = new Date(apartados[0].inicio);
      const hasta = new Date(apartados.reduce((m, a) => (a.fin > m ? a.fin : m), apartados[0].fin));
      const { citas, bloqueos } = await deps.repo.datosAgenda(corredor.id, desde, hasta);
      const choques = choquesConVisitas(apartados, citas);
      const conChoque = apartados.filter((a) => choques[a.clave]);
      if (conChoque.length) {
        const visitas = conChoque.flatMap((a) => choques[a.clave].map((v) => `${a.texto.split(" · ")[0]} a las ${horaCorta(new Date(v.inicio), zona)}`));
        return {
          texto:
            `${aviso}Esto entendí:\n${apartados.map((a) => `• ${a.texto}`).join("\n")}\n\n` +
            `No lo aparté porque ya tienes ${visitas.length === 1 ? "una visita" : "visitas"} ahí (${visitas.join("; ")}). ` +
            "Revísalo en el panel, en Agenda → Apartar tiempo, o escríbeme otro rato.",
          guardado: false,
        };
      }
      for (const a of apartados) {
        const inicio = new Date(a.inicio);
        const fin = new Date(a.fin);
        if (bloqueos.some((b) => b.inicio <= inicio && b.fin >= fin)) continue; // ya estaba apartado
        await deps.repo.crearBloqueo(corredor.id, inicio, fin, a.motivo);
        lineas.push(`• ${a.texto}`);
        n++;
      }
    }
    const lineasQuitar: string[] = [];
    if (quitar.length) {
      if (!deps.repo.bloqueosEntre || !deps.repo.quitarBloqueos) {
        lineasQuitar.push("Para quitar tiempo apartado entra al panel, en Agenda → Apartar tiempo.");
      } else {
        const encontrados = (
          await Promise.all(quitar.map((q) => deps.repo.bloqueosEntre!(corredor.id, new Date(q.inicio), new Date(q.fin))))
        ).flat();
        const unicos = [...new Map(encontrados.map((b) => [b.id, b])).values()];
        if (!unicos.length) lineasQuitar.push(`No tenías nada apartado ${quitar.map((q) => `el ${q.texto.toLowerCase()}`).join(" ni ")}.`);
        else if (unicos.length > MAX_QUITAR_WHATSAPP) lineasQuitar.push("Son muchos ratos para quitarlos por aquí: hazlo en el panel, en Agenda → Apartar tiempo.");
        else {
          await deps.repo.quitarBloqueos(corredor.id, unicos.map((b) => b.id));
          quitados = unicos.length;
        }
      }
    }
    const partes = [
      aviso.trim() || null,
      n || quitados ? `Listo. ${resumenGuardado(n, quitados)}` : apartados.length ? "Eso ya estaba apartado." : null,
      lineas.length ? `${lineas.join("\n")}\nNo voy a agendar visitas ahí.` : null,
      ...lineasQuitar,
      ...notas,
      n ? "Si me equivoqué, escríbeme «quitar lo del …» con el día." : null,
    ];
    return { texto: partes.filter(Boolean).join("\n\n"), guardado: n > 0 || quitados > 0 };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_apartar_whatsapp", corredorId: corredor.id, error: errorSeguro(e) }));
    return { texto: "No pude apartar ese tiempo ahora. Inténtalo de nuevo o hazlo en el panel, en Agenda → Apartar tiempo.", guardado: false };
  }
}

