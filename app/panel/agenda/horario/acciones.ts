"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { leerBloqueo, leerFranja, type Franja } from "@/lib/panel/formularios";
import { sesionConCorredor } from "@/lib/panel/sesion";

// Horario de visitas y bloqueos: se guardan con la sesión del corredor (RLS). La disponibilidad que
// ofrece la asistente sale de aquí en el siguiente mensaje.

const RUTA = "/panel/agenda/horario";

function volver(aviso: string): never {
  revalidatePath(RUTA);
  revalidatePath("/panel/agenda");
  redirect(`${RUTA}?aviso=${encodeURIComponent(aviso)}`);
}

export async function agregarFranja(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase
    .from("horarios_visitas")
    .select("dia_semana, hora_inicio, hora_fin")
    .eq("corredor_id", corredor.id);
  const existentes = ((data ?? []) as Franja[]).map((x) => ({
    ...x,
    hora_inicio: x.hora_inicio.slice(0, 5),
    hora_fin: x.hora_fin.slice(0, 5),
  }));
  const r = leerFranja(f, existentes);
  if (!r.ok) volver(r.motivo);
  const { error } = await supabase
    .from("horarios_visitas")
    .insert({ ...(r as Extract<typeof r, { ok: true }>).valor, corredor_id: corredor.id });
  volver(error ? "No se pudo guardar la franja." : "Franja agregada.");
}

export async function quitarFranja(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  await supabase.from("horarios_visitas").delete().eq("corredor_id", corredor.id).eq("id", String(f.get("id") ?? ""));
  volver("Franja quitada.");
}

export async function agregarBloqueo(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const r = leerBloqueo(f, corredor.zona_horaria, new Date());
  if (!r.ok) volver(r.motivo);
  const { inicio, fin, motivo } = (r as Extract<typeof r, { ok: true }>).valor;
  const { error } = await supabase.from("bloqueos_agenda").insert({
    corredor_id: corredor.id,
    inicio: inicio.toISOString(),
    fin: fin.toISOString(),
    motivo,
  });
  // Las visitas ya agendadas en ese rango no se cancelan solas: se avisa para que lo revise.
  const { count } = await supabase
    .from("citas")
    .select("id", { count: "exact", head: true })
    .eq("corredor_id", corredor.id)
    .in("estado", ["agendada", "confirmada"])
    .lt("inicio", fin.toISOString())
    .gt("fin", inicio.toISOString());
  if (error) volver("No se pudo guardar el bloqueo.");
  volver(
    count
      ? `Bloqueo guardado. Ojo: ya tienes ${count} ${count === 1 ? "visita" : "visitas"} en esas fechas; esas siguen en pie.`
      : "Bloqueo guardado: la asistente no ofrecerá esas horas.",
  );
}

export async function quitarBloqueo(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  await supabase.from("bloqueos_agenda").delete().eq("corredor_id", corredor.id).eq("id", String(f.get("id") ?? ""));
  volver("Bloqueo quitado.");
}

const entero = (f: FormData, k: string, min: number, max: number) => {
  const n = Number(String(f.get(k) ?? ""));
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
};

export async function guardarReglasVisitas(f: FormData) {
  const { supabase, corredor } = await sesionConCorredor();
  const cambios = {
    duracion_visita_min: entero(f, "duracion", 15, 240),
    margen_visitas_min: entero(f, "margen", 0, 180),
    anticipacion_min_horas: entero(f, "anticipacion", 0, 72),
    horizonte_agenda_dias: entero(f, "horizonte", 1, 60),
  };
  if (Object.values(cambios).some((v) => v === null)) volver("Revisa los números de las visitas.");
  const { error } = await supabase.from("corredores").update(cambios).eq("id", corredor.id);
  volver(error ? "No se pudo guardar." : "Guardado.");
}
