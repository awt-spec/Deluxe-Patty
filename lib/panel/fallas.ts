// Por qué falló algo en el navegador, en palabras de todos los días. Lo usan la pantalla de error y los chats (Patty,
// Apartar tiempo): nunca muestran el mensaje técnico crudo, solo un código corto para soporte.

export type Falla = "sesion" | "sin-conexion" | "grande" | "generica";

/** Error de redirección de Next (`redirect()` en una acción, o la del proxy con x-action-redirect). */
function destinoDeRedireccion(e: unknown): string | null {
  const digest = typeof e === "object" && e !== null && "digest" in e ? (e as { digest: unknown }).digest : null;
  if (typeof digest !== "string" || !digest.startsWith("NEXT_REDIRECT;")) return null;
  // NEXT_REDIRECT;<tipo>;<destino>;<estado>;
  return digest.split(";").slice(2, -2).join(";") || null;
}

/** ¿La redirección lleva a /entrar? (la sesión se cerró en medio de una acción). */
export function esRedireccionAEntrar(e: unknown): boolean {
  const d = destinoDeRedireccion(e);
  return !!d && /^\/entrar(?:[?#]|$)/.test(d);
}

/** Error de red de fetch en los navegadores: Chrome, Firefox y Safari lo dicen distinto. */
function esErrorDeRed(e: unknown): boolean {
  if (!(e instanceof Error)) return false;
  return e.name === "TypeError" && /failed to fetch|networkerror|load failed|network request failed|fetch failed/i.test(e.message);
}

/**
 * Clasifica un error:
 * - `sesion`: la acción redirigió a /entrar, o el servidor contestó HTML en vez de la respuesta de la acción (lo que
 *   pasaba con la sesión vencida antes del arreglo del proxy).
 * - `sin-conexion`: el navegador dice que no hay red o el fetch no salió.
 * - `grande`: el pedido pasó el límite de tamaño (Vercel o la acción) — solo si se mandaron archivos.
 * - `generica`: cualquier otra cosa.
 */
export function clasificarFalla(e: unknown, ctx: { enLinea?: boolean; conArchivos?: boolean } = {}): Falla {
  if (esRedireccionAEntrar(e)) return "sesion";
  if (ctx.enLinea === false || esErrorDeRed(e)) return "sin-conexion";
  const mensaje = e instanceof Error ? e.message : "";
  if (ctx.conArchivos && /body exceeded|payload too large|request entity too large|413/i.test(mensaje)) return "grande";
  if (/unexpected response was received from the server/i.test(mensaje)) return ctx.conArchivos ? "grande" : "sesion";
  return "generica";
}

/** Qué decirle al corredor cuando falló mandar algo. */
export function mensajeDeFalla(f: Falla, accion = "mandar"): string {
  switch (f) {
    case "sesion":
      return "Tu sesión se cerró. Entra de nuevo y sigues donde estabas.";
    case "sin-conexion":
      return `Parece que no hay conexión. No se pudo ${accion}; lo que escribiste sigue aquí cuando vuelva.`;
    case "grande":
      return "Los archivos pesan demasiado para mandarlos juntos. Manda menos o más livianos.";
    default:
      return `No se pudo ${accion}. Inténtalo de nuevo en un momento.`;
  }
}

/**
 * Código corto para soporte: el digest del servidor (Next no manda el mensaje) o una huella del tipo y el mensaje
 * del error del navegador. Nunca el mensaje crudo: puede traer datos o texto técnico en inglés.
 */
export function codigoDeFalla(e: unknown): string {
  const digest = typeof e === "object" && e !== null && "digest" in e ? (e as { digest: unknown }).digest : null;
  if (typeof digest === "string" && digest && !digest.startsWith("NEXT_")) return `S-${digest.slice(0, 10)}`;
  const texto = e instanceof Error ? `${e.name}:${e.message}` : String(e);
  let h = 2166136261;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619) >>> 0;
  const tipo = e instanceof Error ? e.name.replace(/Error$/, "").slice(0, 8) || "E" : "E";
  return `N-${tipo}-${h.toString(36).slice(0, 6).toUpperCase()}`;
}
