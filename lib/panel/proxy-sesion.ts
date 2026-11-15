import { NextResponse, type NextRequest } from "next/server";
import { decidirSinSesion } from "./sesion-vencida";

/**
 * Sin sesión: a /entrar con "Tu sesión se cerró" (si había una) y la pantalla a la que volver. A una acción del
 * servidor no se le puede contestar con una redirección (el fetch la sigue y recibe HTML): se le contesta como
 * contesta Next cuando una acción llama a redirect(), con `x-action-redirect`, y el navegador va a /entrar.
 */
export function respuestaSinSesion(request: NextRequest): NextResponse {
  const r = decidirSinSesion({
    method: request.method,
    headers: request.headers,
    pathname: request.nextUrl.pathname,
    search: request.nextUrl.search,
    cookies: request.cookies.getAll().map((c) => c.name),
  });
  if (r.tipo === "accion") {
    return new NextResponse("Tu sesión se cerró.", {
      status: 401,
      headers: { "content-type": "text/plain; charset=utf-8", "x-action-redirect": `${r.destino};replace`, "cache-control": "no-store" },
    });
  }
  return NextResponse.redirect(new URL(r.destino, request.nextUrl.origin), r.estado);
}
