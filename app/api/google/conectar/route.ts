import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { configGoogle, urlConsentimiento } from "@/lib/google/google";
import { sesionConCorredor } from "@/lib/panel/sesion";

export const runtime = "nodejs";

// "Conectar Google" desde Ajustes: con la sesión del corredor se arma el permiso que se le pide a
// Google. El estado (anti falsificación) va en una cookie corta y amarra la vuelta a este corredor.
export async function GET(req: NextRequest) {
  const { corredor } = await sesionConCorredor();
  const base = process.env.NEXT_PUBLIC_URL_APP ?? req.nextUrl.origin;
  const c = configGoogle(base);
  if (!c) return NextResponse.redirect(new URL("/panel/ajustes?aviso=Google%20todav%C3%ADa%20no%20est%C3%A1%20configurado.", base));
  const estado = `${randomBytes(24).toString("hex")}.${corredor.id}`;
  (await cookies()).set("google_estado", estado, { httpOnly: true, secure: true, sameSite: "lax", maxAge: 600, path: "/" });
  return NextResponse.redirect(urlConsentimiento(c, estado));
}
