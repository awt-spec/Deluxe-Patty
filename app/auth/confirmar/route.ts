import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";
import { clienteConSesion } from "@/lib/supabase/servidor";

// Destino del enlace mágico: abre la sesión y lleva al panel.
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

  const destino = req.nextUrl.clone();
  destino.search = "";
  destino.pathname = error ? "/entrar" : "/panel";
  if (error) destino.searchParams.set("aviso", "enlace");
  return NextResponse.redirect(destino);
}
