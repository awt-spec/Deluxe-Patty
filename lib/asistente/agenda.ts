import { dosOpciones, horariosLibres, type Intervalo } from "../agenda/disponibilidad";
import { conPunto, etiquetaHorario } from "../agenda/formato";
import type { Cita, Mensaje, Propiedad } from "../datos/tipos";
import type { ContextoAgenda } from "./cerebro";
import type { Contexto } from "./contexto";
import type { Consumo } from "./costo";

const DIA = 24 * 60 * 60_000;
/** Cuántos horarios libres se le muestran al modelo para elegir. */
const MAX_LIBRES = 60;

export type ResultadoAgenda =
  | { tipo: "propuesto" | "agendado" | "cancelado" | "asistencia_confirmada" | "respondido"; borrador: boolean }
  | { tipo: "escalar"; aviso: string };

export interface EntradaAgenda {
  contactoId: string;
  nombreCliente: string;
  historial: Mensaje[];
  texto: string;
}

/**
 * Coordina una visita: Sonnet decide la acción, el código valida contra la agenda real y arma las
 * fechas. El modelo nunca escribe una fecha que llegue al cliente.
 */
export async function flujoAgenda(
  ctx: Contexto,
  entrada: EntradaAgenda,
  alConsumir: (c: Consumo) => void,
): Promise<ResultadoAgenda> {
  const { deps, corredor } = ctx;
  const { repo } = deps;
  const zona = corredor.zona_horaria;
  const ahora = deps.ahora?.() ?? new Date();
  const etiqueta = (d: Date) => etiquetaHorario(d, zona);
  const cliente = `${entrada.nombreCliente} (${ctx.telefonoCliente})`;

  const hasta = new Date(ahora.getTime() + (corredor.horizonte_agenda_dias + 1) * DIA);
  const [datos, citasCliente, propiedades] = await Promise.all([
    repo.datosAgenda(corredor.id, ahora, hasta),
    repo.citasProximasContacto(corredor.id, entrada.contactoId, ahora),
    repo.propiedadesActivas(corredor.id),
  ]);
  const libres = horariosLibres({
    ahora,
    zona,
    horarios: datos.horarios,
    bloqueos: datos.bloqueos,
    citas: datos.citas,
    duracionMin: corredor.duracion_visita_min,
    margenMin: corredor.margen_visitas_min,
    anticipacionHoras: corredor.anticipacion_min_horas,
    horizonteDias: corredor.horizonte_agenda_dias,
  }).slice(0, MAX_LIBRES);

  if (libres.length === 0 && citasCliente.length === 0) {
    return { tipo: "escalar", aviso: `${cliente} quiere agendar una visita y no hay horarios libres en la agenda.` };
  }

  const idsLibres = new Map(libres.map((l, i) => [`H${i + 1}`, l]));
  const idsCitas = new Map(citasCliente.map((c, i) => [`C${i + 1}`, c]));
  const contexto: ContextoAgenda = {
    libres: [...idsLibres].map(([id, l]) => ({ id, etiqueta: etiqueta(l.inicio) })),
    citasCliente: [...idsCitas].map(([id, c]) => ({ id, etiqueta: etiqueta(c.inicio), propiedad: c.propiedad_titulo })),
  };

  const d = await deps.cerebro.agendar(corredor, propiedades, contexto, entrada.historial, entrada.texto);
  alConsumir(d.consumo);

  const propiedad = d.propiedadCodigo ? (propiedades.find((p) => p.codigo === d.propiedadCodigo) ?? null) : null;
  const cita = d.citaId ? (idsCitas.get(d.citaId) ?? null) : null;

  const proponer = async (intro: string, opciones: Intervalo[]) => {
    if (opciones.length === 0) {
      return { tipo: "escalar" as const, aviso: `${cliente} quiere agendar una visita y no hay horarios libres en la agenda.` };
    }
    const lista = opciones.map((o, i) => `${i + 1}. ${capitalizar(etiqueta(o.inicio))}`).join("\n");
    const pregunta = opciones.length > 1 ? "¿Cuál te queda mejor?" : "¿Te queda bien?";
    const borrador = await ctx.responderCliente(`${intro}\n\n${lista}\n\n${pregunta}`, "agendar_visita");
    return { tipo: "propuesto" as const, borrador };
  };

  let resultado: ResultadoAgenda;
  switch (d.accion) {
    case "proponer": {
      const elegidas = d.horarios.map((id) => idsLibres.get(id)).filter((x): x is Intervalo => !!x);
      const opciones = elegidas.length >= 2 ? elegidas.slice(0, 2) : dosOpciones(libres, zona);
      resultado = await proponer(d.mensaje || "Con gusto, tengo estos espacios:", opciones);
      break;
    }

    case "confirmar": {
      const horario = idsLibres.get(d.horarios[0] ?? "");
      if (!horario) {
        resultado = await proponer("Ese horario no lo tengo libre. Te propongo estos:", dosOpciones(libres, zona));
        break;
      }
      resultado = await agendar(ctx, { horario, propiedad, reemplaza: cita, cliente, ahora, contactoId: entrada.contactoId });
      if (resultado.tipo === "escalar") {
        // El horario se ocupó entre el cálculo y la inserción: se proponen otros.
        const otros = libres.filter((l) => l.inicio.getTime() !== horario.inicio.getTime());
        resultado = await proponer("Ese espacio se acaba de ocupar. Te propongo estos:", dosOpciones(otros, zona));
      }
      break;
    }

    case "cancelar": {
      if (!cita) {
        resultado = { tipo: "escalar", aviso: `${cliente} quiere cancelar una visita y no se identificó cuál. Mensaje: "${entrada.texto}"` };
        break;
      }
      const texto = `${conPunto(`Listo, cancelé tu visita del ${etiqueta(cita.inicio)}`)} Si quieres buscamos otro día.`;
      if (!corredor.respuesta_automatica) {
        resultado = { tipo: "cancelado", borrador: await ctx.responderCliente(texto, "agendar_visita", { tipo: "cancelar_cita", cita_id: cita.id }) };
        break;
      }
      await repo.cambiarEstadoCita(corredor.id, cita.id, "cancelada");
      await ctx.responderCliente(texto, "agendar_visita");
      await ctx.avisarCorredor(conPunto(`Visita cancelada: ${cliente}, ${etiqueta(cita.inicio)}${conPropiedad(cita.propiedad_titulo)}`));
      resultado = { tipo: "cancelado", borrador: false };
      break;
    }

    case "confirmar_asistencia": {
      if (!cita) {
        resultado = { tipo: "escalar", aviso: `${cliente} escribió sobre una visita que no se identificó. Mensaje: "${entrada.texto}"` };
        break;
      }
      const texto = conPunto(`¡Perfecto! Te esperamos el ${etiqueta(cita.inicio)}`);
      if (!corredor.respuesta_automatica) {
        resultado = {
          tipo: "asistencia_confirmada",
          borrador: await ctx.responderCliente(texto, "agendar_visita", { tipo: "confirmar_asistencia", cita_id: cita.id }),
        };
        break;
      }
      await repo.cambiarEstadoCita(corredor.id, cita.id, "confirmada");
      await ctx.responderCliente(texto, "agendar_visita");
      resultado = { tipo: "asistencia_confirmada", borrador: false };
      break;
    }

    case "responder": {
      if (!d.mensaje) {
        resultado = { tipo: "escalar", aviso: `${cliente} escribió sobre una visita y la asistente no supo qué responder. Mensaje: "${entrada.texto}"` };
        break;
      }
      resultado = { tipo: "respondido", borrador: await ctx.responderCliente(d.mensaje, "agendar_visita") };
      break;
    }
  }

  if (d.avisarCorredor && resultado.tipo !== "escalar") {
    await ctx.avisarCorredor(`${cliente}: ${d.avisarCorredor}. Mensaje del cliente: "${entrada.texto}"`);
  }
  return resultado;
}

async function agendar(
  ctx: Contexto,
  p: {
    horario: Intervalo;
    propiedad: Propiedad | null;
    reemplaza: Cita | null;
    cliente: string;
    ahora: Date;
    contactoId: string;
  },
): Promise<ResultadoAgenda> {
  const { corredor, deps } = ctx;
  const etiqueta = etiquetaHorario(p.horario.inicio, corredor.zona_horaria);
  const recordatorio = p.horario.inicio.getTime() - p.ahora.getTime() > 1.5 * DIA ? " Un día antes te mando un recordatorio." : "";
  const texto =
    `${conPunto(`Listo, quedó agendada tu visita${p.propiedad ? ` para ver ${p.propiedad.titulo}` : ""} el ${etiqueta}`)} ` +
    `${corredor.nombre_contacto} te va a estar esperando.${recordatorio}`;

  if (!corredor.respuesta_automatica) {
    const borrador = await ctx.responderCliente(texto, "agendar_visita", {
      tipo: "crear_cita",
      inicio: p.horario.inicio.toISOString(),
      fin: p.horario.fin.toISOString(),
      propiedad_id: p.propiedad?.id ?? null,
      reemplaza_cita_id: p.reemplaza?.id ?? null,
    });
    return { tipo: "agendado", borrador };
  }

  const id = await deps.repo.crearCita({
    corredor_id: corredor.id,
    contacto_id: p.contactoId,
    conversacion_id: ctx.conversacion.id,
    propiedad_id: p.propiedad?.id ?? null,
    inicio: p.horario.inicio,
    fin: p.horario.fin,
  });
  if (id === null) return { tipo: "escalar", aviso: "horario ocupado" };
  if (p.reemplaza) await deps.repo.cambiarEstadoCita(corredor.id, p.reemplaza.id, "cancelada");

  await ctx.responderCliente(texto, "agendar_visita");
  const antes = p.reemplaza
    ? ` (antes: ${etiquetaHorario(p.reemplaza.inicio, corredor.zona_horaria)})`
    : "";
  await ctx.avisarCorredor(
    conPunto(`${p.reemplaza ? "Visita reprogramada" : "Nueva visita"}: ${p.cliente}, ${etiqueta}${antes}${conPropiedad(p.propiedad?.titulo ?? null)}`),
  );
  return { tipo: "agendado", borrador: false };
}

function conPropiedad(titulo: string | null): string {
  return titulo ? `, ${titulo}` : "";
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
