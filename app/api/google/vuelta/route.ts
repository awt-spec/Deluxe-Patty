import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { guardarConexion } from "@/lib/google/conexion";
import { cambiarCodigo, configGoogle, correoDeLaCuenta } from "@/lib/google/google";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";

// Google vuelve aquí después de que el corredor da el permiso. Se comprueba el estado de la cookie y
// la sesión (el mismo corredor), se cambia el código por el permiso y se guarda cifrado.
export async function GET(req: NextRequest) {
  const base = process.env.NEXT_PUBLIC_URL_APP ?? req.nextUrl.origin;
  const ir = (aviso: string) => NextResponse.redirect(new URL(`/panel/ajustes?aviso=${encodeURIComponent(aviso)}`, base));
  const jar = await cookies();
  const esperado = jar.get("google_estado")?.value;
  jar.delete("google_estado");
  const estado = req.nextUrl.searchParams.get("state");
  const codigo = req.nextUrl.searchParams.get("code");
  if (req.nextUrl.searchParams.get("error")) return ir("No se conectó Google: no se dio el permiso.");
  if (!esperado || !estado || estado !== esperado || !codigo) return ir("No se pudo conectar Google. Vuelve a intentarlo.");

  const { corredor } = await sesionConCorredor();
  if (estado.split(".")[1] !== corredor.id) return ir("No se pudo conectar Google. Vuelve a intentarlo.");
  const c = configGoogle(base);
  if (!c) return ir("Google todavía no está configurado.");
  try {
    const t = await cambiarCodigo(c, codigo);
    if (!t.refresh_token) return ir("Google no dio el permiso permanente. Quita el acceso en tu cuenta de Google y vuelve a conectar.");
    const correo = await correoDeLaCuenta(t.access_token);
    await guardarConexion(createAdminClient(), corredor.id, { correo, refresh: t.refresh_token, permisos: t.scope.split(" ") });
    return ir(`Listo: Google conectado con ${correo}.`);
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_google_conectar", error: errorSeguro(e) }));
    return ir("No se pudo conectar Google. Vuelve a intentarlo.");
  }
}
