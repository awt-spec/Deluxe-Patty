import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Renueva la sesión de Supabase y manda a /entrar a quien abre el panel sin sesión.
// Es solo una revisión optimista: cada página y acción vuelve a verificar con RLS.
export async function proxy(request: NextRequest) {
  let respuesta = NextResponse.next({ request });
  const supabase = createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (lista) => {
        for (const { name, value } of lista) request.cookies.set(name, value);
        respuesta = NextResponse.next({ request });
        for (const { name, value, options } of lista) respuesta.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    const entrar = request.nextUrl.clone();
    entrar.pathname = "/entrar";
    entrar.search = "";
    return NextResponse.redirect(entrar);
  }
  return respuesta;
}

export const config = { matcher: ["/panel/:path*"] };
