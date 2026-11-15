"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { ensenarAlCerebro, textoParaCerebro } from "@/lib/panel/cerebro";
import { sesionConCorredor } from "@/lib/panel/sesion";

// El corredor alimenta el cerebro de su asistente con su sesión (RLS: solo lo suyo).

const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
// Lo que se le enseña se limpia y se topa en el servidor; si pasa del tope se le dice (no se corta a escondidas).
const crudo = (f: FormData, k: string) => f.get(k);
const idValido = (id: string) => /^[0-9a-f-]{36}$/.test(id);

function volver(ver: string, aviso: string): never {
  revalidatePath("/panel/cerebro");
  redirect(`/panel/cerebro?ver=${ver}&aviso=${encodeURIComponent(aviso)}`);
}

export async function ensenar(f: FormData) {
  const limpio = textoParaCerebro(crudo(f, "tema"), crudo(f, "respuesta"));
  if (!limpio.ok) volver("sabe", limpio.motivo);
  if (!limpio.tema || !limpio.respuesta) volver("sabe", "Escribe el tema y la respuesta.");
  const { supabase, corredor } = await sesionConCorredor();
  const ok = await ensenarAlCerebro(supabase, corredor.id, limpio.tema, limpio.respuesta).then(
    () => true,
    () => false,
  );
  volver("sabe", ok ? "Listo, ya lo sabe." : "No se pudo guardar.");
}

/** Responder una duda (o cambiar algo que ya sabe): queda activo con la respuesta. */
export async function responderDuda(f: FormData) {
  const id = texto(f, "id");
  const ver = texto(f, "ver") === "sabe" ? "sabe" : "dudas";
  const limpio = textoParaCerebro(crudo(f, "tema"), crudo(f, "respuesta"));
  if (!limpio.ok) volver(ver, limpio.motivo);
  const { respuesta, tema } = limpio;
  if (!idValido(id) || !respuesta) volver("dudas", "Escribe la respuesta.");
  const { supabase, corredor } = await sesionConCorredor();
  const { error } = await supabase
    .from("conocimiento")
    .update({ respuesta, estado: "activo", updated_at: new Date().toISOString(), ...(tema ? { tema } : {}) })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  volver(ver, error ? "No se pudo guardar." : "Listo, ya lo sabe.");
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
