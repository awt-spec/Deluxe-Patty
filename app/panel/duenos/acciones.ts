"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { siguienteCodigo } from "@/lib/panel/formularios";
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

/**
 * Un dueño firmó: la casa pasa a Mis casas con lo que se sabe del anuncio (título, zona, precio, cuartos,
 * metros y descripción) y el dueño queda como "Publicada", enlazado a ella. La casa se guarda con la
 * sesión del corredor, como cualquier casa que agrega él; después completa la ficha y sube sus fotos.
 */
export async function pasarAMisCasas(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const id = String(f.get("lead") ?? "");
  const { data: lead } = await supabase
    .from("leads_duenos")
    .select("id, titulo, zona, precio, moneda, habitaciones, m2_construccion, descripcion, estado_contacto, propiedad_id")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!lead) redirect("/panel/duenos?aviso=No%20encontr%C3%A9%20ese%20due%C3%B1o.");
  if (lead.propiedad_id) redirect(`/panel/propiedades/${lead.propiedad_id}`);
  const titulo = ((lead.titulo as string | null) ?? "Casa de dueño directo").slice(0, 120);
  const t = titulo.toLowerCase();
  const tipo = /apartamento|apto|condominio vertical/.test(t) ? "apartamento" : /lote|terreno/.test(t) ? "lote" : /local/.test(t) ? "local" : /finca/.test(t) ? "finca" : "casa";
  let nueva: string | null = null;
  for (let intento = 0; intento < 3 && !nueva; intento++) {
    const { data: codigos } = await supabase.from("propiedades").select("codigo").eq("corredor_id", corredor.id);
    const { data, error } = await supabase
      .from("propiedades")
      .insert({
        corredor_id: corredor.id,
        codigo: siguienteCodigo((codigos ?? []).map((c) => c.codigo as string)),
        titulo,
        tipo,
        operacion: "venta",
        precio: lead.precio,
        moneda: (lead.moneda as string | null) ?? "USD",
        zona: lead.zona,
        habitaciones: lead.habitaciones,
        m2_construccion: lead.m2_construccion,
        descripcion: lead.descripcion,
        estado: "activa",
      })
      .select("id")
      .single();
    if (data) nueva = data.id as string;
    else if (error?.code !== "23505") break;
  }
  if (!nueva) redirect("/panel/duenos?etapa=captado&aviso=No%20se%20pudo%20crear%20la%20casa.%20Vuelve%20a%20intentarlo.");
  await supabase
    .from("leads_duenos")
    .update({ estado_contacto: "publicada", estado_at: new Date().toISOString(), propiedad_id: nueva })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  revalidatePath("/panel/duenos");
  revalidatePath("/panel/propiedades");
  redirect(`/panel/propiedades/${nueva}?aviso=${encodeURIComponent("Lista en Mis casas. Revisa la ficha, sube las fotos y prepara el anuncio.")}`);
}
