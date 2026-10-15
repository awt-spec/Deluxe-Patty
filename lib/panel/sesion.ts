import "server-only";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { COLUMNAS_CORREDOR } from "../datos/repositorio";
import type { Corredor } from "../datos/tipos";
import { clienteConSesion } from "../supabase/servidor";

export const COOKIE_CORREDOR = "corredor";

/**
 * Sesión del panel: el usuario y el corredor que está viendo. Los corredores salen con la sesión
 * del usuario (RLS), así que solo puede elegir los suyos. Soporte puede tener varios; la cookie
 * "corredor" recuerda cuál está viendo.
 */
export async function sesionCorredor() {
  const supabase = await clienteConSesion();
  const { data } = await supabase.auth.getUser();
  if (!data.user) redirect("/entrar");

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
