"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { fechaDeIso, fechaIso, fechaLocal, sumarDias } from "@/lib/agenda/tiempo";
import { normalizarZona } from "@/lib/agenda/zonas";
import { anotar, type TipoActividad } from "@/lib/crm/actividades";
import { cambiosDeEtapa, comisionAlCorregir, validarCierre, validarOfertaCon } from "@/lib/crm/cierre";
import { montoContable, porcentaje } from "@/lib/crm/contable";
import { comisionEstimada, monedaDe, type Moneda } from "@/lib/crm/dinero";
import { ETAPAS, MOTIVOS_PERDIDA, NOMBRE_ETAPA, type Busca, type Etapa } from "@/lib/crm/perfil";
import { LIMITES, leerNumero, limpiarTexto, normalizarTelefono, textoLibre } from "@/lib/panel/formularios";
import { createAdminClient } from "@/lib/supabase/admin";
import { sesionConCorredor } from "@/lib/panel/sesion";

// El corredor edita el CRM de sus clientes con su sesión: la política de contactos (RLS) solo le deja
// tocar los suyos y el permiso por columna, solo estos campos (nunca el teléfono).

// Texto del formulario sin caracteres invisibles ni de dirección (U+202E y parecidos).
const texto = (f: FormData, k: string) => limpiarTexto(f.get(k)).trim();
const numeroDe = (v: string) => {
  const n = leerNumero(v);
  return typeof n === "number" ? n : null;
};
const idValido = (id: string) => /^[0-9a-f-]{36}$/.test(id);

async function guardar(id: string, cambios: Record<string, unknown>, aviso: string) {
  if (!idValido(id)) redirect("/panel/clientes");
  const { supabase, corredor } = await sesionConCorredor();
  const { error } = await supabase.from("contactos").update(cambios).eq("corredor_id", corredor.id).eq("id", id);
  revalidatePath(`/panel/clientes/${id}`);
  revalidatePath("/panel/clientes");
  revalidatePath("/panel");
  redirect(`/panel/clientes/${id}?aviso=${encodeURIComponent(error ? "No se pudo guardar. Vuelve a intentarlo." : aviso)}`);
}

export async function cambiarEtapa(f: FormData) {
  const id = texto(f, "id");
  const etapa = texto(f, "etapa") as Etapa;
  if (!ETAPAS.includes(etapa)) redirect("/panel/clientes");
  const corredor = await clientePropio(id);
  // Si el cliente se pierde, se guarda por qué (uno de los botones); si vuelve, se borra el motivo.
  const motivo = texto(f, "motivo");
  const motivo_perdida = etapa === "perdido" && (MOTIVOS_PERDIDA as readonly string[]).includes(motivo) ? motivo : null;
  const db = createAdminClient();
  const { data: antes } = await db
    .from("contactos")
    .select("etapa, cierre_at, cierre_precio, cierre_moneda")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .single();
  if (antes?.etapa === etapa) {
    // Tocar la etapa en la que ya está no cuenta como cambio (ni reinicia los días ni ensucia la historia).
    if (etapa !== "perdido" || !motivo_perdida) volverA(id, `Ya está en ${NOMBRE_ETAPA[etapa]}.`);
    const { error } = await db.from("contactos").update({ motivo_perdida }).eq("corredor_id", corredor.id).eq("id", id);
    if (!error) await anotar(db, corredor.id, id, "etapa", `Se perdió: ${motivo_perdida}`);
    volverA(id, error ? "No se pudo guardar. Vuelve a intentarlo." : "Listo, guardado.");
  }
  const { cambios, anulado } = cambiosDeEtapa(antes ?? {}, etapa, new Date().toISOString());
  const { error } = await db
    .from("contactos")
    .update({ ...cambios, motivo_perdida })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  if (error) volverA(id, "No se pudo guardar. Vuelve a intentarlo.");
  if (anulado) await anotarAnulado(db, corredor.id, id, antes);
  await anotar(db, corredor.id, id, "etapa", `Pasó a ${NOMBRE_ETAPA[etapa]}${motivo_perdida ? `: ${motivo_perdida}` : ""}`);
  volverA(
    id,
    etapa === "perdido" && !motivo_perdida
      ? "Listo. Dinos por qué se perdió: así sabes qué mejorar."
      : etapa === "cerrado"
        ? "¡Felicidades! Anota abajo el precio y tu comisión."
        : "Listo, guardado.",
  );
}

/** "Cierre anulado: era $450.000,00" en la Historia, al sacar de Cerró a un cliente con el cierre anotado. */
async function anotarAnulado(
  db: ReturnType<typeof createAdminClient>,
  corredorId: string,
  id: string,
  antes: { cierre_precio?: unknown; cierre_moneda?: unknown } | null,
) {
  const precio = Number(antes?.cierre_precio);
  await anotar(db, corredorId, id, "cierre", `Cierre anulado${Number.isFinite(precio) ? `: era ${montoContable(precio, monedaDe(antes?.cierre_moneda))}` : ""}`);
}

export async function guardarBusca(f: FormData) {
  const operacion = texto(f, "operacion");
  const zonas = texto(f, "zonas")
    .split(",")
    .map((z) => normalizarZona(z))
    .filter(Boolean)
    .filter((z, i, todas) => todas.findIndex((x) => x.toLowerCase() === z.toLowerCase()) === i)
    .slice(0, 6);
  const presupuesto = numeroDe(texto(f, "presupuesto"));
  const habitaciones = numeroDe(texto(f, "habitaciones"));
  const busca: Busca = {
    ...(operacion === "venta" || operacion === "alquiler" ? { operacion } : {}),
    ...(texto(f, "tipo") ? { tipo: texto(f, "tipo").slice(0, 40) } : {}),
    ...(zonas.length ? { zonas } : {}),
    ...(presupuesto && presupuesto > 0 ? { presupuesto_max: presupuesto, moneda: texto(f, "moneda") === "CRC" ? "CRC" : "USD" } : {}),
    ...(habitaciones && habitaciones > 0 ? { habitaciones: Math.round(habitaciones) } : {}),
  };
  await guardar(texto(f, "id"), { busca }, "Guardado.");
}

export async function guardarSeguimiento(f: FormData) {
  // Atajos "Mañana", "En 3 días", "En una semana": el botón trae los días y la fecha se calcula aquí.
  const dias = Number(texto(f, "dias"));
  let fecha = texto(f, "fecha");
  if ([1, 3, 7].includes(dias)) {
    const { corredor } = await sesionConCorredor();
    fecha = fechaIso(sumarDias(fechaLocal(new Date(), corredor.zona_horaria), dias));
  }
  const id = texto(f, "id");
  const quitar = f.get("quitar") !== null;
  if (quitar) return guardar(id, { seguimiento_fecha: null, seguimiento_nota: null }, "Listo, ya está hecho.");
  if (!idValido(id)) redirect("/panel/clientes");
  // Sin día (borró la fecha de "Otro día") no se toca nada: antes borraba el recordatorio y decía "te lo recuerdo".
  if (!fechaDeIso(fecha)) volverA(id, "Elige el día del recordatorio.");
  // La nota no se corta a escondidas: si pasa del tope, se le dice.
  const nota = textoLibre(texto(f, "nota"), LIMITES.nota, "Lo que tienes que hacer");
  if (!nota.ok) volverA(id, nota.motivo);
  await guardar(id, { seguimiento_fecha: fecha, seguimiento_nota: nota.valor }, "Listo, te lo recuerdo ese día.");
}

export async function guardarNotas(f: FormData) {
  const id = texto(f, "id");
  const notas = textoLibre(texto(f, "notas"), LIMITES.notas, "Las notas");
  const nombre = textoLibre(texto(f, "nombre"), LIMITES.nombre, "El nombre");
  if (!notas.ok || !nombre.ok) {
    if (!idValido(id)) redirect("/panel/clientes");
    volverA(id, !notas.ok ? notas.motivo : (nombre as { motivo: string }).motivo);
  }
  await guardar(id, { notas: notas.valor, nombre: nombre.valor }, "Guardado.");
}

/**
 * Cliente que llegó por fuera de WhatsApp (un referido, una llamada). Los contactos los escribe el
 * backend: primero se comprueba con la sesión cuál es el corredor y luego se guarda con su corredor_id.
 */
export async function agregarCliente(f: FormData) {
  const { corredor } = await sesionConCorredor();
  const telefono = normalizarTelefono(texto(f, "telefono"));
  const nombre = texto(f, "nombre").slice(0, LIMITES.nombre) || null;
  if (!telefono) redirect(`/panel/clientes/nuevo?aviso=${encodeURIComponent("Revisa el teléfono: 8 números, o con +506.")}`);
  const origen = texto(f, "origen") === "referido" ? "referido" : "otro";
  const admin = createAdminClient();
  const { data: ya } = await admin
    .from("contactos")
    .select("id")
    .eq("corredor_id", corredor.id)
    .eq("telefono", telefono)
    .maybeSingle();
  if (ya) redirect(`/panel/clientes/${ya.id}?aviso=${encodeURIComponent("Ese cliente ya estaba: aquí está.")}`);
  const { data, error } = await admin
    .from("contactos")
    .insert({ corredor_id: corredor.id, telefono, nombre, origen, notas: texto(f, "notas").slice(0, LIMITES.notas) || null })
    .select("id")
    .single();
  if (error || !data) redirect(`/panel/clientes/nuevo?aviso=${encodeURIComponent("No se pudo guardar. Vuelve a intentarlo.")}`);
  revalidatePath("/panel/clientes");
  redirect(`/panel/clientes/${data.id}?aviso=${encodeURIComponent("Cliente agregado.")}`);
}

/** Mover un cliente de etapa desde el tablero (arrastrando). Devuelve si se guardó. */
export async function moverEtapa(id: string, etapa: string): Promise<boolean> {
  if (!idValido(id) || !(ETAPAS as readonly string[]).includes(etapa)) return false;
  const { supabase, corredor } = await sesionConCorredor();
  // Con la sesión (RLS) se comprueba que es suyo; las columnas del cierre las escribe el backend (la sesión no puede).
  const { data: propio } = await supabase.from("contactos").select("id").eq("corredor_id", corredor.id).eq("id", id).maybeSingle();
  if (!propio) return false;
  const db = createAdminClient();
  const { data: antes } = await db
    .from("contactos")
    .select("etapa, cierre_at, cierre_precio, cierre_moneda")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .maybeSingle();
  if (!antes) return false;
  if (antes.etapa === etapa) return true; // soltó en la misma columna
  const { cambios, anulado } = cambiosDeEtapa(antes, etapa, new Date().toISOString());
  const { error } = await db
    .from("contactos")
    .update({ ...cambios, ...(etapa === "perdido" ? {} : { motivo_perdida: null }) })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  if (!error && anulado) await anotarAnulado(db, corredor.id, id, antes);
  if (!error) await anotar(db, corredor.id, id, "etapa", `Pasó a ${NOMBRE_ETAPA[etapa as Etapa]}`);
  revalidatePath("/panel/clientes");
  return !error;
}

/** El cliente es del corredor de la sesión (RLS). Devuelve el corredor o vuelve a Clientes. */
async function clientePropio(id: string) {
  if (!idValido(id)) redirect("/panel/clientes");
  const { supabase, corredor } = await sesionConCorredor();
  const { data } = await supabase.from("contactos").select("id").eq("corredor_id", corredor.id).eq("id", id).maybeSingle();
  if (!data) redirect("/panel/clientes");
  return corredor;
}

function volverA(id: string, aviso: string): never {
  revalidatePath(`/panel/clientes/${id}`);
  revalidatePath("/panel/clientes");
  revalidatePath("/panel");
  redirect(`/panel/clientes/${id}?aviso=${encodeURIComponent(aviso)}`);
}

const POR_DEFECTO: Record<string, string> = { llamada: "Lo llamé", mensaje: "Le escribí", visita: "Lo vi en persona" };

/** "Anotar": lo que pasó con el cliente (lo llamé, le escribí, lo vi, otra cosa). */
export async function anotarActividad(f: FormData) {
  const id = texto(f, "id");
  const corredor = await clientePropio(id);
  const tipo = texto(f, "tipo") as TipoActividad;
  if (!["llamada", "mensaje", "visita", "nota"].includes(tipo)) volverA(id, "Elige qué pasó.");
  const nota = texto(f, "texto");
  const admin = createAdminClient();
  const cuerpo = (nota || POR_DEFECTO[tipo] || "").trim().slice(0, LIMITES.nota);
  // Un doble toque no crea dos anotaciones: la misma (cliente, tipo y texto) de hace menos de 10 s se ignora.
  if (cuerpo) {
    const { data: repetida } = await admin
      .from("actividades")
      .select("id")
      .eq("corredor_id", corredor.id)
      .eq("contacto_id", id)
      .eq("tipo", tipo)
      .eq("texto", cuerpo)
      .eq("autor", "corredor")
      .gte("created_at", new Date(Date.now() - 10_000).toISOString())
      .limit(1);
    if (repetida && repetida.length > 0) volverA(id, "Anotado.");
  }
  const ok = await anotar(admin, corredor.id, id, tipo, cuerpo);
  volverA(id, ok ? "Anotado." : "Escribe qué pasó.");
}

async function casaPropia(corredorId: string, casa: string) {
  if (!idValido(casa)) return null;
  const { data } = await createAdminClient()
    .from("propiedades")
    .select("id, titulo, precio, moneda, operacion")
    .eq("corredor_id", corredorId)
    .eq("id", casa)
    .maybeSingle();
  return data as { id: string; titulo: string; precio: number | null; moneda: string; operacion: string } | null;
}

/** Casa que le interesa y oferta (si la hay). Con oferta, el cliente pasa a "Negociando". */
export async function guardarOportunidad(f: FormData) {
  const id = texto(f, "id");
  const corredor = await clientePropio(id);
  const casa = texto(f, "casa") ? await casaPropia(corredor.id, texto(f, "casa")) : null;
  const moneda = monedaDe(texto(f, "oferta_moneda"));
  const db = createAdminClient();
  const { data: antes } = await db
    .from("contactos")
    .select("etapa, oferta_monto, oferta_moneda, busca")
    .eq("corredor_id", corredor.id)
    .eq("id", id)
    .single();
  // Una oferta que no se entiende no guarda nada (antes la borraba); vacía, se quita. Con el mismo criterio que el
  // cierre: «1,180» se pregunta y una cifra que no se cree frente a la casa (menos del 20 % de la lista) se explica.
  const leida = validarOfertaCon(texto(f, "oferta"), moneda, {
    operacion: casa?.operacion ?? (antes?.busca as { operacion?: string } | null)?.operacion ?? null,
    lista: casa ? { precio: casa.precio, moneda: casa.moneda } : null,
  });
  if (!leida.ok) volverA(id, leida.motivo);
  const oferta = leida.valor;
  const pasa = !!oferta && ["nuevo", "interesado", "visita"].includes(antes?.etapa as string);
  const { error } = await db
    .from("contactos")
    .update({
      propiedad_interes_id: casa?.id ?? null,
      oferta_monto: oferta,
      oferta_moneda: moneda,
      ...(pasa ? { etapa: "negociando", etapa_at: new Date().toISOString() } : {}),
    })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  if (error) volverA(id, "No se pudo guardar. Vuelve a intentarlo.");
  if (oferta && (oferta !== Number(antes?.oferta_monto ?? 0) || moneda !== antes?.oferta_moneda)) {
    await anotar(db, corredor.id, id, "oferta", `Oferta de ${montoContable(oferta, moneda)}${casa ? ` por ${casa.titulo}` : ""}`);
  }
  if (pasa) await anotar(db, corredor.id, id, "etapa", "Pasó a Negociando");
  volverA(id, pasa ? "Guardado. Lo pasé a Negociando." : "Guardado.");
}

type CorredorSesion = Awaited<ReturnType<typeof clientePropio>>;

/**
 * Lo que hace falta para validar y guardar un cierre: la casa (si es suya), si es venta o alquiler (lo dice la casa;
 * si no hay casa, lo que el cliente buscaba) y el cierre anotado antes, para corregirlo.
 */
async function contextoCierre(corredorId: string, id: string, casaId: string | null) {
  const db = createAdminClient();
  const casa = casaId ? await casaPropia(corredorId, casaId) : null;
  const { data: cliente } = await db
    .from("contactos")
    .select("busca, etapa, etapa_at, cierre_precio, cierre_comision, cierre_moneda, cierre_propiedad_id, cierre_at")
    .eq("corredor_id", corredorId)
    .eq("id", id)
    .single();
  const busca = (cliente?.busca as { operacion?: string } | null)?.operacion ?? null;
  const operacion = casa?.operacion ?? busca;
  const correccion = cliente?.etapa === "cerrado" && cliente.cierre_precio !== null && cliente.cierre_precio !== undefined;
  let antes: { precio: number | null; moneda: string | null; comision: number | null; operacion: string | null } | null = null;
  if (correccion) {
    const casaAntes = cliente.cierre_propiedad_id ? await casaPropia(corredorId, String(cliente.cierre_propiedad_id)) : null;
    antes = {
      precio: Number(cliente.cierre_precio),
      moneda: (cliente.cierre_moneda as string | null) ?? null,
      comision: cliente.cierre_comision === null || cliente.cierre_comision === undefined ? null : Number(cliente.cierre_comision),
      operacion: casaAntes?.operacion ?? busca,
    };
  }
  return { casa, cliente, operacion, correccion, antes };
}
type Contexto = Awaited<ReturnType<typeof contextoCierre>>;

/** Valida el cierre con la casa y la operación: el precio tiene que ser creíble frente a la lista (misma moneda). */
const validarCon = (ctx: Contexto, precio: string, comision: string, moneda: Moneda) =>
  validarCierre(precio, comision, moneda, { operacion: ctx.operacion, lista: ctx.casa ? { precio: ctx.casa.precio, moneda: ctx.casa.moneda } : null });

/**
 * Guarda el cierre: casa, precio, moneda y comisión (la escrita, la de antes si se corrige sin cambiar precio, moneda ni
 * operación, o la estimada según venta o alquiler). Lo usan la ficha del cliente y el tablero (al soltar en "Cerró").
 * Devuelve false si no se guardó, o si fue un cierre nuevo o la corrección de uno ya anotado.
 */
async function registrarCierre(
  corredor: CorredorSesion,
  id: string,
  ctx: Contexto,
  precio: number,
  moneda: Moneda,
  comisionEscrita: number | null,
  pct: number | null,
): Promise<false | "nuevo" | "corregido" | "igual"> {
  const db = createAdminClient();
  const { casa, cliente, operacion, correccion, antes } = ctx;
  const comision =
    comisionEscrita ?? (antes ? comisionAlCorregir(antes, { precio, moneda, operacion }) : null) ?? comisionEstimada(precio, corredor.comision_pct, operacion);
  // El mismo cierre otra vez (doble toque en Guardar, o "Cambiar el cierre" sin cambiar nada): no se escribe ni se anota
  // un "Cierre corregido" que no corrigió nada.
  if (
    correccion &&
    antes &&
    antes.precio === precio &&
    antes.moneda === moneda &&
    antes.comision === comision &&
    ((cliente?.cierre_propiedad_id as string | null) ?? null) === (casa?.id ?? null)
  ) {
    return "igual";
  }
  const ahora = new Date().toISOString();
  // Corregir un cierre ya anotado ("Cambiar el cierre") no lo vuelve a fechar: se quedan el día del cierre y el de la etapa.
  const { error } = await db
    .from("contactos")
    .update({
      etapa: "cerrado",
      etapa_at: correccion ? ((cliente?.etapa_at as string | null) ?? ahora) : ahora,
      motivo_perdida: null,
      cierre_propiedad_id: casa?.id ?? null,
      cierre_precio: precio,
      cierre_comision: comision,
      cierre_moneda: moneda,
      cierre_at: correccion ? ((cliente?.cierre_at as string | null) ?? ahora) : ahora,
    })
    .eq("corredor_id", corredor.id)
    .eq("id", id);
  if (error) return false;
  await anotar(
    db,
    corredor.id,
    id,
    "cierre",
    `${correccion ? "Cierre corregido: " : ""}${operacion === "alquiler" ? "Alquiló" : "Cerró"}${casa ? ` ${casa.titulo}` : ""} en ${montoContable(precio, moneda)}${operacion === "alquiler" ? " al mes" : ""} · comisión ${montoContable(comision, moneda)}${pct !== null ? ` (${porcentaje(pct)})` : ""}`,
  );
  return correccion ? "corregido" : "nuevo";
}

const AVISO_CIERRE = { nuevo: "¡Felicidades! Cierre guardado.", corregido: "Listo, cierre corregido.", igual: "Listo, el cierre ya estaba así." };

/**
 * "Cerró" desde la ficha: qué casa, a qué precio y cuánto se ganó. También corrige un cierre ya anotado. Devuelve el
 * resultado sin redirigir: con un aviso de la validación, el formulario se queda abierto y con lo que se escribió (una
 * redirección con ?aviso= volvía a montar la página y el campo mostraba otra cifra).
 */
export async function anotarCierre(f: FormData): Promise<{ ok: true; aviso: string } | { ok: false; motivo: string }> {
  const id = texto(f, "id");
  if (!idValido(id)) return { ok: false, motivo: "No se encontró el cliente." };
  const { supabase, corredor } = await sesionConCorredor();
  const { data: propio } = await supabase.from("contactos").select("id").eq("corredor_id", corredor.id).eq("id", id).maybeSingle();
  if (!propio) return { ok: false, motivo: "No se encontró el cliente." };
  const moneda = monedaDe(texto(f, "moneda"));
  const ctx = await contextoCierre(corredor.id, id, texto(f, "casa") || null);
  const cierre = validarCon(ctx, texto(f, "precio"), texto(f, "comision"), moneda);
  if (!cierre.ok) return { ok: false, motivo: cierre.motivo };
  const r = await registrarCierre(corredor, id, ctx, cierre.precio, moneda, cierre.comision, cierre.porcentaje);
  if (!r) return { ok: false, motivo: "No se pudo guardar. Vuelve a intentarlo." };
  revalidatePath(`/panel/clientes/${id}`);
  revalidatePath("/panel/clientes");
  revalidatePath("/panel");
  return { ok: true, aviso: AVISO_CIERRE[r] };
}

/** Lo mismo con redirección (formularios sin JavaScript): el aviso vuelve en ?aviso=. */
export async function guardarCierre(f: FormData) {
  const id = texto(f, "id");
  await clientePropio(id);
  const r = await anotarCierre(f);
  volverA(id, r.ok ? r.aviso : r.motivo);
}

/**
 * "Cerró" desde el tablero: al soltar al cliente en Cerró se pide el precio. La casa es la que le interesa
 * o, si no tiene, la que propone el tablero (la última que fue a ver); casaPropia comprueba que sea suya.
 */
export async function cerrarDesdeTablero(
  id: string,
  datos: { precio: string; moneda: string; comision: string; casa?: string },
): Promise<{ ok: true } | { ok: false; motivo: string }> {
  if (!idValido(id)) return { ok: false, motivo: "No se encontró el cliente." };
  const { supabase, corredor } = await sesionConCorredor();
  const { data: propio } = await supabase.from("contactos").select("id, propiedad_interes_id").eq("corredor_id", corredor.id).eq("id", id).maybeSingle();
  if (!propio) return { ok: false, motivo: "No se encontró el cliente." };
  const moneda = monedaDe(datos?.moneda);
  const ctx = await contextoCierre(corredor.id, id, (propio.propiedad_interes_id as string | null) ?? (datos?.casa ? String(datos.casa) : null));
  const cierre = validarCon(ctx, String(datos?.precio ?? ""), String(datos?.comision ?? ""), moneda);
  if (!cierre.ok) return { ok: false, motivo: cierre.motivo };
  const ok = await registrarCierre(corredor, id, ctx, cierre.precio, moneda, cierre.comision, cierre.porcentaje);
  revalidatePath("/panel/clientes");
  revalidatePath(`/panel/clientes/${id}`);
  return ok ? { ok: true } : { ok: false, motivo: "No se pudo guardar. Vuelve a intentarlo." };
}

/** Une dos clientes que son la misma persona: el de la ficha queda y el elegido se le une. */
export async function unirCliente(f: FormData) {
  const queda = texto(f, "id");
  const sale = texto(f, "otro");
  const corredor = await clientePropio(queda);
  await clientePropio(sale);
  const { data, error } = await createAdminClient().rpc("unir_contactos", { p_corredor: corredor.id, p_queda: queda, p_sale: sale });
  volverA(queda, !error && data ? "Listo, quedaron unidos en este cliente." : "No se pudieron unir. Vuelve a intentarlo.");
}
