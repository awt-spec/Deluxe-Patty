import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Correccion, Corredor, Intencion, Mensaje, Propiedad, PropiedadConFotos } from "../datos/tipos";
import type { AnuncioE24 } from "../encuentra24/parsear";
import { consumo, sumar as sumarConsumo, type Consumo } from "./costo";
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

export interface AnuncioPreparado {
  tituloEs: string;
  descripcionEs: string;
  tituloEn: string;
  descripcionEn: string;
  /** Números de foto (1 = primera de la propiedad) en el orden sugerido, con lo que muestran. */
  ordenFotos: { foto: number; muestra: string }[];
  sugerencias: string[];
  consumo: Consumo;
}

export interface ClasificacionAnuncio {
  esDueno: boolean;
  puntaje: number;
  senales: string[];
  consumo: Consumo;
}

export interface Cerebro {
  clasificar(corredor: Corredor, historial: Mensaje[], mensaje: string): Promise<Clasificacion>;
  responder(
    corredor: Corredor,
    propiedades: Propiedad[],
    historial: Mensaje[],
    mensaje: string,
    /** Correcciones recientes del corredor a borradores: ejemplos de su tono. */
    correcciones?: Correccion[],
  ): Promise<Respuesta>;
  prepararAnuncio(corredor: Corredor, propiedad: PropiedadConFotos): Promise<AnuncioPreparado>;
  /** Dueño directo o corredor, para la búsqueda semanal. */
  clasificarAnuncio(anuncio: AnuncioE24, publicacionesDelAnunciante: number): Promise<ClasificacionAnuncio>;
  /** Análisis a pedido del corredor: propiedad u oferta (enlace o datos). */
  analizar(corredor: Corredor, propiedades: Propiedad[], historial: Mensaje[], mensaje: string): Promise<Respuesta>;
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

const EsquemaAnuncio = z.object({
  titulo_es: z.string(),
  descripcion_es: z.string(),
  titulo_en: z.string(),
  descripcion_en: z.string(),
  orden_fotos: z.array(z.object({ foto: z.number().int(), muestra: z.string() })),
  sugerencias: z.array(z.string()),
});

const EsquemaDueno = z.object({
  es_dueno: z.boolean(),
  puntaje: z.number().int(),
  senales: z.array(z.string()),
});

/** Máximo de fotos que se le muestran al modelo para sugerir el orden. */
export const MAX_FOTOS_ANUNCIO = 20;

const EsquemaAgenda = z.object({
  accion: z.enum(["proponer", "confirmar", "cancelar", "confirmar_asistencia", "responder"]),
  horarios: z.array(z.string()),
  cita_id: z.string().nullable(),
  propiedad_codigo: z.string().nullable(),
  mensaje: z.string(),
  avisar_corredor: z.boolean(),
  motivo_aviso: z.string().nullable(),
});

/** Con quién habla la asistente: un cliente o el propio corredor. */
type Interlocutor = "cliente" | "corredor";

function transcripcion(historial: Mensaje[], interlocutor: Interlocutor): string {
  // En la conversación con el corredor, sus mensajes entran con autor "cliente" (es quien escribe).
  const etiqueta = (autor: Mensaje["autor"]) =>
    autor === "cliente" ? (interlocutor === "corredor" ? "Corredor" : "Cliente") : autor === "corredor" ? "Corredor" : "Asistente";
  return historial
    .filter((m) => m.contenido && m.estado_borrador !== "pendiente" && m.estado_borrador !== "descartado")
    .map((m) => `${etiqueta(m.autor)}: ${m.contenido}`)
    .join("\n");
}

function mensajeUsuario(historial: Mensaje[], mensaje: string, interlocutor: Interlocutor = "cliente"): string {
  const previo = transcripcion(historial, interlocutor);
  const etiqueta = `mensaje_del_${interlocutor}`;
  return [
    previo ? `<conversacion_previa>\n${previo}\n</conversacion_previa>` : "<conversacion_previa>(ninguna)</conversacion_previa>",
    `<${etiqueta}>\n${mensaje}\n</${etiqueta}>`,
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

    async responder(corredor, propiedades, historial, mensaje, correcciones = []) {
      // Bloque estable por corredor (instrucciones, tono, propiedades) primero, para aprovechar la caché.
      const ejemplos = correcciones.length
        ? `<correcciones_del_corredor>\nAsí corrigió el corredor respuestas tuyas; escribe como en la versión corregida.\n${correcciones
            .map((c) => `Tú escribiste: ${c.original}\nEl corredor lo dejó así: ${c.corregido}`)
            .join("\n---\n")}\n</correcciones_del_corredor>`
        : null;
      const system = [instruccion("responder"), ...contextoCorredor(corredor, propiedades), ejemplos]
        .filter(Boolean)
        .join("\n\n");

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

    async prepararAnuncio(corredor, propiedad) {
      const fotos = [...propiedad.fotos]
        .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0))
        .slice(0, MAX_FOTOS_ANUNCIO);
      const pedir = async (conFotos: boolean) => {
        const contenido: Anthropic.Beta.BetaContentBlockParam[] = [];
        if (conFotos) {
          fotos.forEach((f, i) => {
            contenido.push({ type: "text", text: `Foto ${i + 1}:` });
            contenido.push({ type: "image", source: { type: "url", url: f.url } });
          });
        }
        contenido.push({
          type: "text",
          text: `<propiedad>\n${fichaPropiedades([propiedad])}\n</propiedad>\n\n${
            conFotos ? "" : "(No hay fotos disponibles: deja orden_fotos vacío.)"
          }`,
        });
        return client.beta.messages.parse({
          model: MODELO_REDACTAR,
          max_tokens: 8000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium", format: betaZodOutputFormat(EsquemaAnuncio) },
          system: `${instruccion("anuncio")}\n\n<corredor>\n${corredor.nombre_contacto}, de ${corredor.nombre}.\n</corredor>`,
          messages: [{ role: "user", content: contenido }],
        });
      };
      let res;
      try {
        res = await pedir(fotos.length > 0);
      } catch (error) {
        // Una foto que la API no puede descargar hace fallar todo el pedido: se reintenta sin fotos.
        if (fotos.length === 0 || !(error instanceof Anthropic.BadRequestError)) throw error;
        res = await pedir(false);
      }
      const c = consumo(res.model, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Anuncio sin salida (stop_reason ${res.stop_reason})`);
      const o = res.parsed_output;
      return {
        tituloEs: o.titulo_es.trim(),
        descripcionEs: o.descripcion_es.trim(),
        tituloEn: o.titulo_en.trim(),
        descripcionEn: o.descripcion_en.trim(),
        ordenFotos: o.orden_fotos.filter((f) => f.foto >= 1 && f.foto <= fotos.length),
        sugerencias: o.sugerencias,
        consumo: c,
      };
    },

    async clasificarAnuncio(anuncio, publicaciones) {
      const datos = [
        `Título: ${anuncio.titulo}`,
        `Anunciante: ${anuncio.anunciante.nombre ?? "(sin nombre)"}${anuncio.anunciante.verificado ? " (cuenta verificada)" : ""}`,
        `Se declara: ${anuncio.tipoAnunciante ?? "(no dice)"}`,
        anuncio.anunciante.empresa ? `Empresa: ${anuncio.anunciante.empresa}` : null,
        anuncio.anunciante.licencia ? `Licencia: ${anuncio.anunciante.licencia}` : null,
        `Anuncios de esta cuenta en la búsqueda: ${publicaciones}`,
        `Destacado pagado: ${anuncio.destacado ?? "no"}`,
        `Precio: ${anuncio.precio ? `${anuncio.moneda ?? ""} ${anuncio.precio}` : "(no publicado)"}`,
        `Zona: ${anuncio.zona ?? "(no dice)"}`,
        `Descripción:\n${anuncio.descripcion.slice(0, 3000)}`,
      ]
        .filter(Boolean)
        .join("\n");
      const res = await client.beta.messages.parse({
        model: MODELO_CLASIFICAR,
        max_tokens: 2000,
        output_config: { effort: "low", format: betaZodOutputFormat(EsquemaDueno) },
        system: instruccion("dueno_o_corredor"),
        messages: [{ role: "user", content: `<anuncio>\n${datos}\n</anuncio>` }],
      });
      const c = consumo(MODELO_CLASIFICAR, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Clasificación de anuncio sin salida (stop_reason ${res.stop_reason})`);
      const o = res.parsed_output;
      return { esDueno: o.es_dueno, puntaje: Math.max(0, Math.min(100, o.puntaje)), senales: o.senales.slice(0, 4), consumo: c };
    },

    async analizar(corredor, propiedades, historial, mensaje) {
      const system = [
        instruccion("analizar"),
        `<corredor>\nNombre: ${corredor.nombre_contacto}, de ${corredor.nombre}.\n</corredor>`,
        `<propiedades_del_corredor>\n${fichaPropiedades(propiedades)}\n</propiedades_del_corredor>`,
      ].join("\n\n");
      const tools: Anthropic.Beta.BetaToolUnion[] = [
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3, max_content_tokens: 20_000 },
      ];
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        { role: "user", content: mensajeUsuario(historial, mensaje, "corredor") },
      ];
      let total: Consumo = { tokensEntrada: 0, tokensSalida: 0, costoUsd: 0 };
      const textos: string[] = [];
      // Las herramientas del servidor pueden pausar el turno (pause_turn): se reanuda reenviándolo.
      for (let vuelta = 0; vuelta < 4; vuelta++) {
        const res = await client.beta.messages.create({
          model: MODELO_REDACTAR,
          max_tokens: 8000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "medium" },
          system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
          tools,
          messages,
        });
        total = sumarConsumo(total, consumo(res.model, res.usage));
        if (res.stop_reason === "refusal") throw new RechazoModelo(total);
        for (const b of res.content) if (b.type === "text") textos.push(b.text);
        if (res.stop_reason !== "pause_turn") break;
        messages.push({ role: "assistant", content: res.content });
      }
      const texto = textos.join("").trim();
      if (!texto) throw new Error("Análisis sin texto");
      return { texto, avisarCorredor: null, consumo: total };
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
