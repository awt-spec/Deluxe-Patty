"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { leerCorredoresConocidos } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";

// Corredores conocidos: la búsqueda semanal no los muestra como dueños. Se guardan con la sesión (RLS).

const RUTA = "/panel/duenos/corredores";

function volver(aviso: string): never {
  revalidatePath(RUTA);
  redirect(`${RUTA}?aviso=${encodeURIComponent(aviso)}`);
}

export async function agregarCorredores(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const { corredores, ignoradas } = leerCorredoresConocidos(String(f.get("lista") ?? ""));
  if (corredores.length === 0) volver("No encontré nombres ni teléfonos en la lista.");

  // Los que ya están (por teléfono o por nombre) no se repiten.
  const { data } = await supabase.from("corredores_bloqueados").select("telefono, nombre").eq("corredor_id", corredor.id);
  const telefonos = new Set((data ?? []).map((x) => x.telefono).filter(Boolean));
  const nombres = new Set((data ?? []).map((x) => String(x.nombre ?? "").toLowerCase()).filter(Boolean));
  const nuevos = corredores.filter((c) =>
    c.telefono ? !telefonos.has(c.telefono) : !nombres.has(String(c.nombre).toLowerCase()),
  );
  if (nuevos.length > 0) {
    const { error } = await supabase
      .from("corredores_bloqueados")
      .insert(nuevos.map((c) => ({ ...c, corredor_id: corredor.id })));
    if (error) volver("No se pudo guardar la lista. Revisa los teléfonos.");
  }
  const repetidos = corredores.length - nuevos.length;
  volver(
    [
      `${nuevos.length} ${nuevos.length === 1 ? "agregado" : "agregados"}.`,
      repetidos ? `${repetidos} ya ${repetidos === 1 ? "estaba" : "estaban"}.` : "",
      // Solo la cantidad: el texto de las líneas (nombres, teléfonos) no va en la dirección de la página.
      ignoradas.length
        ? `No entendí ${ignoradas.length} ${ignoradas.length === 1 ? "línea" : "líneas"}: revisa que el teléfono tenga 8 dígitos.`
        : "",
    ]
      .filter(Boolean)
      .join(" "),
  );
}

export async function quitarCorredor(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  await supabase.from("corredores_bloqueados").delete().eq("corredor_id", corredor.id).eq("id", String(f.get("id") ?? ""));
  volver("Quitado: si vuelve a anunciar, aparecerá en la lista de dueños.");
}
