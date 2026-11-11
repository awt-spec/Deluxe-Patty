"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { sesionSuperadmin } from "@/lib/admin/superadmin";
import { monto } from "@/lib/admin/montos";
import { urlWebhook } from "@/lib/admin/urls";
import { errorSeguro } from "@/lib/monitoreo/errores";
import { normalizarTelefono } from "@/lib/panel/formularios";
import { createAdminClient } from "@/lib/supabase/admin";
import { ErrorWhatsApp, crearEnviadorWhatsApp, explicarErrorWhatsApp } from "@/lib/whatsapp/enviar";
import { appsSuscritas, configurarWebhook, registrarNumero, suscribirApp } from "@/lib/whatsapp/graph";

// Cambios del superadministrador. Cada acción vuelve a comprobar que quien la hace es superadmin y escribe
// con el backend. Ningún registro lleva correos, teléfonos, contraseñas ni llaves: solo el nombre de la acción.

const UUID = /^[0-9a-f-]{36}$/;
const ID_META = /^\d{5,25}$/;

function ir(ruta: string, mensaje: string, ok = false): never {
  // El mensaje va antes del ancla (#probar): lo que sigue a # nunca llega al servidor y la pantalla no lo vería.
  const [camino, ancla] = ruta.split("#");
  revalidatePath(camino.split("?")[0]);
  const sep = camino.includes("?") ? "&" : "?";
  redirect(`${camino}${sep}m=${encodeURIComponent(mensaje)}&ok=${ok ? 1 : 0}${ancla ? `#${ancla}` : ""}`);
}

const registro = (accion: string, ok: boolean) => console.info(JSON.stringify({ evento: "admin_accion", accion, ok }));
const texto = (f: FormData, k: string) => String(f.get(k) ?? "").trim();
const correoValido = (c: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(c) && c.length <= 200;

async function usuarioPorCorreo(db: SupabaseClient, correo: string) {
  const { data } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  return data?.users.find((u) => u.email?.toLowerCase() === correo.toLowerCase()) ?? null;
}

// --- IA y topes --------------------------------------------------------------------------------------

export async function guardarTopesPlataforma(f: FormData) {
  await sesionSuperadmin();
  const dia = monto(f.get("tope_dia"), false);
  const mes = monto(f.get("tope_mes"), false);
  if (dia === "error" || mes === "error" || dia === null || mes === null) ir("/admin/ia", "Revisa los montos: números en dólares, de 0 a 10.000.");
  const { error } = await createAdminClient()
    .from("plataforma")
    .update({ tope_ia_dia_usd: dia, tope_ia_mes_usd: mes, updated_at: new Date().toISOString() })
    .eq("id", true);
  registro("topes_plataforma", !error);
  ir("/admin/ia", error ? "No se pudo guardar." : "Topes de la plataforma guardados.", !error);
}

export async function guardarTopesCorredor(f: FormData) {
  await sesionSuperadmin();
  const id = texto(f, "id");
  if (!UUID.test(id)) ir("/admin/corredores", "No encontré ese corredor.");
  const ruta = `/admin/corredores/${id}`;
  const dia = monto(f.get("tope_dia"), true);
  const mes = monto(f.get("tope_mes"), true);
  if (dia === "error" || mes === "error") ir(ruta, "Revisa los montos: números en dólares, de 0 a 10.000, o vacío para usar el de la plataforma.");
  // Topes de mensajes de WhatsApp del mes: al llegar al tope la IA no contesta (el chat queda para el corredor).
  const tope = Number(texto(f, "tope_mensajes"));
  const aviso = Number(texto(f, "aviso_mensajes"));
  if (!Number.isInteger(tope) || !Number.isInteger(aviso) || tope < 1 || tope > 100_000 || aviso < 1) ir(ruta, "Los mensajes del mes son números enteros: el tope de 1 a 100.000 y el aviso de 1 al tope.");
  if (aviso > tope) ir(ruta, "El aviso no puede ser mayor que el tope de mensajes.");
  const { error } = await createAdminClient()
    .from("corredores")
    .update({ tope_ia_dia_usd: dia, tope_ia_mes_usd: mes, imagenes_activas: f.get("imagenes") === "on", tope_mensajes_mes: tope, aviso_mensajes_mes: aviso })
    .eq("id", id);
  registro("topes_corredor", !error);
  ir(ruta, error ? "No se pudo guardar." : "Topes guardados.", !error);
}

// --- Datos de un corredor ----------------------------------------------------------------------------

export async function guardarDatosCorredor(f: FormData) {
  await sesionSuperadmin();
  const id = texto(f, "id");
  if (!UUID.test(id)) ir("/admin/corredores", "No encontré ese corredor.");
  const ruta = `/admin/corredores/${id}`;

  const pnid = texto(f, "phone_number_id");
  if (pnid && !ID_META.test(pnid)) ir(ruta, "El Phone number ID son solo números (lo da Meta en Configuración de la API).");
  const numeroTxt = texto(f, "whatsapp_numero");
  const corredorTxt = texto(f, "whatsapp_corredor");
  const numero = numeroTxt ? normalizarTelefono(numeroTxt) : null;
  const celular = corredorTxt ? normalizarTelefono(corredorTxt) : null;
  if (numeroTxt && !numero) ir(ruta, "El número de la asistente no es válido. Escríbelo con código de país, por ejemplo +506 8888 8888.");
  if (corredorTxt && !celular) ir(ruta, "El celular del corredor no es válido. Escríbelo con código de país, por ejemplo +506 8888 8888.");

  const { error } = await createAdminClient()
    .from("corredores")
    .update({
      activo: f.get("activo") === "on",
      respuesta_automatica: f.get("respuesta_automatica") === "on",
      whatsapp_phone_number_id: pnid || null,
      whatsapp_numero: numero,
      whatsapp_corredor: celular,
    })
    .eq("id", id);
  registro("datos_corredor", !error);
  if (error) ir(ruta, error.code === "23505" ? "Ese número ya lo usa otro corredor." : "No se pudo guardar.");
  ir(ruta, "Datos guardados.", true);
}

// --- Probar WhatsApp ---------------------------------------------------------------------------------

/**
 * Plantilla hello_world de Meta (viene aprobada en todo número, en inglés) al celular que se escriba, desde el
 * número del corredor. El resultado vuelve en la propia pantalla del corredor.
 */
export async function probarWhatsApp(f: FormData) {
  await sesionSuperadmin();
  const id = texto(f, "id");
  if (!UUID.test(id)) ir("/admin/corredores", "No encontré ese corredor.");
  const ruta = `/admin/corredores/${id}#probar`;
  const para = normalizarTelefono(texto(f, "telefono"));
  if (!para) ir(ruta, "Escribe el celular con código de país, por ejemplo +506 8888 8888.");
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) ir(ruta, "Falta WHATSAPP_ACCESS_TOKEN en Vercel.");
  const { data } = await createAdminClient().from("corredores").select("whatsapp_phone_number_id, activo").eq("id", id).maybeSingle();
  if (!data?.whatsapp_phone_number_id) ir(ruta, "Este corredor no tiene Phone number ID: ponlo en Datos y WhatsApp.");
  if (!data.activo) ir(ruta, "Un corredor inactivo no manda nada por WhatsApp.");
  try {
    await crearEnviadorWhatsApp(token).plantilla(data.whatsapp_phone_number_id, para, "hello_world", [], "en_US");
  } catch (e) {
    registro("probar_whatsapp", false);
    ir(ruta, `Meta rechazó el envío (${errorSeguro(e)}). ${explicarErrorWhatsApp(e)}`);
  }
  registro("probar_whatsapp", true);
  ir(ruta, "Meta aceptó el mensaje de prueba. Si en un minuto no llega, revisa que el celular esté verificado en la lista de prueba de Meta.", true);
}

// --- Conexión con Meta -------------------------------------------------------------------------------

export async function registrarNumeroWhatsApp(f: FormData) {
  await sesionSuperadmin();
  const pin = texto(f, "pin");
  if (!/^\d{6}$/.test(pin)) ir("/admin/whatsapp", "El PIN son 6 números que tú inventas (verificación en dos pasos).");
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) ir("/admin/whatsapp", "Falta WHATSAPP_ACCESS_TOKEN en Vercel.");
  const id = texto(f, "id");
  if (!UUID.test(id)) ir("/admin/whatsapp", "No encontré ese corredor.");
  const { data } = await createAdminClient().from("corredores").select("whatsapp_phone_number_id").eq("id", id).maybeSingle();
  if (!data?.whatsapp_phone_number_id) ir("/admin/whatsapp", "Ese corredor no tiene Phone number ID.");
  const r = await registrarNumero(token, data.whatsapp_phone_number_id, pin);
  registro("registrar_numero", r.ok);
  if (!r.ok) ir("/admin/whatsapp", `Meta no registró el número (estado ${r.status}${r.codigo ? ` · código ${r.codigo}` : ""}). ${explicarErrorWhatsApp(new ErrorWhatsApp(r.status, r.codigo))}`);
  ir("/admin/whatsapp", "Número registrado en la API de WhatsApp. Vuelve a probar el envío.", true);
}

export async function suscribirAppWhatsApp(f: FormData) {
  await sesionSuperadmin();
  const waba = texto(f, "waba");
  if (!ID_META.test(waba)) ir("/admin/whatsapp", "El WABA ID son solo números (Identificador de la cuenta de WhatsApp Business, en Meta).");
  const token = process.env.WHATSAPP_ACCESS_TOKEN;
  if (!token) ir("/admin/whatsapp", "Falta WHATSAPP_ACCESS_TOKEN en Vercel.");
  const r = await suscribirApp(token, waba);
  registro("suscribir_app", r.ok);
  if (!r.ok) ir(`/admin/whatsapp?waba=${waba}`, `Meta no suscribió la app (estado ${r.status}${r.codigo ? ` · código ${r.codigo}` : ""}). Revisa que el usuario del sistema tenga control total de la cuenta de WhatsApp.`);
  const apps = await appsSuscritas(token, waba);
  ir(`/admin/whatsapp?waba=${waba}`, `App suscrita a la cuenta${apps.ok ? ` (${apps.datos.data?.length ?? 0} app en total)` : ""}.`, true);
}

export async function conectarWebhook(f: FormData) {
  await sesionSuperadmin();
  const appId = texto(f, "app_id");
  if (!ID_META.test(appId)) ir("/admin/whatsapp", "El App ID son solo números (Configuración de la app → Básica en Meta).");
  const secreto = process.env.WHATSAPP_APP_SECRET;
  const verificacion = process.env.WHATSAPP_VERIFY_TOKEN;
  if (!secreto || !verificacion) ir("/admin/whatsapp", "Faltan WHATSAPP_APP_SECRET o WHATSAPP_VERIFY_TOKEN en Vercel. Ponlos y redespliega antes de conectar el webhook.");
  const r = await configurarWebhook(appId, secreto, await urlWebhook(), verificacion);
  registro("conectar_webhook", r.ok);
  if (!r.ok) {
    ir(
      "/admin/whatsapp",
      `Meta no aceptó el webhook (estado ${r.status}${r.codigo ? ` · código ${r.codigo}` : ""}). Lo más común: el WHATSAPP_VERIFY_TOKEN de Vercel no está desplegado todavía o el App ID no es de esta app.`,
    );
  }
  ir("/admin/whatsapp", "Webhook conectado: Meta verificó la dirección y quedó suscrito a los mensajes.", true);
}

// --- Accesos -----------------------------------------------------------------------------------------

export async function crearUsuario(f: FormData) {
  await sesionSuperadmin();
  const correo = texto(f, "correo").toLowerCase();
  const contrasena = String(f.get("contrasena") ?? "");
  const corredorId = texto(f, "corredor_id");
  const rol = texto(f, "rol") === "soporte" ? "soporte" : "corredor";
  if (!correoValido(correo)) ir("/admin/accesos", "Ese correo parece incompleto.");
  if (contrasena.length < 10 || contrasena.length > 72) ir("/admin/accesos", "La contraseña debe tener entre 10 y 72 caracteres.");
  if (corredorId && !UUID.test(corredorId)) ir("/admin/accesos", "No encontré ese corredor.");
  const db = createAdminClient();
  const { data, error } = await db.auth.admin.createUser({ email: correo, password: contrasena, email_confirm: true });
  if (error || !data.user) {
    registro("crear_usuario", false);
    ir("/admin/accesos", /already|registered|exists/i.test(error?.message ?? "") ? "Ese correo ya tiene usuario. Cámbiale la contraseña o dale acceso desde su fila." : "No se pudo crear el usuario.");
  }
  if (corredorId) {
    const { error: e2 } = await db.from("miembros").upsert({ corredor_id: corredorId, user_id: data.user.id, rol }, { onConflict: "corredor_id,user_id" });
    if (e2) ir("/admin/accesos", "El usuario se creó, pero no se pudo enlazar al corredor.");
  }
  registro("crear_usuario", true);
  ir("/admin/accesos", "Usuario creado. Ya puede entrar con su correo y contraseña.", true);
}

export async function cambiarContrasena(f: FormData) {
  await sesionSuperadmin();
  const id = texto(f, "user_id");
  const contrasena = String(f.get("contrasena") ?? "");
  if (!UUID.test(id)) ir("/admin/accesos", "No encontré ese usuario.");
  if (contrasena.length < 10 || contrasena.length > 72) ir("/admin/accesos", "La contraseña debe tener entre 10 y 72 caracteres.");
  const { error } = await createAdminClient().auth.admin.updateUserById(id, { password: contrasena });
  registro("cambiar_contrasena", !error);
  ir("/admin/accesos", error ? "No se pudo cambiar la contraseña." : "Contraseña cambiada.", !error);
}

export async function darAcceso(f: FormData) {
  await sesionSuperadmin();
  const corredorId = texto(f, "corredor_id");
  const correo = texto(f, "correo").toLowerCase();
  const rol = texto(f, "rol") === "soporte" ? "soporte" : "corredor";
  const volverA = texto(f, "volver") === "accesos" ? "/admin/accesos" : `/admin/corredores/${corredorId}#accesos`;
  if (!UUID.test(corredorId)) ir("/admin/corredores", "No encontré ese corredor.");
  if (!correoValido(correo)) ir(volverA, "Ese correo parece incompleto.");
  const db = createAdminClient();
  const usuario = await usuarioPorCorreo(db, correo);
  if (!usuario) ir(volverA, "Ese correo todavía no tiene usuario. Créalo en Accesos, con su contraseña.");
  const { error } = await db.from("miembros").upsert({ corredor_id: corredorId, user_id: usuario.id, rol }, { onConflict: "corredor_id,user_id" });
  registro("dar_acceso", !error);
  ir(volverA, error ? "No se pudo dar el acceso." : "Acceso dado.", !error);
}

export async function quitarAcceso(f: FormData) {
  await sesionSuperadmin();
  const corredorId = texto(f, "corredor_id");
  const userId = texto(f, "user_id");
  const volverA = texto(f, "volver") === "accesos" ? "/admin/accesos" : `/admin/corredores/${corredorId}#accesos`;
  if (!UUID.test(corredorId) || !UUID.test(userId)) ir("/admin/corredores", "No encontré ese acceso.");
  const { error } = await createAdminClient().from("miembros").delete().eq("corredor_id", corredorId).eq("user_id", userId);
  registro("quitar_acceso", !error);
  ir(volverA, error ? "No se pudo quitar el acceso." : "Acceso quitado.", !error);
}

export async function alternarSuperadmin(f: FormData) {
  const { correo: yo } = await sesionSuperadmin();
  const correo = texto(f, "correo").toLowerCase();
  const hacer = texto(f, "hacer") === "1";
  if (!correoValido(correo)) ir("/admin/accesos", "Ese correo parece incompleto.");
  const db = createAdminClient();
  if (hacer) {
    const { error } = await db.from("superadmins").upsert({ correo }, { onConflict: "correo" });
    registro("hacer_superadmin", !error);
    ir("/admin/accesos", error ? "No se pudo dar el permiso." : "Ahora es superadministrador.", !error);
  }
  // Quitar: nunca a uno mismo (quedarías fuera) y nunca al último.
  if (correo === yo.toLowerCase()) ir("/admin/accesos", "No puedes quitarte el permiso a ti mismo: pídeselo a otro superadministrador.");
  const { count } = await db.from("superadmins").select("correo", { count: "exact", head: true });
  if ((count ?? 0) <= 1) ir("/admin/accesos", "Tiene que quedar al menos un superadministrador.");
  const { error } = await db.from("superadmins").delete().eq("correo", correo);
  registro("quitar_superadmin", !error);
  ir("/admin/accesos", error ? "No se pudo quitar el permiso." : "Ya no es superadministrador.", !error);
}
