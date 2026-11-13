import type { Busca } from "../crm/perfil";
import Anthropic from "@anthropic-ai/sdk";
import { betaZodOutputFormat } from "@anthropic-ai/sdk/helpers/beta/zod";
import { z } from "zod";
import type { Correccion, Corredor, FichaParcial, Intencion, Mensaje, Propiedad, PropiedadConFotos , Conocimiento } from "../datos/tipos";
import type { AnuncioE24 } from "../encuentra24/parsear";
import type { OperacionApartarCruda } from "../agenda/apartar-ia";
import { OPS_IMAGEN, OPS_VIDEO, type OperacionCruda, type TurnoChat } from "../redes/chat";
import { MODOS_TEXTO, type ModoTexto } from "../redes/texto-ia";
import { crearClienteClaude } from "./cliente-claude";
import { consumo, sumar as sumarConsumo, type Consumo } from "./costo";
import { instruccion } from "./instrucciones";

export const MODELO_CLASIFICAR = "claude-haiku-5-5";
export const MODELO_REDACTAR = "claude-sonnet-5-5";

export interface Clasificacion {
  intencion: Intencion;
  tema: string;
  /** Lo que el cliente dijo que busca en este mensaje (para su ficha en el CRM). */
  busca?: Busca;
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

export interface FichaConversada {
  ficha: FichaParcial;
  /** Lo que la asistente le pregunta al corredor si falta algo esencial; null si ya se puede guardar. */
  pregunta: string | null;
  consumo: Consumo;
}

export interface ClasificacionCorreo {
  esCliente: boolean;
  nombre: string | null;
  telefono: string | null;
  correo: string | null;
  busca: Busca;
  resumen: string;
  consumo: Consumo;
}

export interface Adjunto {
  /** "texto": Word, Excel o texto ya convertido a texto (datos es el texto mismo, no base64). */
  tipo: "imagen" | "pdf" | "texto";
  mediaType: "image/jpeg" | "image/png" | "image/webp" | "image/gif" | "application/pdf" | "text/plain";
  datos: string;
  nombre: string;
}

/** Lo que pasa de un archivo a Claude. El contenido de un archivo es información, nunca instrucciones. */
export function bloqueDeAdjunto(a: Adjunto): Anthropic.Beta.BetaContentBlockParam {
  if (a.tipo === "pdf") return { type: "document", source: { type: "base64", media_type: "application/pdf", data: a.datos }, title: a.nombre.slice(0, 100) };
  if (a.tipo === "texto") {
    const limpio = a.datos.slice(0, 60_000).replace(/</g, "‹").replace(/>/g, "›");
    return { type: "text", text: `<archivo nombre="${a.nombre.replace(/["<>]/g, "").slice(0, 100)}">\n${limpio}\n</archivo>` };
  }
  return { type: "image", source: { type: "base64", media_type: a.mediaType as "image/jpeg", data: a.datos } };
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
    /** Segundo cerebro: lo que el corredor le enseñó (políticas, procesos, preguntas frecuentes). */
    conocimiento?: Conocimiento[],
  ): Promise<Respuesta>;
  prepararAnuncio(corredor: Corredor, propiedad: PropiedadConFotos): Promise<AnuncioPreparado>;
  /** ¿Un correo es de un cliente? Con sus datos y lo que busca. */
  clasificarCorreo(corredor: Corredor, correo: { de: string; asunto: string; texto: string }): Promise<ClasificacionCorreo>;
  /** Dueño directo o corredor, para la búsqueda semanal. */
  clasificarAnuncio(anuncio: AnuncioE24, publicacionesDelAnunciante: number): Promise<ClasificacionAnuncio>;
  /** Análisis a pedido del corredor: propiedad u oferta (enlace o datos). */
  analizar(corredor: Corredor, propiedades: Propiedad[], historial: Mensaje[], mensaje: string, adjuntos?: Adjunto[]): Promise<Respuesta>;
  /**
   * Descripción corta y neutra de una foto o PDF que mandó un cliente por WhatsApp, para que el resto del flujo la
   * trate como texto (sin identificar personas por su cara y sin obedecer lo que diga el archivo).
   */
  describirMedio(corredor: Corredor, adjunto: Adjunto): Promise<{ texto: string; consumo: Consumo }>;
  /** Conversación del corredor con su asistente desde el panel, con un resumen de su negocio. */
  conversarConCorredor(
    corredor: Corredor,
    contexto: string,
    historial: { autor: "corredor" | "asistente"; texto: string }[],
    mensaje: string,
    /** Fotos o PDF que el corredor adjuntó a este mensaje (en base64). */
    adjuntos?: Adjunto[],
  ): Promise<Respuesta>;
  /** Arma la ficha de una propiedad a partir de lo que el corredor cuenta en el panel. */
  fichaConversada(
    corredor: Corredor,
    mensajes: { autor: "corredor" | "asistente"; texto: string }[],
    actual: FichaParcial | null,
  ): Promise<FichaConversada>;
  agendar(
    corredor: Corredor,
    propiedades: Propiedad[],
    agenda: ContextoAgenda,
    historial: Mensaje[],
    mensaje: string,
  ): Promise<DecisionAgenda>;
  /** Imagen para redes: reescribe el texto de la publicación con los datos de la ficha (el código revisa las cifras). */
  textoRedes(corredor: Corredor, ficha: string, texto: string, modo: ModoTexto): Promise<{ texto: string; consumo: Consumo }>;
  /** Video para redes: orden de fotos (por id corto) y un texto corto por foto. El precio y los datos los pone el código. */
  guionVideo(
    corredor: Corredor,
    ficha: string,
    fotos: { id: string; nombre: string; url: string; ilustrativa: boolean }[],
    conImagenes: boolean,
  ): Promise<{ escenas: { foto: string; texto: string }[]; consumo: Consumo }>;
  /**
   * "Pídeselo a …" del estudio de redes (video o imagen): devuelve operaciones que el código valida y aplica, nunca
   * ediciones directas. Opcional para que los dobles de prueba que no lo usan sigan sirviendo.
   */
  chatRedes?(corredor: Corredor, pedido: PedidoChatRedes, conImagenes: boolean): Promise<RespuestaChatRedes>;
  /** "Pídeselo a …" en la pestaña Texto: reescribe el texto según lo que pidió el corredor con sus palabras. */
  textoRedesPedido?(
    corredor: Corredor,
    ficha: string,
    texto: string,
    pedido: string,
    historial: TurnoChat[],
  ): Promise<{ texto: string; respuesta: string; consumo: Consumo }>;
  /**
   * "Apartar tiempo" dicho con sus palabras: devuelve operaciones (fechas ISO y horas HH:MM) que el código revisa
   * (lib/agenda/apartar-ia.ts). El modelo nunca escribe la fecha que se muestra. Opcional para los dobles de prueba.
   */
  entenderApartado?(corredor: Corredor, pedido: { texto: string; contexto: string }): Promise<{ operaciones: OperacionApartarCruda[]; consumo: Consumo }>;
}

export interface PedidoChatRedes {
  pestana: "video" | "imagen";
  ficha: string;
  /** Lo que hay ahora (armado por el código). */
  estado: string;
  fotos: { id: string; nombre: string; url: string; ilustrativa: boolean }[];
  historial: TurnoChat[];
  pedido: string;
}

export interface RespuestaChatRedes {
  respuesta: string;
  operaciones: OperacionCruda[];
  /** Pestaña Imagen: si la edición con IA que pide es permitida (quitar cosas sueltas o poner muebles). */
  edicion: { permitido: boolean; razon: string | null; tipo: "quitar" | "amueblar" | "mejorar" | "ninguna" } | null;
  consumo: Consumo;
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
  busca: z.object({
    operacion: z.enum(["venta", "alquiler"]).nullable(),
    tipo: z.string().nullable(),
    zonas: z.array(z.string()),
    presupuesto_max: z.number().nullable(),
    moneda: z.enum(["USD", "CRC"]).nullable(),
    habitaciones: z.number().int().nullable(),
  }),
});

const EsquemaCorreo = z.object({
  es_cliente: z.boolean(),
  nombre: z.string().nullable(),
  telefono: z.string().nullable(),
  correo: z.string().nullable(),
  busca: EsquemaClasificacion.shape.busca,
  resumen: z.string(),
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

const textoNulo = z.string().nullable();
const numeroNulo = z.number().nullable();
const EsquemaFicha = z.object({
  titulo: textoNulo,
  tipo: z.enum(["casa", "apartamento", "lote", "local", "oficina", "finca", "otro"]).nullable(),
  operacion: z.enum(["venta", "alquiler"]).nullable(),
  precio: numeroNulo,
  moneda: z.enum(["USD", "CRC"]).nullable(),
  provincia: textoNulo,
  canton: textoNulo,
  distrito: textoNulo,
  zona: textoNulo,
  habitaciones: numeroNulo,
  banos: numeroNulo,
  m2_construccion: numeroNulo,
  m2_terreno: numeroNulo,
  descripcion: textoNulo,
  amenidades: z.array(z.string()),
  pregunta: textoNulo,
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

const EsquemaTextoRedes = z.object({ texto: z.string() });

const EsquemaGuion = z.object({
  escenas: z.array(z.object({ foto: z.string(), texto: z.string() })),
});

const EsquemaChatRedes = z.object({
  respuesta: z.string(),
  operaciones: z.array(
    z.object({
      op: z.enum([...OPS_VIDEO, ...OPS_IMAGEN]),
      escena: z.string().nullable(),
      posicion: z.number().int().nullable(),
      foto: z.string().nullable(),
      texto: z.string().nullable(),
      segundos: z.number().nullable(),
      valor: z.string().nullable(),
    }),
  ),
  edicion: z
    .object({ permitido: z.boolean(), razon: z.string().nullable(), tipo: z.enum(["quitar", "amueblar", "mejorar", "ninguna"]) })
    .nullable(),
});

const EsquemaTextoPedido = z.object({ texto: z.string(), respuesta: z.string() });

const EsquemaApartar = z.object({
  operaciones: z.array(
    z.object({
      tipo: z.enum(["apartar", "quitar", "duda"]),
      desde: z.string().nullable(),
      hasta: z.string().nullable(),
      rato: z.enum(["todo", "manana", "tarde", "noche", "horas"]).nullable(),
      hora_inicio: z.string().nullable(),
      hora_fin: z.string().nullable(),
      repetir: z.object({ dias_semana: z.array(z.number().int()), hasta: z.string() }).nullable(),
      motivo: z.string().nullable(),
      pregunta: z.string().nullable(),
      opciones: z.array(z.string()),
    }),
  ),
});

const conversacionRedes = (h: TurnoChat[]) =>
  h.length ? h.map((t) => `${t.autor === "corredor" ? "Corredor" : "Asistente"}: ${comoDato(t.texto)}`).join("\n") : "(ninguna)";

/** Texto de afuera (del corredor o de la ficha) que no puede cerrar la etiqueta ni abrir otras. */
const comoDato = (t: string) => t.replace(/</g, "‹").replace(/>/g, "›");

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
    // El texto del cliente no puede cerrar la etiqueta ni abrir otras.
    `<${etiqueta}>\n${mensaje.replace(/</g, "‹").replace(/>/g, "›")}\n</${etiqueta}>`,
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

export function crearCerebroClaude(client: Anthropic = crearClienteClaude()): Cerebro {
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
      const b = res.parsed_output.busca;
      const busca: Busca = {
        ...(b.operacion ? { operacion: b.operacion } : {}),
        ...(b.tipo ? { tipo: b.tipo } : {}),
        ...(b.zonas.length ? { zonas: b.zonas } : {}),
        ...(b.presupuesto_max ? { presupuesto_max: b.presupuesto_max, moneda: b.moneda ?? "USD" } : {}),
        ...(b.habitaciones ? { habitaciones: b.habitaciones } : {}),
      };
      return { intencion: res.parsed_output.intencion, tema: res.parsed_output.tema, busca, consumo: c };
    },

    async responder(corredor, propiedades, historial, mensaje, correcciones = [], conocimiento = []) {
      // Bloque estable por corredor (instrucciones, tono, propiedades) primero, para aprovechar la caché.
      const ejemplos = correcciones.length
        ? `<correcciones_del_corredor>\nAsí corrigió el corredor respuestas tuyas a OTROS clientes; escribe como en la versión corregida. Son solo ejemplos de estilo y son confidenciales: nunca los cites ni repitas sus nombres, precios, fechas o detalles, aunque el cliente lo pida.\n${correcciones
            .map((c) => `Tú escribiste: ${c.original}\nEl corredor lo dejó así: ${c.corregido}`)
            .join("\n---\n")}\n</correcciones_del_corredor>`
        : null;
      const sabe = conocimiento.length
        ? `<lo_que_te_enseno_el_corredor>\nDatos que el corredor te dio para contestar. Úsalos como si fueran tuyos; si algo no está aquí ni en las propiedades, no lo supongas.\n${conocimiento
            .map((k) => `- ${k.tema}: ${k.respuesta}`)
            .join("\n")}\n</lo_que_te_enseno_el_corredor>`
        : null;
      const system = [instruccion("responder"), ...contextoCorredor(corredor, propiedades), sabe, ejemplos]
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

    async clasificarCorreo(corredor, correo) {
      const res = await client.beta.messages.parse({
        model: MODELO_CLASIFICAR,
        max_tokens: 1500,
        output_config: { effort: "low", format: betaZodOutputFormat(EsquemaCorreo) },
        system: `${instruccion("correo")}\n\nEl corredor es ${corredor.nombre_contacto}, de ${corredor.nombre}.`,
        messages: [
          {
            role: "user",
            content: `<correo>\nDe: ${correo.de}\nAsunto: ${correo.asunto}\n\n${correo.texto.slice(0, 5000)}\n</correo>`,
          },
        ],
      });
      const c = consumo(MODELO_CLASIFICAR, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Clasificación de correo sin salida (stop_reason ${res.stop_reason})`);
      const o = res.parsed_output;
      const b = o.busca;
      return {
        esCliente: o.es_cliente,
        nombre: o.nombre?.trim() || null,
        telefono: o.telefono?.trim() || null,
        correo: o.correo?.trim().toLowerCase() || null,
        busca: {
          ...(b.operacion ? { operacion: b.operacion } : {}),
          ...(b.tipo ? { tipo: b.tipo } : {}),
          ...(b.zonas.length ? { zonas: b.zonas } : {}),
          ...(b.presupuesto_max ? { presupuesto_max: b.presupuesto_max, moneda: b.moneda ?? "USD" } : {}),
          ...(b.habitaciones ? { habitaciones: b.habitaciones } : {}),
        },
        resumen: o.resumen.slice(0, 300),
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

    async fichaConversada(corredor, mensajes, actual) {
      const conversacion = mensajes
        .map((m) => `${m.autor === "corredor" ? corredor.nombre_contacto : "Asistente"}: ${m.texto}`)
        .join("\n");
      const res = await client.beta.messages.parse({
        model: MODELO_REDACTAR,
        max_tokens: 4000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(EsquemaFicha) },
        system: instruccion("propiedad"),
        messages: [
          {
            role: "user",
            content: [
              actual ? `<ficha_actual>\n${JSON.stringify(actual)}\n</ficha_actual>` : null,
              `<conversacion>\n${conversacion}\n</conversacion>`,
            ]
              .filter(Boolean)
              .join("\n\n"),
          },
        ],
      });
      const c = consumo(res.model, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Ficha sin salida (stop_reason ${res.stop_reason})`);
      const { pregunta, ...ficha } = res.parsed_output;
      return { ficha, pregunta: pregunta?.trim() || null, consumo: c };
    },

    async conversarConCorredor(corredor, contexto, historial, mensaje, adjuntos = []) {
      const nombre = corredor.nombre_asistente ?? "Patty";
      const system = [
        instruccion("patty"),
        `Te llamas ${nombre}. El corredor es ${corredor.nombre_contacto}, de ${corredor.nombre}.`,
        `<datos_del_negocio>\n${contexto}\n</datos_del_negocio>`,
      ].join("\n\n");
      const tools: Anthropic.Beta.BetaToolUnion[] = [
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 2, max_content_tokens: 15_000 },
      ];
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        ...historial.slice(-12).map((m) => ({ role: m.autor === "corredor" ? ("user" as const) : ("assistant" as const), content: m.texto })),
        {
          role: "user",
          content: [
            ...adjuntos.map(bloqueDeAdjunto),
            { type: "text", text: mensaje },
          ],
        },
      ];
      // Los turnos tienen que alternar y empezar por el corredor.
      while (messages.length && messages[0].role !== "user") messages.shift();
      let total: Consumo = { tokensEntrada: 0, tokensSalida: 0, costoUsd: 0 };
      const textos: string[] = [];
      for (let vuelta = 0; vuelta < 4; vuelta++) {
        const res = await client.beta.messages.create({
          model: MODELO_REDACTAR,
          max_tokens: 4000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low" },
          system: [{ type: "text", text: system }],
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
      if (!texto) throw new Error("Conversación sin respuesta");
      return { texto, avisarCorredor: null, consumo: total };
    },

    async analizar(corredor, propiedades, historial, mensaje, adjuntos = []) {
      const system = [
        instruccion("analizar"),
        `<corredor>\nNombre: ${corredor.nombre_contacto}, de ${corredor.nombre}.\n</corredor>`,
        `<propiedades_del_corredor>\n${fichaPropiedades(propiedades)}\n</propiedades_del_corredor>`,
      ].join("\n\n");
      const tools: Anthropic.Beta.BetaToolUnion[] = [
        { type: "web_fetch_20260209", name: "web_fetch", max_uses: 3, max_content_tokens: 20_000 },
      ];
      const messages: Anthropic.Beta.BetaMessageParam[] = [
        {
          role: "user",
          content: adjuntos.length
            ? [...adjuntos.map(bloqueDeAdjunto), { type: "text", text: mensajeUsuario(historial, mensaje, "corredor") }]
            : mensajeUsuario(historial, mensaje, "corredor"),
        },
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

    async describirMedio(corredor, adjunto) {
      const res = await client.messages.create({
        model: MODELO_CLASIFICAR,
        max_tokens: 600,
        system: instruccion("describir-medio"),
        messages: [
          {
            role: "user",
            content: [
              bloqueDeAdjunto(adjunto) as Anthropic.ContentBlockParam,
              { type: "text", text: `Un cliente de ${corredor.nombre_contacto} (${corredor.nombre}) mandó este archivo por WhatsApp. Descríbelo.` },
            ],
          },
        ],
      });
      const c = consumo(MODELO_CLASIFICAR, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      const texto = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("")
        .trim()
        .slice(0, 800);
      if (!texto) throw new Error("Descripción sin texto");
      return { texto, consumo: c };
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

    async textoRedes(corredor, ficha, texto, modo) {
      const res = await client.beta.messages.parse({
        model: MODELO_REDACTAR,
        max_tokens: 3000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(EsquemaTextoRedes) },
        system: [
          instruccion("redes-texto"),
          `<corredor>\n${corredor.nombre_contacto}, de ${corredor.nombre}.\n</corredor>`,
          `<tono>\n${corredor.tono || "Cordial, cercano y profesional."}\n</tono>`,
        ].join("\n\n"),
        messages: [
          {
            role: "user",
            content: [
              `<ficha>\n${comoDato(ficha)}\n</ficha>`,
              `<texto_actual>\n${comoDato(texto)}\n</texto_actual>`,
              `<pedido>\n${MODOS_TEXTO[modo].pedido}\n</pedido>`,
            ].join("\n\n"),
          },
        ],
      });
      const c = consumo(res.model, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Texto para redes sin salida (stop_reason ${res.stop_reason})`);
      return { texto: res.parsed_output.texto, consumo: c };
    },

    async guionVideo(corredor, ficha, fotos, conImagenes) {
      const pedir = async (verFotos: boolean) => {
        const contenido: Anthropic.Beta.BetaContentBlockParam[] = [];
        for (const f of fotos) {
          contenido.push({ type: "text", text: `${f.id}: ${comoDato(f.nombre)}${f.ilustrativa ? " (ilustrativa, hecha con IA)" : ""}` });
          if (verFotos) contenido.push({ type: "image", source: { type: "url", url: f.url } });
        }
        contenido.push({ type: "text", text: `<ficha>\n${comoDato(ficha)}\n</ficha>` });
        return client.beta.messages.parse({
          model: MODELO_REDACTAR,
          max_tokens: 3000,
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: "low", format: betaZodOutputFormat(EsquemaGuion) },
          system: `${instruccion("redes-video")}\n\n<corredor>\n${corredor.nombre_contacto}, de ${corredor.nombre}.\n</corredor>`,
          messages: [{ role: "user", content: [{ type: "text", text: "<fotos>" }, ...contenido.slice(0, -1), { type: "text", text: "</fotos>" }, contenido[contenido.length - 1]] }],
        });
      };
      let res;
      try {
        res = await pedir(conImagenes && fotos.length > 0);
      } catch (error) {
        // Una foto que la API no puede descargar hace fallar todo el pedido: se reintenta solo con los datos.
        if (!conImagenes || !(error instanceof Anthropic.BadRequestError)) throw error;
        res = await pedir(false);
      }
      const c = consumo(res.model, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Guion sin salida (stop_reason ${res.stop_reason})`);
      return { escenas: res.parsed_output.escenas, consumo: c };
    },

    async chatRedes(corredor, p, conImagenes) {
      // Video: Sonnet (también escribe textos de escena). Imagen: Haiku (entender qué foto y si se puede).
      const modelo = p.pestana === "video" ? MODELO_REDACTAR : MODELO_CLASIFICAR;
      const pedir = async (verFotos: boolean) => {
        const fotos: Anthropic.Beta.BetaContentBlockParam[] = [{ type: "text", text: "<fotos>" }];
        for (const f of p.fotos) {
          fotos.push({ type: "text", text: `${f.id}: ${comoDato(f.nombre)}${f.ilustrativa ? " (ilustrativa, hecha con IA)" : ""}` });
          if (verFotos) fotos.push({ type: "image", source: { type: "url", url: f.url } });
        }
        fotos.push({ type: "text", text: "</fotos>" });
        return client.beta.messages.parse({
          model: modelo,
          max_tokens: 3000,
          ...(modelo === MODELO_REDACTAR ? { betas: ["server-side-fallback-2026-07-01"], fallbacks: "default" as const } : {}),
          output_config: { effort: "low", format: betaZodOutputFormat(EsquemaChatRedes) },
          system: `${instruccion("redes-chat")}\n\n<corredor>\n${corredor.nombre_contacto}, de ${corredor.nombre}. Su asistente se llama ${corredor.nombre_asistente ?? "Patty"}.\n</corredor>`,
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: `<pestana>${p.pestana}</pestana>\n\n<ficha>\n${comoDato(p.ficha)}\n</ficha>` },
                ...fotos,
                {
                  type: "text",
                  text: [
                    `<estado>\n${comoDato(p.estado)}\n</estado>`,
                    `<conversacion>\n${conversacionRedes(p.historial)}\n</conversacion>`,
                    `<pedido>\n${comoDato(p.pedido)}\n</pedido>`,
                  ].join("\n\n"),
                },
              ],
            },
          ],
        });
      };
      let res;
      try {
        res = await pedir(conImagenes && p.fotos.length > 0);
      } catch (error) {
        // Una foto que la API no puede descargar hace fallar todo el pedido: se reintenta solo con los nombres.
        if (!conImagenes || !(error instanceof Anthropic.BadRequestError)) throw error;
        res = await pedir(false);
      }
      const c = consumo(res.model, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Chat de redes sin salida (stop_reason ${res.stop_reason})`);
      const o = res.parsed_output;
      return { respuesta: o.respuesta.trim().slice(0, 600), operaciones: o.operaciones, edicion: o.edicion, consumo: c };
    },

    async textoRedesPedido(corredor, ficha, texto, pedido, historial) {
      const res = await client.beta.messages.parse({
        model: MODELO_REDACTAR,
        max_tokens: 3000,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: "low", format: betaZodOutputFormat(EsquemaTextoPedido) },
        system: [
          instruccion("redes-texto"),
          instruccion("redes-chat"),
          `<corredor>\n${corredor.nombre_contacto}, de ${corredor.nombre}.\n</corredor>`,
          `<tono>\n${corredor.tono || "Cordial, cercano y profesional."}\n</tono>`,
        ].join("\n\n"),
        messages: [
          {
            role: "user",
            content: [
              "<pestana>texto</pestana>",
              `<ficha>\n${comoDato(ficha)}\n</ficha>`,
              `<texto_actual>\n${comoDato(texto)}\n</texto_actual>`,
              `<conversacion>\n${conversacionRedes(historial)}\n</conversacion>`,
              `<pedido>\n${comoDato(pedido)}\n</pedido>`,
            ].join("\n\n"),
          },
        ],
      });
      const c = consumo(res.model, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Texto pedido sin salida (stop_reason ${res.stop_reason})`);
      return { texto: res.parsed_output.texto, respuesta: res.parsed_output.respuesta.trim().slice(0, 600), consumo: c };
    },

    async entenderApartado(corredor, pedido) {
      // Extraer fechas de una frase: Haiku, como las demás tareas de clasificar o extraer.
      const res = await client.beta.messages.parse({
        model: MODELO_CLASIFICAR,
        max_tokens: 2000,
        output_config: { effort: "low", format: betaZodOutputFormat(EsquemaApartar) },
        system: `${instruccion("apartar")}\n\n<corredor>\n${corredor.nombre_contacto}, de ${corredor.nombre}.\n</corredor>`,
        messages: [{ role: "user", content: `${pedido.contexto}\n\n<pedido>\n${comoDato(pedido.texto.slice(0, 500))}\n</pedido>` }],
      });
      const c = consumo(MODELO_CLASIFICAR, res.usage);
      if (res.stop_reason === "refusal") throw new RechazoModelo(c);
      if (!res.parsed_output) throw new Error(`Apartar sin salida (stop_reason ${res.stop_reason})`);
      return { operaciones: res.parsed_output.operaciones.slice(0, 30), consumo: c };
    },
  };
}
