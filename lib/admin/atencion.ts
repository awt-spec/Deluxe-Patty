// Reglas puras de /admin (sin base ni red): lo que pide atención en el Resumen, el estado de cada corredor y cómo
// se nombra cada alerta de monitoreo. Las páginas leen los datos y las vistas solo dibujan esto.
import type { FilaAdmin } from "./datos";

export type Tono = "mal" | "poco" | "info" | "gris" | "bien";

export interface Atencion {
  tono: "mal" | "poco" | "info";
  titulo: string;
  texto: string;
  href: string;
  /** Lo que dice el botón. */
  accion: string;
}

export interface Llaves {
  token: boolean;
  secreto: boolean;
  verificacion: boolean;
}

/** Lo que pide atención, de lo más grave a lo informativo. */
export function listaAtencion(filas: FilaAdmin[], llaves: Llaves): Atencion[] {
  const a: Atencion[] = [];
  const meta = { href: "/admin/whatsapp", accion: "Ver WhatsApp" };
  if (!llaves.token) a.push({ tono: "mal", titulo: "Falta WHATSAPP_ACCESS_TOKEN", texto: "Nada puede salir por WhatsApp hasta ponerla en Vercel.", ...meta });
  if (!llaves.secreto) a.push({ tono: "mal", titulo: "Falta WHATSAPP_APP_SECRET", texto: "El webhook rechaza todo lo que llega de Meta.", ...meta });
  if (!llaves.verificacion) a.push({ tono: "mal", titulo: "Falta WHATSAPP_VERIFY_TOKEN", texto: "Meta no puede verificar el webhook.", ...meta });
  for (const f of filas.filter((x) => x.c.activo)) {
    const ruta = `/admin/corredores/${f.c.id}`;
    const n = f.c.nombre;
    if (!f.c.whatsapp_phone_number_id) a.push({ tono: "mal", titulo: `${n}: sin número de WhatsApp`, texto: "Falta el Phone number ID: sus clientes no pueden escribirle a la asistente.", href: ruta, accion: "Poner el número" });
    else if (!f.ultimoEntrante) a.push({ tono: "poco", titulo: `${n}: no ha llegado ningún mensaje`, texto: "Todavía no entra nada por WhatsApp. Revisa el registro del número y el webhook.", ...meta });
    if (!f.c.whatsapp_corredor) a.push({ tono: "poco", titulo: `${n}: falta el celular del corredor`, texto: "Sin él no recibe el plan del día ni los avisos, y sus mensajes se tratan como de un cliente.", href: ruta, accion: "Agregar celular" });
    if (f.gastoHoy >= f.topeDia || f.gastoMes >= f.topeMes) a.push({ tono: "mal", titulo: `${n}: frenado por tope de IA`, texto: "La asistente no contesta: los chats quedan para el corredor.", href: `${ruta}#ia`, accion: "Revisar topes" });
    else if (f.gastoHoy >= f.topeDia * 0.8 || f.gastoMes >= f.topeMes * 0.8) a.push({ tono: "poco", titulo: `${n}: cerca del tope de IA`, texto: "Usó el 80 % o más del tope del día o del mes.", href: `${ruta}#ia`, accion: "Revisar topes" });
    if (f.mensajesMes >= f.c.aviso_mensajes_mes) a.push({ tono: "poco", titulo: `${n}: ${f.mensajesMes} de ${f.c.tope_mensajes_mes} mensajes`, texto: "Se acerca al tope de mensajes del mes.", href: `${ruta}#ia`, accion: "Revisar topes" });
    if (!f.c.respuesta_automatica) a.push({ tono: "info", titulo: `${n}: piloto en sombra`, texto: "Las respuestas esperan la aprobación del corredor antes de salir.", href: ruta, accion: "Abrir" });
  }
  const orden = { mal: 0, poco: 1, info: 2 } as const;
  return a.sort((x, y) => orden[x.tono] - orden[y.tono]);
}

/** Estado de la cuenta: activo, demo (inactivo) o pausado (activo pero con la IA apagada por tope 0). */
export function estadoCorredor(f: Pick<FilaAdmin, "c" | "topeMes">): { texto: string; tono: Tono } {
  if (!f.c.activo) return { texto: "Demo", tono: "gris" };
  if (f.topeMes <= 0) return { texto: "Pausado", tono: "poco" };
  return { texto: "Activo", tono: "bien" };
}

/** Estado de WhatsApp de un corredor según lo que hay en la base (el de Meta, en vivo, está en /admin/whatsapp). */
export function estadoWhatsApp(f: Pick<FilaAdmin, "c" | "ultimoEntrante">): { texto: string; tono: Tono } {
  if (!f.c.whatsapp_phone_number_id) return { texto: "Sin número", tono: "mal" };
  if (!f.ultimoEntrante) return { texto: "Sin mensajes", tono: "poco" };
  return { texto: "Conectado", tono: "bien" };
}

const ALERTAS: [RegExp, string, Tono][] = [
  [/^error_whatsapp_config/, "WhatsApp: falla de cuenta o plantilla", "mal"],
  [/^error_aviso_no_entregado/, "Un aviso al corredor no llegó", "mal"],
  [/^error_corredor_desconocido/, "Llegó un mensaje a un número sin corredor", "poco"],
  [/^error_busqueda_extension/, "La búsqueda de dueños falló", "poco"],
  [/^error_extension/, "Falla en la extensión de Chrome", "poco"],
  [/^error_/, "Error del sistema", "mal"],
  [/^entrega_fallida/, "Un mensaje no se entregó", "mal"],
  [/^fallidos/, "Mensajes no entregados", "mal"],
  [/^costo/, "Gasto de IA alto hoy", "poco"],
  [/^cron/, "Una tarea programada falló", "mal"],
  [/^sin_contestar/, "Chat sin contestar (frenado)", "poco"],
  [/^seguimiento_visita/, "Pregunta por una visita", "info"],
  [/^prueba/, "Prueba de monitoreo", "info"],
];

/** Nombre en palabras de una alerta (`alertas.clave`) y su tono; la clave sin el número final va aparte. */
export function describirAlerta(clave: string): { titulo: string; clave: string; tono: Tono } {
  const limpia = clave.replace(/:\d+$/, "");
  const hallada = ALERTAS.find(([re]) => re.test(limpia));
  return hallada ? { titulo: hallada[1], clave: limpia, tono: hallada[2] } : { titulo: "Aviso de monitoreo", clave: limpia, tono: "gris" };
}

/** Iniciales para el círculo del corredor o del usuario. */
export function iniciales(texto: string, n = 2): string {
  const partes = texto
    .replace(/@.*$/, "")
    .replace(/\(.*?\)/g, "")
    .split(/[\s._-]+/)
    .filter(Boolean);
  return partes
    .slice(0, n)
    .map((p) => p[0]!.toUpperCase())
    .join("") || "?";
}
