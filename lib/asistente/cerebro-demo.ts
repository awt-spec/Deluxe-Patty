import type { Cerebro, Clasificacion, DecisionAgenda, Respuesta } from "./cerebro";
import { causaFallaIA, type CausaFallaIA } from "./falla-ia";
import type { Consumo } from "./costo";
import type { Intencion } from "../datos/tipos";

// La demo (corredor inactivo, datos ficticios) usa la IA de verdad cuando está disponible y dentro de los topes de la
// plataforma. Si la IA falla (llave, saldo, red), la demo no se rompe: Patty y "Probar la asistente"
// contestan con una respuesta de muestra armada por el código, marcada como tal, sin cifras inventadas (solo lo que
// ya está en los datos de la demo) y sin gastar. Lo que falló se avisa igual (`alFallar`), para que soporte lo vea.

export const MARCA_MUESTRA = "(Respuesta de muestra: en la demostración la IA no está disponible ahora mismo.)";

const SIN_CONSUMO: Consumo = { tokensEntrada: 0, tokensSalida: 0, costoUsd: 0 };

/** Pantallas del panel que la muestra sabe señalar: palabra que las nombra → enlace y paso de la guía. */
const PANTALLAS: [RegExp, string, string][] = [
  [/horario/i, "Horario de visitas", "/panel/agenda/horario"],
  [/apart|bloque|vacacion/i, "Apartar tiempo", "/panel/agenda/bloquear"],
  [/agenda|visita|cita/i, "Agenda", "/panel/agenda"],
  [/client|crm|prospect/i, "Clientes", "/panel/clientes"],
  [/casa|propiedad|ficha/i, "Mis casas", "/panel/propiedades"],
  [/revis|pendiente|respuesta/i, "Revisar", "/panel/revisar"],
  [/ajuste|nombre|tono|configur/i, "Ajustes", "/panel/ajustes"],
];

function seccion(contexto: string, titulo: string): string | null {
  const i = contexto.indexOf(`${titulo}\n`);
  if (i < 0) return null;
  const resto = contexto.slice(i + titulo.length + 1);
  const fin = resto.indexOf("\n\n");
  return (fin < 0 ? resto : resto.slice(0, fin)).trim() || null;
}

/** Respuesta de Patty sin IA: dónde está algo del panel (con su paso de guía) o el plan de hoy, que arma el código. */
export function respuestaPattyDemo(contexto: string, mensaje: string): string {
  const donde = /d[oó]nde|c[oó]mo (cambio|hago|veo|agrego)|ll[eé]vame|ens[eé]ñame/i.test(mensaje);
  const pantalla = donde ? PANTALLAS.find(([re]) => re.test(mensaje)) : undefined;
  if (pantalla) {
    const [, nombre, ruta] = pantalla;
    return `${MARCA_MUESTRA}\n\nLo encuentras en [${nombre}](${ruta}). Te llevo.\n\n<<ir ${ruta}>>`;
  }
  // La fecha sale de la línea «Ahora:» (hoy, armada por el código), no del encabezado del plan.
  const hoy = /^Ahora: (.+?), \d{1,2}:\d{2}/m.exec(contexto)?.[1];
  const plan = seccion(contexto, "Plan de hoy:")?.replace(/^\*Buenos días[^\n]*\n*/, "").trim();
  return [
    MARCA_MUESTRA,
    plan ? `Esto es lo que tienes hoy${hoy ? ` (${hoy})` : ""}:\n\n${plan}` : `Hoy${hoy ? ` (${hoy})` : ""} no veo nada pendiente en tu agenda.`,
    "Pregúntame dónde está algo del panel (por ejemplo, «¿dónde cambio mi horario?») y te llevo.",
  ].join("\n\n");
}

function intencionDemo(mensaje: string): Intencion {
  if (/descuento|rebaj|negoci|oferta|comisi|queja|reclamo|hablar con/i.test(mensaje)) return "pasar_a_corredor";
  if (/visita|ver (la|el|esa|esta)|conocer|agendar|cita|cu[aá]ndo puedo/i.test(mensaje)) return "agendar_visita";
  if (/casa|apartamento|propiedad|lote|terreno|alquil|venta|compr|precio|habitaci/i.test(mensaje)) return "consulta_propiedad";
  return "otro";
}

/**
 * Envuelve el cerebro de un corredor inactivo (la demo): si la IA falla, contesta con una muestra en vez de romperse.
 * Las demás funciones pasan tal cual.
 */
export function cerebroDemo(real: Cerebro, alFallar: (causa: CausaFallaIA, error: unknown) => void = () => {}): Cerebro {
  const respaldo = async <T,>(llamada: () => Promise<T>, muestra: () => T): Promise<T> => {
    try {
      return await llamada();
    } catch (error) {
      alFallar(causaFallaIA(error), error);
      return muestra();
    }
  };
  return {
    ...real,
    conversarConCorredor: (corredor, contexto, historial, mensaje, adjuntos) =>
      respaldo<Respuesta>(
        () => real.conversarConCorredor(corredor, contexto, historial, mensaje, adjuntos),
        () => ({ texto: respuestaPattyDemo(contexto, mensaje), avisarCorredor: null, consumo: SIN_CONSUMO }),
      ),
    clasificar: (corredor, historial, mensaje) =>
      respaldo<Clasificacion>(
        () => real.clasificar(corredor, historial, mensaje),
        () => ({ intencion: intencionDemo(mensaje), tema: "demostración", busca: {}, consumo: SIN_CONSUMO }),
      ),
    responder: (corredor, propiedades, historial, mensaje, correcciones, conocimiento) =>
      respaldo<Respuesta>(
        () => real.responder(corredor, propiedades, historial, mensaje, correcciones, conocimiento),
        () => {
          // Solo títulos y códigos de las casas cargadas: nada que no esté en la ficha.
          const casas = propiedades.slice(0, 3).map((p) => `• ${p.titulo} (${p.codigo})`);
          return {
            texto: [
              MARCA_MUESTRA,
              casas.length ? `Con gusto. Estas son algunas de las casas disponibles:\n${casas.join("\n")}` : "Con gusto le ayudo.",
              "¿Le gustaría agendar una visita?",
            ].join("\n\n"),
            avisarCorredor: null,
            consumo: SIN_CONSUMO,
          };
        },
      ),
    agendar: (corredor, propiedades, agenda, historial, mensaje) =>
      respaldo<DecisionAgenda>(
        () => real.agendar(corredor, propiedades, agenda, historial, mensaje),
        // Los horarios los elige y escribe el código (dos opciones libres de la agenda real).
        () => ({ accion: "proponer", horarios: [], citaId: null, propiedadCodigo: null, mensaje: `${MARCA_MUESTRA}\n\nCon gusto, tengo estos espacios:`, avisarCorredor: null, consumo: SIN_CONSUMO }),
      ),
  };
}
