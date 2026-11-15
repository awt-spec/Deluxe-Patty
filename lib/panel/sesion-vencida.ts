// Sesión vencida: a dónde mandar al corredor y cómo responder para que el navegador llegue a /entrar con un aviso
// claro y vuelva después a la misma pantalla. Sin dependencias del servidor: lo usan el proxy, las acciones y la
// pantalla de entrada (y sus pruebas).

/** Largo máximo de una ruta para volver (más largo no es una pantalla del panel). */
const MAX_RUTA = 500;

/**
 * Ruta del panel a la que se puede volver después de entrar: solo `/panel` o `/panel/...` del mismo sitio. Nunca
 * `//otro.sitio`, `/\otro`, `javascript:`, esquemas, caracteres de control ni rutas con `..` (redirección abierta).
 */
export function esRutaInterna(ruta: unknown): ruta is string {
  if (typeof ruta !== "string" || !ruta || ruta.length > MAX_RUTA) return false;
  if (!/^\/panel(?:[/?#]|$)/.test(ruta)) return false;
  // Barras invertidas, control, espacios: un navegador puede leerlos como otra dirección.
  if (/[\\\s\u0000-\u001f\u007f]/.test(ruta)) return false;
  const camino = ruta.split(/[?#]/)[0];
  if (camino.includes("//") || /(^|\/)\.\.?(\/|$)/.test(camino)) return false;
  // Lo codificado también: %2e%2e, %2f%2f, %5c.
  try {
    const decodificado = decodeURIComponent(camino);
    if (decodificado !== camino && !esRutaInterna(decodificado)) return false;
  } catch {
    return false;
  }
  return true;
}

/** La ruta para volver a partir de la dirección pedida: sin el `_rsc` que agrega Next en sus pedidos internos. */
export function rutaParaVolver(pathname: string, search: string): string | null {
  const p = new URLSearchParams(search);
  p.delete("_rsc");
  const q = p.toString();
  const ruta = `${pathname}${q ? `?${q}` : ""}`;
  // Volver al Inicio no hace falta decirlo: es a donde lleva la entrada.
  return esRutaInterna(ruta) && ruta !== "/panel" ? ruta : null;
}

/** /entrar con el aviso de sesión cerrada (si había una) y la pantalla a la que volver. */
export function destinoEntrar(volver: string | null, vencida: boolean): string {
  const p = new URLSearchParams();
  if (vencida) p.set("aviso", "sesion");
  if (volver && esRutaInterna(volver)) p.set("volver", volver);
  const q = p.toString();
  return `/entrar${q ? `?${q}` : ""}`;
}

/** ¿Trae el navegador una cookie de sesión de Supabase (sb-<ref>-auth-token, también en trozos .0, .1…)? */
export function hayCookieDeSesion(nombres: string[]): boolean {
  return nombres.some((n) => /^sb-.+-auth-token(\.\d+)?$/.test(n));
}

/** Pedido de una acción del servidor (Next manda la cabecera Next-Action). */
export function esPedidoDeAccion(cabeceras: Headers): boolean {
  return !!cabeceras.get("next-action");
}

/** Lo que decide el proxy cuando no hay sesión. */
export type RespuestaSinSesion =
  | { tipo: "accion"; destino: string } // 401 con x-action-redirect: el cliente de Next navega a /entrar
  | { tipo: "redirigir"; destino: string; estado: 303 | 307 };

/**
 * Sin sesión en una pantalla del panel:
 * - Acción del servidor (POST con Next-Action): una redirección 30x la sigue el fetch del cliente de Next, recibe la
 *   página HTML de /entrar y muestra "An unexpected response was received from the server". En cambio, con la
 *   cabecera `x-action-redirect` (la misma que usa `redirect()` dentro de una acción) el cliente navega a /entrar.
 * - Un formulario enviado sin JavaScript (POST normal): 303, para que el navegador pida /entrar con GET.
 * - Una página: 307 a /entrar.
 * `volver` es la pantalla en la que estaba (en una acción, la dirección del pedido es la de la página).
 */
export function decidirSinSesion(pedido: { method: string; headers: Headers; pathname: string; search: string; cookies: string[] }): RespuestaSinSesion {
  const vencida = hayCookieDeSesion(pedido.cookies);
  const destino = destinoEntrar(rutaParaVolver(pedido.pathname, pedido.search), vencida);
  if (esPedidoDeAccion(pedido.headers)) return { tipo: "accion", destino };
  return { tipo: "redirigir", destino, estado: pedido.method === "GET" || pedido.method === "HEAD" ? 307 : 303 };
}

/** De la cabecera Referer (misma página, Referrer-Policy same-origin) la ruta del panel para volver, si es nuestra. */
export function volverDesdeReferer(referer: string | null, origen: string | null): string | null {
  if (!referer) return null;
  try {
    const u = new URL(referer);
    if (origen && u.origin !== origen) return null;
    return rutaParaVolver(u.pathname, u.search);
  } catch {
    return null;
  }
}
