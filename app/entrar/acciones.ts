"use server";

import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { abrirSesionDemo } from "@/lib/panel/demo";
import { slugValido } from "@/lib/panel/marca";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { COOKIE_CORREDOR } from "@/lib/panel/sesion";
import { esRutaInterna } from "@/lib/panel/sesion-vencida";
import { COOKIE_VOLVER, opcionesBorrarVolver, opcionesCookieVolver, valorCookieVolver } from "@/lib/panel/volver-enlace";
import { clienteConSesion } from "@/lib/supabase/servidor";

export async function pedirEnlace(formulario: FormData) {
  const correo = String(formulario.get("correo") ?? "").trim().toLowerCase();
  // El corredor de la entrada (?c=) se conserva para que la pantalla siguiente tenga su marca.
  const c = String(formulario.get("c") ?? "");
  // La pantalla a la que volver (solo /panel/...) se conserva en /entrar y queda en una cookie para cuando se abra el
  // enlace: no va en el enlace porque Supabase solo acepta direcciones de vuelta de su lista de permitidas.
  const volver = String(formulario.get("volver") ?? "");
  const valorVolver = valorCookieVolver(volver);
  const conMarca = (aviso: string) =>
    `/entrar?aviso=${aviso}${slugValido(c) ? `&c=${c}` : ""}${valorVolver ? `&volver=${encodeURIComponent(volver)}` : ""}`;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) redirect(conMarca("correo"));
  const almacen = await cookies();
  if (valorVolver) almacen.set(COOKIE_VOLVER, valorVolver, opcionesCookieVolver);
  else almacen.delete({ name: COOKIE_VOLVER, ...opcionesBorrarVolver });
  // La dirección del enlace sale de la configuración; el encabezado Origin queda solo para local.
  const origen = process.env.NEXT_PUBLIC_URL_APP || (await headers()).get("origin") || "";
  const supabase = await clienteConSesion();
  // shouldCreateUser: false — solo entran usuarios creados por soporte y enlazados a un corredor.
  const { error } = await supabase.auth.signInWithOtp({
    email: correo,
    options: { shouldCreateUser: false, emailRedirectTo: `${origen}/auth/confirmar` },
  });
  if (error) {
    // Antes el error se tragaba y siempre decía "revisa tu correo": no se sabía por qué no llegaba nada.
    // Se registra solo tipo y código (nunca el correo) y, si fue el límite de correos por hora, se avisa.
    console.error(JSON.stringify({ evento: "error_enlace", error: errorSeguro(error) }));
    if (error.status === 429) redirect(conMarca("limite"));
  }
  // Misma respuesta exista o no la cuenta: no se revela qué correos están registrados.
  redirect(conMarca("enviado"));
}

/** Entrada con correo y contraseña. Un solo mensaje de error, exista o no la cuenta. */
export async function iniciarSesion(formulario: FormData) {
  const correo = String(formulario.get("correo") ?? "").trim().toLowerCase();
  const contrasena = String(formulario.get("contrasena") ?? "");
  const c = String(formulario.get("c") ?? "");
  // Si la sesión se cerró en medio de algo, vuelve a esa pantalla (solo /panel/...; si no, al Inicio).
  const volver = String(formulario.get("volver") ?? "");
  const destino = esRutaInterna(volver) ? volver : "/panel";
  const conMarca = (aviso: string) =>
    `/entrar?aviso=${aviso}${slugValido(c) ? `&c=${c}` : ""}${destino !== "/panel" ? `&volver=${encodeURIComponent(destino)}` : ""}`;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(correo)) redirect(conMarca("correo"));
  if (!contrasena || contrasena.length > 200) redirect(conMarca("credenciales"));
  const { error } = await (await clienteConSesion()).auth.signInWithPassword({ email: correo, password: contrasena });
  if (error) {
    if (error.status === 429) redirect(conMarca("limite"));
    redirect(conMarca("credenciales"));
  }
  (await cookies()).delete(COOKIE_CORREDOR);
  redirect(destino);
}

/** "Ver la demo": entra sin correo a la cuenta de demo, con datos ficticios. */
export async function entrarDemo() {
  const listo = await abrirSesionDemo().catch((e: unknown) => {
    console.error(JSON.stringify({ evento: "error_demo", paso: "excepcion", tipo: e instanceof Error ? e.name : "desconocido" }));
    return false;
  });
  if (!listo) redirect("/entrar?aviso=demo");
  (await cookies()).delete(COOKIE_CORREDOR);
  redirect("/panel");
}
