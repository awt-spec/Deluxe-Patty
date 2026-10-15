import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Corredor, Intencion, Mensaje, Propiedad } from "../datos/tipos";
import { consumo, type Consumo } from "./costo";
import { instruccion } from "./instrucciones";

export const MODELO_CLASIFICAR = "claude-haiku-5-5";
export const MODELO_REDACTAR = "claude-sonnet-5-5";

export interface Clasificacion {
  intencion: Intencion;
  tema: string;
  consumo: Consumo;
}

export interface Respuesta {
  texto: string;
  avisarCorredor: string | null;
  consumo: Consumo;
}

export type AccionAgenda = "proponer" | "confirmar" | "cancelar" | "confirmar_asistencia" | "responder";

export interface ContextoAgenda {
  /** Horarios libres, con id corto ("H1", "H2", …) y etiqueta legible. */
  libres: { id: string; etiqueta: string }[];
  /** Visitas activas del cliente, con id corto ("C1", …). */
  citasCliente: { id: string; etiqueta: string; propiedad: string | null }[];
}

export interface DecisionAgenda {
  accion: AccionAgenda;
  horarios: string[];
  citaId: string | null;
  propiedadCodigo: string | null;
  mensaje: string;
  avisarCorredor: string | null;
  consumo: Consumo;
}

export interface Cerebro {
  clasificar(corredor: Corredor, historial: Mensaje[], mensaje: string): Promise<Clasificacion>;
  responder(corredor: Corredor, propiedades: Propiedad[], historial: Mensaje[], mensaje: string): Promise<Respuesta>;
  agendar(
    corredor: Corredor,
    propiedades: Propiedad[],
    agenda: ContextoAgenda,
    historial: Mensaje[],
    mensaje: string,
  ): Promise<DecisionAgenda>;
}

/** El modelo se negó a responder (stop_reason "refusal"); el mensaje se pasa al corredor. */
export class RechazoModelo extends Error {
  constructor(public readonly consumo: Consumo) {
    super("El modelo declinó el mensaje");
  }
}

const EsquemaClasificacion = z.object({
  intencion: z.enum(["consulta_propiedad", "agendar_visita", "otro", "pasar_a_corredor"]),
  tema: z.string(),
});

const EsquemaRespuesta = z.object({
  respuesta: z.string(),
  avisar_corredor: z.boolean(),
  motivo_aviso: z.string().nullable(),
});

const EsquemaAgenda = z.object({
  accion: z.enum(["proponer", "confirmar", "cancelar", "confirmar_asistencia", "responder"]),
  horarios: z.array(z.string()),
  cita_id: z.string().nullable(),
  propiedad_codigo: z.string().nullable(),
  mensaje: z.string(),
  avisar_corredor: z.boolean(),
  motivo_aviso: z.string().nullable(),
});

function transcripcion(historial: Mensaje[]): string {
  return historial
    .filter((m) => m.contenido && m.estado_borrador !== "pendiente" && m.estado_borrador !== "descartado")
    .map((m) => `${m.autor === "cliente" ? "Cliente" : m.autor === "corredor" ? "Corredor" : "Asistente"}: ${m.contenido}`)
    .join("\n");
}

function mensajeUsuario(historial: Mensaje[], mensaje: string): string {
  const previo = transcripcion(historial);
  return [
    previo ? `<conversacion_previa>\n${previo}\n</conversacion_previa>` : "<conversacion_previa>(ninguna)</conversacion_previa>",
    `<mensaje_del_cliente>\n${mensaje}\n</mensaje_del_cliente>`,
  ].join("\n\n");
}

export function fichaPropiedades(propiedades: Propiedad[]): string {
  if (propiedades.length === 0) return "(El corredor no tiene propiedades cargadas.)";
  return propiedades
    .map((p) => {
      const linea = (etiqueta: string, valor: unknown) =>
        valor === null || valor === undefined || valor === "" || (Array.isArray(valor) && valor.length === 0)
          ? null
          : `  ${etiqueta}: ${Array.isArray(valor) ? valor.join(", ") : valor}`;
      return [
        `- ${p.titulo} (código ${p.codigo})`,
        linea("Tipo", `${p.tipo} en ${p.operacion}`),
        linea("Precio", p.precio === null ? null : `${p.moneda} ${p.precio.toLocaleString("en-US")}`),
        linea("Ubicación", [p.distrito, p.canton, p.provincia].filter(Boolean).join(", ")),
        linea("Zona", p.zona),
        linea("Habitaciones", p.habitaciones),
        linea("Baños", p.banos),
        linea("Construcción m²", p.m2_construccion),
        linea("Terreno m²", p.m2_terreno),
        linea("Amenidades", p.amenidades),
        linea("Descripción", p.descripcion),
        linea("Estado", p.estado === "reservada" ? "reservada (no disponible por ahora)" : null),
        linea("Enlace", p.url_e24),
      ]
        .filter(Boolean)
        .join("\n");
    })
    .join("\n");
}

function contextoCorredor(corredor: Corredor, propiedades: Propiedad[]): string[] {
  return [
    `<corredor>\nNombre: ${corredor.nombre_contacto}, de ${corredor.nombre}.\n</corredor>`,
    `<tono>\n${corredor.tono || "Cordial, cercano y profesional. Tutea si el cliente tutea."}\n</tono>`,
    `<temas_que_atiende_en_persona>\n${corredor.reglas_escalamiento.join("\n")}\n</temas_que_atiende_en_persona>`,
    `<propiedades>\n${fichaPropiedades(propiedades)}\n</propiedades>`,
  ];
}

export function crearCerebroClaude(client = new Anthropic()): Cerebro {
  return {
    async clasificar(corredor, historial, mensaje) {
      const reglas = corredor.reglas_escalamiento.length
        ? corredor.reglas_escalamiento.map((r) => `- ${r}`).join("\n")
        : "- (ninguno adicional)";
      const res = await client.beta.messages.parse({
        model: MODELO_CLASIFICAR,
        max_tokens: 2000,
        output_config: { effort: "low", format: betaZodOutputFormat(EsquemaClasificacion) },
        system: `${instruccion("clasificar")}\n\nTemas que ${corredor.nombre_contacto} atiende en persona:\n${reglas}`,
        messages: [{ role: "user", content: mensajeUsuario(historial, mensaje) }],
      });
      const c = consumo(MODELO_CLASIFICAR, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Clasificación sin salida (stop_reason ${res.stop_reason})`);
      return { intencion: res.parsed_output.intencion, tema: res.parsed_output.tema, consumo: c };
    },

    async responder(corredor, propiedades, historial, mensaje) {
      // Bloque estable por corredor (instrucciones, tono, propiedades) primero, para aprovechar la caché.
      const system = [instruccion("responder"), ...contextoCorredor(corredor, propiedades)].join("\n\n");

      const res = await client.beta.messages.parse({
        model: MODELO_REDACTAR,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(EsquemaRespuesta) },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [{ role: "user", content: mensajeUsuario(historial, mensaje) }],
      });
      // El costo usa el modelo que respondió de verdad (puede ser el de respaldo).
      const c = consumo(res.model, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Respuesta sin salida (stop_reason ${res.stop_reason})`);
      const { respuesta, avisar_corredor, motivo_aviso } = res.parsed_output;
      return {
        texto: respuesta.trim(),
        avisarCorredor: avisar_corredor ? motivo_aviso?.trim() || "Revisar conversación" : null,
        consumo: c,
      };
    },

    async agendar(corredor, propiedades, agenda, historial, mensaje) {
      const system = [instruccion("agendar"), ...contextoCorredor(corredor, propiedades)].join("\n\n");
      // La agenda cambia con cada mensaje: va en el turno del usuario, después del bloque cacheado.
      const libres = agenda.libres.length
        ? agenda.libres.map((h) => `${h.id}: ${h.etiqueta}`).join("\n")
        : "(no hay horarios libres)";
      const citas = agenda.citasCliente.length
        ? agenda.citasCliente.map((c) => `${c.id}: ${c.etiqueta}${c.propiedad ? `, ${c.propiedad}` : ""}`).join("\n")
        : "(ninguna)";
      const res = await client.beta.messages.parse({
        model: MODELO_REDACTAR,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(EsquemaAgenda) },
        system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
        messages: [
          {
            role: "user",
            content: [
              `<horarios_libres>\n${libres}\n</horarios_libres>`,
              `<visitas_del_cliente>\n${citas}\n</visitas_del_cliente>`,
              mensajeUsuario(historial, mensaje),
            ].join("\n\n"),
          },
        ],
      });
      const c = consumo(res.model, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Agenda sin salida (stop_reason ${res.stop_reason})`);
      const o = res.parsed_output;
      return {
        accion: o.accion,
        horarios: o.horarios,
        citaId: o.cita_id,
        propiedadCodigo: o.propiedad_codigo,
        mensaje: o.mensaje.trim(),
        avisarCorredor: o.avisar_corredor ? o.motivo_aviso?.trim() || "Revisar conversación" : null,
        consumo: c,
      };
    },
  };
}
