import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { COOKIE_VOLVER, destinoTrasEnlace, opcionesBorrarVolver } from "@/lib/panel/volver-enlace";
import { clienteConSesion } from "@/lib/supabase/servidor";

// Destino del enlace mágico: abre la sesión y lleva al panel, a la pantalla donde estaba si /entrar la guardó en la
// cookie de vuelta (solo /panel/..., 10 minutos; lib/panel/volver-enlace.ts). La cookie se borra siempre.
export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const supabase = await clienteConSesion();
  const code = p.get("code");
  const tokenHash = p.get("token_hash");
  const tipo = p.get("type") as EmailOtpType | null;

  const { error } = code
    ? await supabase.auth.exchangeCodeForSession(code)
    : tokenHash && tipo
      ? await supabase.auth.verifyOtp({ token_hash: tokenHash, type: tipo })
      : { error: new Error("sin código") };

  // destinoTrasEnlace solo devuelve /panel o /panel/...: la dirección final es siempre de este mismo sitio.
  const ruta = destinoTrasEnlace(req.cookies.get(COOKIE_VOLVER)?.value);
  const destino = new URL(ruta, req.nextUrl.origin);
  if (error) {
    // Enlace vencido o ya usado: a la entrada, que conserva la pantalla para el próximo enlace o la contraseña.
    destino.pathname = "/entrar";
    destino.search = "";
    destino.searchParams.set("aviso", "enlace");
    if (ruta !== "/panel") destino.searchParams.set("volver", ruta);
  }
  const respuesta = NextResponse.redirect(destino);
  respuesta.cookies.delete({ name: COOKIE_VOLVER, ...opcionesBorrarVolver });
  return respuesta;
}
