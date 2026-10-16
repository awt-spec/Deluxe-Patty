import type { Cerebro } from "../asistente/cerebro";
import { procesarMensaje } from "../asistente/procesar";
import type { Repositorio } from "../datos/repositorio";
import type { Corredor, EstadoCita } from "../datos/tipos";
import type { EnviadorWhatsApp } from "../whatsapp/enviar";
import { MAX_MENSAJES_SIMULACION, MAX_TEXTO_SIMULACION, type EstadoSimulacion, type TurnoSimulado } from "./estado";

// "Probar la asistente": el corredor le escribe a su asistente como si fuera un cliente. Corre el flujo
// real (Claude, propiedades, horario, correcciones), pero la conversación, las citas y los avisos de la
// prueba viven solo en el estado de la simulación, que guarda el navegador y se manda en cada turno.
// Nada se escribe en mensajes, citas ni conversaciones, nada sale por WhatsApp y no suma al tope de
// mensajes; solo se registra el costo de Claude.

export {
  ESTADO_INICIAL,
  MAX_MENSAJES_SIMULACION,
  MAX_TEXTO_SIMULACION,
  type CitaSimulada,
  type EstadoSimulacion,
  type TurnoSimulado,
} from "./estado";

const PNID = "SIMULADOR";
const CLIENTE = "+50600000000";
const CORREDOR_SIMULADO = "+50600000001";
const CONVERSACION = "simulacion";
const CONTACTO = "cliente-de-prueba";

/** El estado viene del navegador: se valida y se recorta antes de usarlo. */
export function estadoValido(x: unknown): EstadoSimulacion {
  const e = (x ?? {}) as Partial<EstadoSimulacion>;
  const texto = (v: unknown) => String(v ?? "").slice(0, 4000);
  const estados: EstadoCita[] = ["agendada", "confirmada", "cancelada", "realizada", "no_asistio"];
  return {
    mensajes: (Array.isArray(e.mensajes) ? e.mensajes : []).slice(-MAX_MENSAJES_SIMULACION).map((m) => ({
      direccion: m?.direccion === "saliente" ? "saliente" : "entrante",
      autor: m?.direccion === "saliente" ? "asistente" : "cliente",
      contenido: texto(m?.contenido),
    })),
    citas: (Array.isArray(e.citas) ? e.citas : [])
      .slice(-10)
      .filter((c) => c && !Number.isNaN(Date.parse(c.inicio)) && !Number.isNaN(Date.parse(c.fin)))
      .map((c, i) => ({
        id: `sim-cita-${i + 1}`,
        inicio: new Date(c.inicio).toISOString(),
        fin: new Date(c.fin).toISOString(),
        estado: estados.includes(c.estado) ? c.estado : "agendada",
        propiedad_id: typeof c.propiedad_id === "string" ? c.propiedad_id : null,
      })),
    escalada: e.escalada === true,
  };
}

const activa = (c: { estado: EstadoCita }) => c.estado === "agendada" || c.estado === "confirmada";

function repoSimulado(real: Repositorio, corredor: Corredor, estado: EstadoSimulacion, turno: TurnoSimulado): Repositorio {
  let n = estado.mensajes.length;
  const simulado: Partial<Repositorio> = {
    corredorPorPhoneNumberId: async () => corredor,
    contacto: async () => ({ id: CONTACTO, corredor_id: corredor.id, telefono: CLIENTE, nombre: "Cliente de prueba" }),
    conversacionActiva: async () => ({
      id: CONVERSACION,
      corredor_id: corredor.id,
      contacto_id: CONTACTO,
      estado: estado.escalada ? "escalada" : "abierta",
      control: "asistente",
    }),
    guardarMensaje: async (m) => {
      estado.mensajes.push({ direccion: m.direccion, autor: m.autor, contenido: m.contenido ?? "" });
      return `sim-${++n}`;
    },
    actualizarMensaje: async (_c, _id, cambios) => {
      if (cambios.intencion !== undefined) turno.intencion = cambios.intencion ?? null;
    },
    actualizarConversacion: async (_c, _id, cambios) => {
      if (cambios.estado === "escalada") estado.escalada = true;
    },
    historial: async (_c, _conv, limite) =>
      estado.mensajes.slice(-limite).map((m, i) => ({
        id: `sim-${i + 1}`,
        direccion: m.direccion,
        autor: m.autor,
        contenido: m.contenido,
        estado_borrador: null,
        created_at: "",
      })),
    atribuirContacto: async () => false,
    // Solo el costo de Claude es real; los mensajes de prueba no cuentan contra el tope de WhatsApp.
    registrarUso: async (corredorId, d) => {
      if (d.llamadasClaude) {
        await real.registrarUso(corredorId, {
          llamadasClaude: d.llamadasClaude,
          tokensEntrada: d.tokensEntrada,
          tokensSalida: d.tokensSalida,
          costoClaudeUsd: d.costoClaudeUsd,
        });
      }
      return { mes: "", mensajes_total: 0, aviso_tope_enviado_at: "simulacion" };
    },
    marcarAvisoTope: async () => false,
    // El tope de costo del día es el real: las pruebas también gastan.
    costoClaudeDelDia: (corredorId, dia) => real.costoClaudeDelDia(corredorId, dia),
    entrantesDesde: async () => estado.mensajes.filter((m) => m.direccion === "entrante").length,
    propiedadesActivas: (corredorId) => real.propiedadesActivas(corredorId),
    correccionesRecientes: (corredorId, limite) => real.correccionesRecientes(corredorId, limite),
    // La agenda real ocupa los horarios; las citas de la prueba también, para que la conversación sea coherente.
    datosAgenda: async (corredorId, desde, hasta) => {
      const datos = await real.datosAgenda(corredorId, desde, hasta);
      const propias = estado.citas.filter(activa).map((c) => ({ inicio: new Date(c.inicio), fin: new Date(c.fin) }));
      return { ...datos, citas: [...datos.citas, ...propias] };
    },
    citasProximasContacto: async (corredorId, _contacto, desde) => {
      const titulos = new Map((await real.propiedadesActivas(corredorId)).map((p) => [p.id, p.titulo]));
      return estado.citas
        .filter((c) => activa(c) && new Date(c.inicio) >= desde)
        .map((c) => ({
          id: c.id,
          inicio: new Date(c.inicio),
          fin: new Date(c.fin),
          estado: c.estado,
          propiedad_titulo: c.propiedad_id ? (titulos.get(c.propiedad_id) ?? null) : null,
        }));
    },
    crearCita: async (cita) => {
      const choca = estado.citas.some((c) => activa(c) && new Date(c.inicio) < cita.fin && cita.inicio < new Date(c.fin));
      if (choca) return null;
      const id = `sim-cita-${estado.citas.length + 1}`;
      estado.citas.push({
        id,
        inicio: cita.inicio.toISOString(),
        fin: cita.fin.toISOString(),
        estado: "agendada",
        propiedad_id: cita.propiedad_id,
      });
      return id;
    },
    cambiarEstadoCita: async (_c, id, nuevo) => {
      const c = estado.citas.find((x) => x.id === id && activa(x));
      if (c) c.estado = nuevo;
      return !!c;
    },
  };
  // Cualquier otra operación del repositorio sería un error del simulador: se corta en vez de tocar la base.
  return new Proxy(simulado as Repositorio, {
    get(destino, nombre: string) {
      const f = destino[nombre as keyof Repositorio];
      if (f) return f;
      return () => Promise.reject(new Error(`simulador: ${nombre} no está permitido`));
    },
  });
}

export async function simularTurno(p: {
  real: Repositorio;
  cerebro: Cerebro;
  corredor: Corredor;
  estado: EstadoSimulacion;
  texto: string;
  ahora: Date;
}): Promise<{ turno: TurnoSimulado; estado: EstadoSimulacion }> {
  const estado = structuredClone(p.estado);
  const turno: TurnoSimulado = { respuestas: [], avisos: [], intencion: null, resultado: "", accionAgenda: null, error: false };
  const corredor: Corredor = {
    ...p.corredor,
    whatsapp_phone_number_id: PNID,
    whatsapp_corredor: CORREDOR_SIMULADO,
    // En la prueba se ve lo que la asistente diría, aunque en vivo esté en piloto en sombra.
    respuesta_automatica: true,
  };
  let n = 0;
  const whatsapp: EnviadorWhatsApp = {
    texto: async (_p, para, cuerpo) => {
      if (para === CLIENTE) turno.respuestas.push(cuerpo);
      return `sim.${++n}`;
    },
    imagen: async () => `sim.${++n}`,
    documento: async () => `sim.${++n}`,
    plantilla: async (_p, para, _nombre, parametros) => {
      if (para === CORREDOR_SIMULADO) turno.avisos.push(parametros.join(" "));
      return `sim.${++n}`;
    },
  };
  const r = await procesarMensaje(
    {
      repo: repoSimulado(p.real, corredor, estado, turno),
      cerebro: p.cerebro,
      whatsapp,
      plantillaAviso: "simulacion",
      plantillaRecordatorio: "simulacion",
      ahora: () => p.ahora,
      registrar: (evento) => {
        if (evento.startsWith("error_")) turno.error = true;
      },
    },
    {
      phoneNumberId: PNID,
      waMessageId: `sim.entrante.${Date.now()}.${Math.random()}`,
      telefono: CLIENTE,
      nombrePerfil: "Cliente de prueba",
      tipo: "texto",
      texto: p.texto.slice(0, MAX_TEXTO_SIMULACION),
      timestamp: p.ahora,
    },
  );
  turno.resultado = r.tipo;
  turno.accionAgenda = "accion" in r && r.tipo === "agenda" ? r.accion : null;
  return { turno, estado };
}
