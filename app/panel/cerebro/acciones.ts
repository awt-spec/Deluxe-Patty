"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sesionConCorredor } from "@/lib/panel/sesion";

// El corredor alimenta el cerebro de su asistente con su sesión (RLS: solo lo suyo).

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const idValido = (id: string) => /^[0-9a-f-]{36}$/.test(id);

function volver(ver: string, aviso: string): never {
  revalidatePath("/panel/cerebro");
  redirect(`/panel/cerebro?ver=${ver}&aviso=${encodeURIComponent(aviso)}`);
}

export async function ensenar(f: FormData) {
  const tema = texto(f, "tema").slice(0, 300);
  const respuesta = texto(f, "respuesta").slice(0, 2000);
  if (!tema || !respuesta) volver("sabe", "Escribe el tema y la respuesta.");
  const { supabase, corredor } = await sesionConCorredor();
  const { error } = await supabase.from("conocimiento").insert({ corredor_id: corredor.id, tema, respuesta, estado: "activo", origen: "manual" });
  volver("sabe", error ? "No se pudo guardar." : "Listo, ya lo sabe.");
}

/** Responder una duda (o cambiar algo que ya sabe): queda activo con la respuesta. */
export async function responderDuda(f: FormData) {
  const id = texto(f, "id");
  const respuesta = texto(f, "respuesta").slice(0, 2000);
  if (!idValido(id) || !respuesta) volver("dudas", "Escribe la respuesta.");
  const { supabase, corredor } = await sesionConCorredor();
  const tema = texto(f, "tema").slice(0, 300);
  const { error } = await supabase
    .from("conocimiento")
    .update({ respuesta, estado: "activo", updated_at: new Date().toISOString(), ...(tema ? { tema } : {}) })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  volver(texto(f, "ver") === "sabe" ? "sabe" : "dudas", error ? "No se pudo guardar." : "Listo, ya lo sabe.");
}

export async function archivar(f: FormData) {
  const id = texto(f, "id");
  if (!idValido(id)) volver("sabe", "No se encontró.");
  const { supabase, corredor } = await sesionConCorredor();
  const { error } = await supabase
    .from("conocimiento")
    .update({ estado: "archivado", updated_at: new Date().toISOString() })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  volver(texto(f, "ver") === "dudas" ? "dudas" : "sabe", error ? "No se pudo quitar." : "Quitado.");
}
