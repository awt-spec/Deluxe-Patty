// Cliente mínimo de Google (OAuth, Gmail y Calendar) con fetch, sin librerías. Las funciones reciben el
// token de acceso; conseguirlo (y renovarlo) es cosa de lib/google/conexion.ts.

export const PERMISOS_GOOGLE = [
  "openid",
  "email",
  // Leer correos de clientes y dejar borradores de respuesta.
  "https://www.googleapis.com/auth/gmail.modify",
  // Mandar el resumen del día y las invitaciones.
  "https://www.googleapis.com/auth/gmail.send",
  // Crear, mover y borrar las visitas en su calendario y ver cuándo está ocupado.
  "https://www.googleapis.com/auth/calendar.events",
  "https://www.googleapis.com/auth/calendar.freebusy",
];

export interface ConfigGoogle {
  clienteId: string;
  secreto: string;
  vuelta: string;
}

export function configGoogle(base: string): ConfigGoogle | null {
  const clienteId = process.env.GOOGLE_CLIENT_ID;
  const secreto = process.env.GOOGLE_CLIENT_SECRET;
  if (!clienteId || !secreto || !process.env.GOOGLE_TOKEN_KEY) return null;
  return { clienteId, secreto, vuelta: `${base}/api/google/vuelta` };
}

export function urlConsentimiento(c: ConfigGoogle, estado: string): string {
  const p = new URLSearchParams({
    client_id: c.clienteId,
    redirect_uri: c.vuelta,
    response_type: "code",
    scope: PERMISOS_GOOGLE.join(" "),
    access_type: "offline",
    // Siempre pedir el permiso de nuevo para recibir el refresh token.
    prompt: "consent",
    include_granted_scopes: "true",
    state: estado,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${p}`;
}

type Fetch = typeof fetch;

async function json<T>(r: Response, que: string): Promise<T> {
  if (!r.ok) throw new Error(`google_${que}_${r.status}`);
  return (await r.json()) as T;
}

export async function cambiarCodigo(c: ConfigGoogle, codigo: string, f: Fetch = fetch) {
  const r = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code: codigo,
      client_id: c.clienteId,
      client_secret: c.secreto,
      redirect_uri: c.vuelta,
      grant_type: "authorization_code",
    }),
  });
  return json<{ access_token: string; refresh_token?: string; scope: string; id_token?: string }>(r, "token");
}

export async function renovarAcceso(c: Pick<ConfigGoogle, "clienteId" | "secreto">, refresh: string, f: Fetch = fetch) {
  const r = await f("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ refresh_token: refresh, client_id: c.clienteId, client_secret: c.secreto, grant_type: "refresh_token" }),
  });
  return json<{ access_token: string; expires_in: number }>(r, "renovar");
}

export async function correoDeLaCuenta(acceso: string, f: Fetch = fetch): Promise<string> {
  const r = await f("https://openidconnect.googleapis.com/v1/userinfo", { headers: { authorization: `Bearer ${acceso}` } });
  return (await json<{ email: string }>(r, "usuario")).email;
}

// --- Calendar -----------------------------------------------------------------------------------

export interface EventoVisita {
  titulo: string;
  descripcion: string;
  lugar: string | null;
  inicio: Date;
  fin: Date;
  /** Correo del cliente: Google le manda la invitación y los cambios. */
  invitado: string | null;
}

const CAL = "https://www.googleapis.com/calendar/v3";

function cuerpoEvento(e: EventoVisita) {
  return {
    summary: e.titulo,
    description: e.descripcion,
    location: e.lugar ?? undefined,
    start: { dateTime: e.inicio.toISOString() },
    end: { dateTime: e.fin.toISOString() },
    attendees: e.invitado ? [{ email: e.invitado }] : [],
    reminders: { useDefault: true },
  };
}

export async function crearEvento(acceso: string, calendario: string, e: EventoVisita, f: Fetch = fetch): Promise<string> {
  const r = await f(`${CAL}/calendars/${encodeURIComponent(calendario)}/events?sendUpdates=all`, {
    method: "POST",
    headers: { authorization: `Bearer ${acceso}`, "content-type": "application/json" },
    body: JSON.stringify(cuerpoEvento(e)),
  });
  return (await json<{ id: string }>(r, "crear_evento")).id;
}

export async function actualizarEvento(acceso: string, calendario: string, id: string, e: EventoVisita, f: Fetch = fetch) {
  const r = await f(`${CAL}/calendars/${encodeURIComponent(calendario)}/events/${encodeURIComponent(id)}?sendUpdates=all`, {
    method: "PATCH",
    headers: { authorization: `Bearer ${acceso}`, "content-type": "application/json" },
    body: JSON.stringify(cuerpoEvento(e)),
  });
  await json(r, "actualizar_evento");
}

export async function borrarEvento(acceso: string, calendario: string, id: string, f: Fetch = fetch) {
  const r = await f(`${CAL}/calendars/${encodeURIComponent(calendario)}/events/${encodeURIComponent(id)}?sendUpdates=all`, {
    method: "DELETE",
    headers: { authorization: `Bearer ${acceso}` },
  });
  // Ya borrado en Google: no es error.
  if (!r.ok && r.status !== 404 && r.status !== 410) throw new Error(`google_borrar_evento_${r.status}`);
}

/** Horas ocupadas en su calendario de Google (compromisos personales) entre dos fechas. */
export async function ocupado(acceso: string, calendario: string, desde: Date, hasta: Date, f: Fetch = fetch) {
  const r = await f(`${CAL}/freeBusy`, {
    method: "POST",
    headers: { authorization: `Bearer ${acceso}`, "content-type": "application/json" },
    body: JSON.stringify({ timeMin: desde.toISOString(), timeMax: hasta.toISOString(), items: [{ id: calendario }] }),
  });
  const d = await json<{ calendars: Record<string, { busy: { start: string; end: string }[] }> }>(r, "ocupado");
  return (d.calendars[calendario]?.busy ?? []).map((b) => ({ inicio: new Date(b.start), fin: new Date(b.end) }));
}

// --- Gmail --------------------------------------------------------------------------------------

const GMAIL = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface Correo {
  id: string;
  hilo: string;
  de: string;
  correoDe: string;
  asunto: string;
  messageId: string | null;
  texto: string;
  recibido: number;
}

/** Ids de correos recibidos (no enviados por ella, ni spam ni promociones) desde una fecha. */
export async function correosNuevos(acceso: string, desdeMs: number, f: Fetch = fetch): Promise<string[]> {
  const q = `in:inbox -from:me -category:promotions -category:social after:${Math.floor(desdeMs / 1000)}`;
  const r = await f(`${GMAIL}/messages?maxResults=25&q=${encodeURIComponent(q)}`, { headers: { authorization: `Bearer ${acceso}` } });
  const d = await json<{ messages?: { id: string }[] }>(r, "lista_correos");
  return (d.messages ?? []).map((m) => m.id);
}

type Parte = { mimeType?: string; body?: { data?: string }; parts?: Parte[]; headers?: { name: string; value: string }[] };

function base64url(s: string): string {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
}

/** El texto plano del correo (o el HTML sin etiquetas si no hay texto). */
function textoDe(p: Parte): string {
  if (p.mimeType === "text/plain" && p.body?.data) return base64url(p.body.data);
  for (const h of p.parts ?? []) {
    const t = textoDe(h);
    if (t) return t;
  }
  if (p.mimeType === "text/html" && p.body?.data) {
    return base64url(p.body.data)
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<br\s*\/?>|<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .replace(/&nbsp;/g, " ");
  }
  return "";
}

export async function leerCorreo(acceso: string, id: string, f: Fetch = fetch): Promise<Correo> {
  const r = await f(`${GMAIL}/messages/${id}?format=full`, { headers: { authorization: `Bearer ${acceso}` } });
  const m = await json<{ id: string; threadId: string; internalDate: string; payload: Parte }>(r, "leer_correo");
  const cab = (n: string) => m.payload.headers?.find((h) => h.name.toLowerCase() === n)?.value ?? "";
  const de = cab("from");
  return {
    id: m.id,
    hilo: m.threadId,
    de,
    correoDe: (/<([^>]+)>/.exec(de)?.[1] ?? de).trim().toLowerCase(),
    asunto: cab("subject"),
    messageId: cab("message-id") || null,
    texto: textoDe(m.payload).replace(/\r/g, "").slice(0, 6000),
    recibido: Number(m.internalDate),
  };
}

/** Correo en formato RFC 2822, en base64url, como lo pide Gmail. */
export function armarCorreo(m: { para: string; asunto: string; texto: string; enRespuestaA?: string | null }): string {
  const asunto = `=?UTF-8?B?${Buffer.from(m.asunto, "utf8").toString("base64")}?=`;
  const lineas = [
    `To: ${m.para}`,
    `Subject: ${asunto}`,
    "MIME-Version: 1.0",
    "Content-Type: text/plain; charset=UTF-8",
    "Content-Transfer-Encoding: base64",
    ...(m.enRespuestaA ? [`In-Reply-To: ${m.enRespuestaA}`, `References: ${m.enRespuestaA}`] : []),
    "",
    Buffer.from(m.texto, "utf8").toString("base64"),
  ];
  return Buffer.from(lineas.join("\r\n"), "utf8").toString("base64url");
}

/** Deja una respuesta como borrador en Gmail, en el mismo hilo: el corredor la revisa y la manda. */
export async function crearBorrador(acceso: string, hilo: string, crudo: string, f: Fetch = fetch) {
  const r = await f(`${GMAIL}/drafts`, {
    method: "POST",
    headers: { authorization: `Bearer ${acceso}`, "content-type": "application/json" },
    body: JSON.stringify({ message: { raw: crudo, threadId: hilo } }),
  });
  await json(r, "borrador");
}

export async function enviarCorreo(acceso: string, crudo: string, f: Fetch = fetch) {
  const r = await f(`${GMAIL}/messages/send`, {
    method: "POST",
    headers: { authorization: `Bearer ${acceso}`, "content-type": "application/json" },
    body: JSON.stringify({ raw: crudo }),
  });
  await json(r, "enviar_correo");
}
