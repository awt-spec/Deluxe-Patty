import { dosOpcionesPorZona, horariosLibres, visitaCercana, type Intervalo, type ParametrosAgenda } from "../agenda/disponibilidad";
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
  // La zona de la casa que quiere ver (si se nota en la conversación) define el traslado desde y hacia
  // las otras visitas del día; así no se agendan dos visitas seguidas en lados opuestos del Valle Central.
  const zonaDe = (p: Propiedad | null) => (p ? (p.zona ?? p.canton ?? null) : null);
  const probable = propiedadMencionada(propiedades, [...entrada.historial.slice(-6).map((m) => m.contenido ?? ""), entrada.texto]);
  const parametros = (zonaVisita: string | null): ParametrosAgenda => ({
    ahora,
    zona,
    horarios: datos.horarios,
    bloqueos: datos.bloqueos,
    citas: datos.citas,
    duracionMin: corredor.duracion_visita_min,
    margenMin: corredor.margen_visitas_min,
    anticipacionHoras: corredor.anticipacion_min_horas,
    horizonteDias: corredor.horizonte_agenda_dias,
    zonaVisita,
    zonaBase: corredor.zona_base ?? null,
  });
  let zonaVisita = zonaDe(probable);
  let libres = horariosLibres(parametros(zonaVisita)).slice(0, MAX_LIBRES);
  const dosOpciones = (l: Intervalo[]) => dosOpcionesPorZona(l, datos.citas, zonaVisita, zona);

  if (libres.length === 0 && citasCliente.length === 0) {
    return { tipo: "escalar", aviso: `${cliente} quiere agendar una visita y no hay horarios libres en la agenda.` };
  }

  const idsLibres = new Map(libres.map((l, i) => [`H${i + 1}`, l]));
  const idsCitas = new Map(citasCliente.map((c, i) => [`C${i + 1}`, c]));
  const contexto: ContextoAgenda = {
    libres: [...idsLibres].map(([id, l]) => {
      const junto = visitaCercana(l, datos.citas, zonaVisita, zona);
      return { id, etiqueta: etiqueta(l.inicio) + (junto ? ` (ese día ya hay otra visita cerca, en ${junto})` : "") };
    }),
    citasCliente: [...idsCitas].map(([id, c]) => ({ id, etiqueta: etiqueta(c.inicio), propiedad: c.propiedad_titulo })),
  };

  const d = await deps.cerebro.agendar(corredor, propiedades, contexto, entrada.historial, entrada.texto);
  alConsumir(d.consumo);

  const propiedad = d.propiedadCodigo ? (propiedades.find((p) => p.codigo === d.propiedadCodigo) ?? null) : null;
  // Si al final es otra casa (otra zona), los horarios se recalculan con su traslado y solo valen los
  // que siguen libres.
  if (propiedad && zonaDe(propiedad) !== zonaVisita) {
    zonaVisita = zonaDe(propiedad);
    const validos = new Set(horariosLibres(parametros(zonaVisita)).map((l) => l.inicio.getTime()));
    for (const [id, l] of idsLibres) if (!validos.has(l.inicio.getTime())) idsLibres.delete(id);
    libres = libres.filter((l) => validos.has(l.inicio.getTime()));
  }
  const cita = d.citaId ? (idsCitas.get(d.citaId) ?? null) : null;

  const proponer = async (intro: string, opciones: Intervalo[]) => {
    if (opciones.length === 0) {
      return { tipo: "escalar" as const, aviso: `${cliente} quiere agendar una visita y no hay horarios libres en la agenda.` };
    }
    const lista = opciones.map((o, i) => `${i + 1}. ${capitalizar(etiqueta(o.inicio))}`).join("\n");
    const pregunta = opciones.length > 1 ? "¿Cuál le queda mejor?" : "¿Le queda bien?";
    const borrador = await ctx.responderCliente(`${intro}\n\n${lista}\n\n${pregunta}`, "agendar_visita");
    return { tipo: "propuesto" as const, borrador };
  };

  let resultado: ResultadoAgenda;
  switch (d.accion) {
    case "proponer": {
      const elegidas = d.horarios.map((id) => idsLibres.get(id)).filter((x): x is Intervalo => !!x);
      const opciones = elegidas.length >= 2 ? elegidas.slice(0, 2) : dosOpciones(libres);
      resultado = await proponer(d.mensaje || "Con gusto, tengo estos espacios:", opciones);
      break;
    }

    case "confirmar": {
      const horario = idsLibres.get(d.horarios[0] ?? "");
      if (!horario) {
        resultado = await proponer("Ese horario no lo tengo libre. Le propongo estos:", dosOpciones(libres));
        break;
      }
      resultado = await agendar(ctx, { horario, propiedad, reemplaza: cita, cliente, ahora, contactoId: entrada.contactoId });
      if (resultado.tipo === "escalar") {
        // El horario se ocupó entre el cálculo y la inserción: se proponen otros.
        const otros = libres.filter((l) => l.inicio.getTime() !== horario.inicio.getTime());
        resultado = await proponer("Ese espacio se acaba de ocupar. Le propongo estos:", dosOpciones(otros));
      }
      break;
    }

    case "cancelar": {
      if (!cita) {
        resultado = { tipo: "escalar", aviso: `${cliente} quiere cancelar una visita y no se identificó cuál. Mensaje: "${entrada.texto}"` };
        break;
      }
      const texto = `${conPunto(`Listo, cancelé su visita del ${etiqueta(cita.inicio)}`)} Si gusta, buscamos otro día.`;
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
  const recordatorio = p.horario.inicio.getTime() - p.ahora.getTime() > 1.5 * DIA ? " Un día antes le mando un recordatorio." : "";
  const texto =
    `${conPunto(`Listo, quedó agendada su visita${p.propiedad ? ` para ver ${p.propiedad.titulo}` : ""} el ${etiqueta}`)} ` +
    `${corredor.nombre_contacto} le estará esperando.${recordatorio}`;

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

/** La casa de la que se habla en los últimos mensajes (por código, título o zona), si es una sola. */
export function propiedadMencionada(propiedades: Propiedad[], textos: string[]): Propiedad | null {
  const norm = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const texto = norm(textos.join(" \n "));
  const porCodigo = propiedades.filter((p) => p.codigo && texto.includes(norm(p.codigo)));
  if (porCodigo.length === 1) return porCodigo[0];
  const porTitulo = propiedades.filter((p) => p.titulo && texto.includes(norm(p.titulo)));
  if (porTitulo.length === 1) return porTitulo[0];
  const porZona = propiedades.filter((p) => p.zona && texto.includes(norm(p.zona)));
  return porZona.length === 1 ? porZona[0] : null;
}

function conPropiedad(titulo: string | null): string {
  return titulo ? `, ${titulo}` : "";
}

function capitalizar(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
