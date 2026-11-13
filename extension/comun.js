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
