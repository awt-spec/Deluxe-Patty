"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { abrirSesionDemo } from "@/lib/panel/demo";
import { slugValido } from "@/lib/panel/marca";
import { COOKIE_CORREDOR } from "@/lib/panel/sesion";
import { clienteConSesion } from "@/lib/supabase/servidor";

export async function pedirEnlace(formulario: FormData) {
  const correo = String(formulario.get("correo") ?? "").trim().toLowerCase();
  // El corredor de la entrada (?c=) se conserva para que la pantalla siguiente tenga su marca.
  const c = String(formulario.get("c") ?? "");
  const conMarca = (aviso: string) => `/entrar?aviso=${aviso}${slugValido(c) ? `&c=${c}` : ""}`;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) redirect(conMarca("correo"));
  // La dirección del enlace sale de la configuración; el encabezado Origin queda solo para local.
  const origen = process.env.NEXT_PUBLIC_URL_APP || (await headers()).get("origin") || "";
  const supabase = await clienteConSesion();
  // shouldCreateUser: false — solo entran usuarios creados por soporte y enlazados a un corredor.
  await supabase.auth.signInWithOtp({
    email: correo,
    options: { shouldCreateUser: false, emailRedirectTo: `${origen}/auth/confirmar` },
  });
  // Misma respuesta exista o no la cuenta: no se revela qué correos están registrados.
  redirect(conMarca("enviado"));
}

/** "Ver la demo": entra sin correo a la cuenta de demo, con datos ficticios. */
export async function entrarDemo() {
  const listo = await abrirSesionDemo().catch(() => false);
  if (!listo) redirect("/entrar?aviso=demo");
  (await cookies()).delete(COOKIE_CORREDOR);
  redirect("/panel");
}
