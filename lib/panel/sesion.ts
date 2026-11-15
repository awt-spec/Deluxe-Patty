import "server-only";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { COLUMNAS_CORREDOR } from "../datos/repositorio";
import type { Corredor } from "../datos/tipos";
import { clienteConSesion } from "../supabase/servidor";
import { destinoEntrar, esPedidoDeAccion, volverDesdeReferer } from "./sesion-vencida";

export const COOKIE_CORREDOR = "corredor";

/**
 * Sesión del panel: el usuario y el corredor que está viendo. Los corredores salen con la sesión
 * del usuario (RLS), así que solo puede elegir los suyos. Soporte puede tener varios; la cookie
 * "corredor" recuerda cuál está viendo.
 */
export async function sesionCorredor() {
  const supabase = await clienteConSesion();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect(await entradaSinSesion());

  const { data: corredores } = await supabase.from("corredores").select(COLUMNAS_CORREDOR).order("nombre");
  const lista = (corredores ?? []) as Corredor[];
  const elegido = (await cookies()).get(COOKIE_CORREDOR)?.value;
  const corredor = lista.find((c) => c.id === elegido) ?? lista[0] ?? null;
  return { supabase, usuario: data.user, corredor, corredores: lista };
}

/** Igual que sesionCorredor, pero exige un corredor (las acciones lo necesitan). */
export async function sesionConCorredor() {
  const s = await sesionCorredor();
  if (!s.corredor) redirect("/panel");
  return { ...s, corredor: s.corredor };
}

/**
 * A dónde va quien perdió la sesión entre el proxy y la página o la acción: /entrar con "Tu sesión se cerró" y, si
 * es una acción, la pantalla desde la que la mandó (el Referer, mismo sitio) para volver ahí después de entrar.
 */
async function entradaSinSesion(): Promise<string> {
  try {
    const h = await headers();
    const volver = esPedidoDeAccion(h) ? volverDesdeReferer(h.get("referer"), h.get("origin")) : null;
    return destinoEntrar(volver, true);
  } catch {
    // Fuera de un pedido (pruebas, scripts) no hay cabeceras: la entrada de siempre, con el aviso.
    return destinoEntrar(null, true);
  }
}
