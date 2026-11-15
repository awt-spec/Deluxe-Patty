// Enlace mágico: a qué pantalla del panel volver después de abrirlo. La ruta no viaja en el enlace (Supabase solo
// acepta direcciones de vuelta de su lista de permitidas y no se puede saber si una con ?volver= lo está): queda en
// una cookie propia de corta duración que pone /entrar al pedir el enlace y que lee y borra /auth/confirmar.
// Sin dependencias del servidor, para poder probarlo.
import { esRutaInterna } from "./sesion-vencida";

export const COOKIE_VOLVER = "panel_volver";

/** Diez minutos: lo que tarda en llegar y abrirse el correo. Pasado eso, se entra al Inicio. */
export const DURACION_VOLVER_S = 10 * 60;

/** Solo la manda el navegador a la ruta de vuelta del enlace. */
const RUTA_COOKIE = "/auth";

export const opcionesCookieVolver = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: true,
  path: RUTA_COOKIE,
  maxAge: DURACION_VOLVER_S,
};

/** Para borrarla hace falta la misma ruta con que se puso. */
export const opcionesBorrarVolver = { path: RUTA_COOKIE };

/** Valor de la cookie: la ruta y su vencimiento (base64url de JSON). Nada si la ruta no es del panel. */
export function valorCookieVolver(volver: unknown, ahora = Date.now()): string | null {
  if (!esRutaInterna(volver) || volver === "/panel") return null;
  return Buffer.from(JSON.stringify({ r: volver, e: ahora + DURACION_VOLVER_S * 1000 })).toString("base64url");
}

/**
 * Destino tras canjear el enlace: la ruta guardada si la cookie está, no venció y la ruta sigue siendo del panel;
 * si no, el Inicio. Nunca otra dirección (redirección abierta).
 */
export function destinoTrasEnlace(valor: string | undefined | null, ahora = Date.now()): string {
  if (!valor || valor.length > 2000) return "/panel";
  try {
    const dato: unknown = JSON.parse(Buffer.from(valor, "base64url").toString("utf8"));
    if (!dato || typeof dato !== "object") return "/panel";
    const { r, e } = dato as { r?: unknown; e?: unknown };
    if (typeof e !== "number" || !Number.isFinite(e) || e <= ahora) return "/panel";
    // El vencimiento no puede estar más lejos de lo que dura la cookie (una hecha a mano).
    if (e > ahora + DURACION_VOLVER_S * 1000) return "/panel";
    return esRutaInterna(r) ? r : "/panel";
  } catch {
    return "/panel";
  }
}
