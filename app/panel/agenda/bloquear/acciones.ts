"use server";

import { revalidatePath } from "next/cache";
import { choquesConVisitas, desempacarPropuesta, resumenGuardado, revisarOperaciones, textoLimpio, type Apartado, type Duda } from "@/lib/agenda/apartar-ia";
import { entenderPedidoApartado, type FuenteApartado } from "@/lib/agenda/entender-apartado";
import { conPunto, horaCorta, rangoBloqueo } from "@/lib/agenda/formato";
import { guardarBloqueos } from "@/lib/agenda/guardar-bloqueos";
import { hayTurnoApartar } from "@/lib/agenda/patty-apartar";
import { dependenciasPara } from "@/lib/asistente/dependencias";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { sesionConCorredor } from "@/lib/panel/sesion";
import { createAdminClient } from "@/lib/supabase/admin";

// "Dímelo con tus palabras" en Apartar tiempo. Tres pasos, cada uno comprueba la sesión y filtra por corredor:
// entender (código, demo o Haiku; nada se guarda), guardar lo que el corredor confirmó en la tarjeta "Esto entendí"
// (se vuelve a revisar aquí: el navegador no es de fiar) y deshacer justo eso. Nada del texto va a los registros.

export interface RenglonApartado extends Apartado {
  /** Visitas que ya están en ese rato (siguen en pie; solo se avisa). */
  choques: { id: string; texto: string }[];
}

export interface Propuesta {
  texto: string;
  fuente: FuenteApartado | "patty";
  aviso: string | null;
  apartados: RenglonApartado[];
  quitar: { id: string; texto: string; inicio: string; fin: string; motivo: string | null }[];
  dudas: Duda[];
  notas: string[];
}

type Resultado<T> = ({ ok: true } & T) | { ok: false; motivo: string };

const capitalizar = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
const esId = (v: unknown): v is string => typeof v === "string" && /^[0-9a-f-]{36}$/.test(v);

type Sesion = Awaited<ReturnType<typeof sesionConCorredor>>;

/** Visitas de ese rato y lo apartado que se quitaría, leídos con la sesión (RLS) y filtrados por corredor. */
async function completar(s: Sesion, revisado: ReturnType<typeof revisarOperaciones>) {
  const { supabase, corredor } = s;
  const zona = corredor.zona_horaria;
  let apartados: RenglonApartado[] = revisado.apartados.map((a) => ({ ...a, choques: [] }));
  if (apartados.length) {
    const fin = apartados.reduce((m, a) => (a.fin > m ? a.fin : m), apartados[0].fin);
    const { data } = await supabase
      .from("citas")
      .select("id, inicio, fin, contactos(nombre)")
      .eq("corredor_id", corredor.id)
      .in("estado", ["agendada", "confirmada"])
      .lt("inicio", fin)
      .gt("fin", apartados[0].inicio)
      .limit(100);
    const visitas = ((data ?? []) as unknown as { id: string; inicio: string; fin: string; contactos: { nombre: string | null } | { nombre: string | null }[] | null }[]).map((v) => {
      const c = Array.isArray(v.contactos) ? v.contactos[0] : v.contactos;
      return { id: v.id, inicio: v.inicio, fin: v.fin, nombre: c?.nombre ?? null };
    });
    const choques = choquesConVisitas(apartados, visitas);
    apartados = apartados.map((a) => ({
      ...a,
      choques: (choques[a.clave] ?? []).map((v) => ({
        id: String(v.id),
        texto: conPunto(`Ojo: tienes una visita${v.nombre ? ` con ${v.nombre}` : ""} a las ${horaCorta(new Date(v.inicio), zona)}`),
      })),
    }));
  }
  const quitar: Propuesta["quitar"] = [];
  for (const q of revisado.quitar) {
    const { data } = await supabase
      .from("bloqueos_agenda")
      .select("id, inicio, fin, motivo")
      .eq("corredor_id", corredor.id)
      .lt("inicio", q.fin)
      .gt("fin", q.inicio)
      .order("inicio")
      .limit(40);
    for (const b of (data ?? []) as { id: string; inicio: string; fin: string; motivo: string | null }[]) {
      if (!quitar.some((x) => x.id === b.id)) quitar.push({ ...b, texto: capitalizar(rangoBloqueo(b, zona)) + (b.motivo ? ` · ${b.motivo}` : "") });
    }
  }
  const notas = [...revisado.notas];
  if (revisado.quitar.length && !quitar.length) notas.push(`No tienes nada apartado ${revisado.quitar.map((q) => `el ${q.texto.toLowerCase()}`).join(" ni ")}.`);
  return { apartados, quitar, notas };
}

/**
 * Entiende lo que escribió el corredor. Con `p` (el enlace que arma Patty) usa esas operaciones sin volver a llamar
 * al modelo, pero las revisa igual que siempre.
 */
export async function entenderApartadoPanel(textoCrudo: unknown, p?: unknown): Promise<Resultado<{ propuesta: Propuesta }>> {
  const s = await sesionConCorredor();
  const { corredor } = s;
  const ahora = new Date();
  try {
    let base: { texto: string; fuente: Propuesta["fuente"]; aviso: string | null; revisado: ReturnType<typeof revisarOperaciones> };
    const dePatty = p === undefined ? null : desempacarPropuesta(p);
    if (dePatty) {
      base = { texto: dePatty.texto, fuente: "patty", aviso: null, revisado: revisarOperaciones(dePatty.ops, { ahora, zona: corredor.zona_horaria, texto: dePatty.texto }) };
    } else {
      const texto = textoLimpio(textoCrudo, 500);
      if (!texto) return { ok: false, motivo: "Cuéntame cuándo no puedes." };
      const { data: horarios } = await s.supabase.from("horarios_visitas").select("dia_semana, hora_inicio, hora_fin").eq("corredor_id", corredor.id);
      const r = await entenderPedidoApartado(dependenciasPara(corredor), corredor, texto, ahora, {
        turno: () => hayTurnoApartar(createAdminClient(), corredor.id),
        horarios: (horarios ?? []) as { dia_semana: number; hora_inicio: string; hora_fin: string }[],
      });
      if (!r.ok) return r;
      base = { texto: r.texto, fuente: r.fuente, aviso: r.aviso, revisado: r.revisado };
    }
    const { apartados, quitar, notas } = await completar(s, base.revisado);
    return { ok: true, propuesta: { texto: base.texto, fuente: base.fuente, aviso: base.aviso, apartados, quitar, dudas: base.revisado.dudas, notas } };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_entender_apartado", corredorId: corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude entenderlo ahora. Inténtalo de nuevo o usa los botones de abajo." };
  }
}

/**
 * "Sí, apartarlo": guarda los renglones que quedaron en la tarjeta y quita lo apartado que se listó. Cada renglón se
 * vuelve a revisar con las mismas reglas (sin repeticiones: ya vienen expandidas) y se guarda con la misma inserción
 * que el formulario. Lo que se quita se lee primero (solo del corredor) para poder deshacerlo.
 */
export async function guardarApartadosPanel(
  apartadosCrudos: unknown,
  quitarCrudos: unknown,
): Promise<Resultado<{ texto: string; ids: string[]; quitados: { inicio: string; fin: string; motivo: string | null }[] }>> {
  const { supabase, corredor } = await sesionConCorredor();
  const ahora = new Date();
  const crudos = (Array.isArray(apartadosCrudos) ? apartadosCrudos : []).slice(0, 40) as Partial<Apartado>[];
  const ops = crudos.map((a) => ({ tipo: "apartar" as const, desde: a?.desde, hasta: a?.hasta, rato: a?.rato, hora_inicio: a?.hora_inicio, hora_fin: a?.hora_fin, motivo: a?.motivo }));
  const revisado = revisarOperaciones(ops, { ahora, zona: corredor.zona_horaria, texto: "" });
  if (revisado.apartados.length !== crudos.length || revisado.dudas.length) return { ok: false, motivo: "Algo cambió (o ya pasó). Vuelve a decírmelo." };
  const ids = (Array.isArray(quitarCrudos) ? quitarCrudos : []).filter(esId).slice(0, 40);
  if (!revisado.apartados.length && !ids.length) return { ok: false, motivo: "No queda nada que apartar." };
  try {
    let quitados: { inicio: string; fin: string; motivo: string | null }[] = [];
    if (ids.length) {
      const { data } = await supabase.from("bloqueos_agenda").select("id, inicio, fin, motivo").eq("corredor_id", corredor.id).in("id", ids);
      const propios = (data ?? []) as { id: string; inicio: string; fin: string; motivo: string | null }[];
      if (propios.length) {
        const { error } = await supabase.from("bloqueos_agenda").delete().eq("corredor_id", corredor.id).in("id", propios.map((b) => b.id));
        if (error) return { ok: false, motivo: "No pude quitar ese tiempo apartado." };
        quitados = propios.map(({ inicio, fin, motivo }) => ({ inicio, fin, motivo }));
      }
    }
    let nuevos: string[] = [];
    if (revisado.apartados.length) {
      const r = await guardarBloqueos(supabase, corredor.id, revisado.apartados.map((a) => ({ inicio: a.inicio, fin: a.fin, motivo: a.motivo })));
      if (!r.ok) return { ok: false, motivo: "No se pudo apartar ese tiempo." };
      nuevos = r.ids;
    }
    revalidatePath("/panel/agenda");
    revalidatePath("/panel");
    const ya = revisado.apartados.length - nuevos.length;
    return { ok: true, texto: `${resumenGuardado(nuevos.length, quitados.length)}${ya > 0 ? ` (${ya === 1 ? "uno ya estaba apartado" : `${ya} ya estaban apartados`})` : ""}`, ids: nuevos, quitados };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_guardar_apartado", corredorId: corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No se pudo apartar ese tiempo. Inténtalo de nuevo." };
  }
}

/** "Deshacer": quita justo lo que se acaba de apartar y vuelve a poner lo que se quitó (solo del corredor). */
export async function deshacerApartadosPanel(idsCrudos: unknown, restaurarCrudos: unknown): Promise<Resultado<{ texto: string }>> {
  const { supabase, corredor } = await sesionConCorredor();
  const ids = (Array.isArray(idsCrudos) ? idsCrudos : []).filter(esId).slice(0, 40);
  const ahora = Date.now();
  const restaurar = (Array.isArray(restaurarCrudos) ? restaurarCrudos : [])
    .slice(0, 40)
    .map((b) => b as { inicio?: unknown; fin?: unknown; motivo?: unknown })
    .filter((b) => typeof b?.inicio === "string" && typeof b?.fin === "string" && Date.parse(b.inicio) < Date.parse(b.fin) && Date.parse(b.fin) > ahora && Date.parse(b.fin) - Date.parse(b.inicio) <= 100 * 86_400_000)
    .map((b) => ({ inicio: new Date(b.inicio as string).toISOString(), fin: new Date(b.fin as string).toISOString(), motivo: textoLimpio(b.motivo, 120) || null }));
  if (!ids.length && !restaurar.length) return { ok: false, motivo: "No hay nada que deshacer." };
  try {
    if (ids.length) {
      const { error } = await supabase.from("bloqueos_agenda").delete().eq("corredor_id", corredor.id).in("id", ids);
      if (error) return { ok: false, motivo: "No pude deshacerlo. Quítalo abajo, en Tiempo apartado." };
    }
    if (restaurar.length) await guardarBloqueos(supabase, corredor.id, restaurar);
    revalidatePath("/panel/agenda");
    revalidatePath("/panel");
    return { ok: true, texto: "Listo, lo dejé como estaba." };
  } catch (e) {
    console.error(JSON.stringify({ evento: "error_deshacer_apartado", corredorId: corredor.id, error: errorSeguro(e) }));
    return { ok: false, motivo: "No pude deshacerlo. Quítalo abajo, en Tiempo apartado." };
  }
}
