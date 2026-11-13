// Lo que usan el popup y el trabajador de fondo.

/** ¿Es la página de un anuncio de Encuentra24 (no un listado ni un perfil)? Su dirección termina en el número del anuncio. */
export function esPaginaDeAnuncio(url) {
  try {
    const u = new URL(url);
    const tramos = u.pathname.split("/").filter(Boolean);
    return u.protocol === "https:" && u.hostname === "www.encuentra24.com" && tramos.length >= 3 && /^\d{4,12}$/.test(tramos.at(-1));
  } catch {
    return false;
  }
}

const SENALES_VERIFICACION =
  /cloudflare|cf-chl|challenge-platform|cf-turnstile|just a moment|un momento|verify you are human|verifica que eres humano|confirma que eres humano|captcha|attention required|access denied|acceso denegado|too many requests|demasiadas solicitudes|error 10\d\d/i;

/**
 * ¿Encuentra24 pide confirmar que es una persona (desafío de Cloudflare, captcha) o frenó la visita (403, 429)?
 * Una página con los datos de los anuncios (payload de Next.js) nunca es la verificación, aunque mencione un
 * captcha en sus scripts (el formulario de contacto lo trae). La verificación no se resuelve ni se salta: la
 * búsqueda se detiene y se le pide a la persona.
 */
export function esVerificacion({ html = "", estado = 0 } = {}) {
  if (estado === 403 || estado === 429) return true;
  if (typeof html !== "string" || html.includes("self.__next_f")) return false;
  return SENALES_VERIFICACION.test(html);
}
