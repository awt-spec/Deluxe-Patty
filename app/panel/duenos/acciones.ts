"use server";

import { revalidatePath } from "next/cache";
import { crearAlmacenExtension } from "@/lib/encuentra24/datos";
import { nuevoCodigo } from "@/lib/encuentra24/extension";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

export type EstadoCodigo = { codigo?: string; error?: string };

/** Código de un solo uso para conectar la extensión de Chrome al corredor que se está viendo. */
export async function pedirCodigoExtension(_previo: EstadoCodigo): Promise<EstadoCodigo> {
  // El corredor sale de la sesión (RLS): solo puede pedir código para los suyos.
  const { corredor } = await sesionConCorredor();
  if (corredor.activo === false) return { error: "En la demo no se conecta la extensión." };
  try {
    return { codigo: await nuevoCodigo(crearAlmacenExtension(createAdminClient()), corredor.id) };
  } catch {
    return { error: "No se pudo crear el código. Vuelve a intentarlo." };
  }
}

/** Desconecta todas las extensiones del corredor (por ejemplo, si cambió de computadora). */
export async function desconectarExtension() {
  const { corredor } = await sesionConCorredor();
  await crearAlmacenExtension(createAdminClient()).revocarTodas(corredor.id, new Date());
  revalidatePath("/panel/duenos");
}
