import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Contacto,
  Conversacion,
  Corredor,
  Mensaje,
  NuevoMensaje,
  Propiedad,
  UsoDelta,
  UsoMensual,
} from "./tipos";

// Acceso a datos del backend. Corre con service_role (sin RLS): cada consulta filtra por corredor_id.
export interface Repositorio {
  corredorPorPhoneNumberId(phoneNumberId: string): Promise<Corredor | null>;
  contacto(corredorId: string, telefono: string, nombrePerfil: string | null): Promise<Contacto>;
  conversacionActiva(corredorId: string, contactoId: string): Promise<Conversacion>;
  /** Devuelve null si el wa_message_id ya estaba guardado (Meta reintentó el webhook). */
  guardarMensaje(mensaje: NuevoMensaje): Promise<string | null>;
  actualizarMensaje(
    corredorId: string,
    id: string,
    cambios: Partial<Pick<NuevoMensaje, "wa_message_id" | "estado_entrega" | "intencion">>,
  ): Promise<void>;
  actualizarConversacion(
    corredorId: string,
    id: string,
    cambios: Partial<{ estado: Conversacion["estado"]; ultimo_mensaje_cliente_at: string }>,
  ): Promise<void>;
  historial(corredorId: string, conversacionId: string, limite: number): Promise<Mensaje[]>;
  propiedadesActivas(corredorId: string): Promise<Propiedad[]>;
  registrarUso(corredorId: string, delta: UsoDelta): Promise<UsoMensual>;
  /** Marca el aviso de tope del mes. true solo para la llamada que lo marcó (evita avisos dobles). */
  marcarAvisoTope(corredorId: string, mes: string): Promise<boolean>;
  actualizarEstadoEntrega(waMessageId: string, estado: NonNullable<NuevoMensaje["estado_entrega"]>): Promise<void>;
}

const UNICA_VIOLADA = "23505";

function verificar(error: { message: string; code?: string } | null, que: string): void {
  if (error) throw new Error(`${que}: ${error.code ?? ""} ${error.message}`);
}

export function crearRepositorioSupabase(db: SupabaseClient): Repositorio {
  return {
    async corredorPorPhoneNumberId(phoneNumberId) {
      const { data, error } = await db
        .from("corredores")
        .select(
          "id, nombre, nombre_contacto, whatsapp_phone_number_id, whatsapp_corredor, zona_horaria, tono, reglas_escalamiento, tope_mensajes_mes, aviso_mensajes_mes, respuesta_automatica",
        )
        .eq("whatsapp_phone_number_id", phoneNumberId)
        .eq("activo", true)
        .maybeSingle();
      verificar(error, "corredorPorPhoneNumberId");
      return data as Corredor | null;
    },

    async contacto(corredorId, telefono, nombrePerfil) {
      const { error } = await db
        .from("contactos")
        .upsert(
          { corredor_id: corredorId, telefono, nombre: nombrePerfil, origen: "whatsapp" },
          { onConflict: "corredor_id,telefono", ignoreDuplicates: true },
        );
      verificar(error, "contacto (insertar)");
      const { data, error: e2 } = await db
        .from("contactos")
        .select("id, corredor_id, telefono, nombre")
        .eq("corredor_id", corredorId)
        .eq("telefono", telefono)
        .single();
      verificar(e2, "contacto (leer)");
      return data as Contacto;
    },

    async conversacionActiva(corredorId, contactoId) {
      const buscar = async () => {
        const { data, error } = await db
          .from("conversaciones")
          .select("id, corredor_id, contacto_id, estado, control")
          .eq("corredor_id", corredorId)
          .eq("contacto_id", contactoId)
          .neq("estado", "cerrada")
          .maybeSingle();
        verificar(error, "conversacionActiva (leer)");
        return data as Conversacion | null;
      };
      const existente = await buscar();
      if (existente) return existente;
      const { data, error } = await db
        .from("conversaciones")
        .insert({ corredor_id: corredorId, contacto_id: contactoId })
        .select("id, corredor_id, contacto_id, estado, control")
        .single();
      if (error?.code === UNICA_VIOLADA) {
        const otra = await buscar();
        if (otra) return otra;
      }
      verificar(error, "conversacionActiva (crear)");
      return data as Conversacion;
    },

    async guardarMensaje(mensaje) {
      const { data, error } = await db.from("mensajes").insert(mensaje).select("id").single();
      if (error?.code === UNICA_VIOLADA) return null;
      verificar(error, "guardarMensaje");
      return (data as { id: string }).id;
    },

    async actualizarMensaje(corredorId, id, cambios) {
      const { error } = await db.from("mensajes").update(cambios).eq("corredor_id", corredorId).eq("id", id);
      verificar(error, "actualizarMensaje");
    },

    async actualizarConversacion(corredorId, id, cambios) {
      const { error } = await db
        .from("conversaciones")
        .update(cambios)
        .eq("corredor_id", corredorId)
        .eq("id", id);
      verificar(error, "actualizarConversacion");
    },

    async historial(corredorId, conversacionId, limite) {
      const { data, error } = await db
        .from("mensajes")
        .select("id, direccion, autor, contenido, estado_borrador, created_at")
        .eq("corredor_id", corredorId)
        .eq("conversacion_id", conversacionId)
        .order("created_at", { ascending: false })
        .limit(limite);
      verificar(error, "historial");
      return ((data ?? []) as Mensaje[]).reverse();
    },

    async propiedadesActivas(corredorId) {
      const { data, error } = await db
        .from("propiedades")
        .select(
          "codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno, descripcion, amenidades, url_e24, estado",
        )
        .eq("corredor_id", corredorId)
        .in("estado", ["activa", "reservada"])
        .order("codigo");
      verificar(error, "propiedadesActivas");
      return (data ?? []) as Propiedad[];
    },

    async registrarUso(corredorId, d) {
      const { data, error } = await db.rpc("registrar_uso", {
        p_corredor_id: corredorId,
        p_mensajes_entrantes: d.mensajesEntrantes ?? 0,
        p_mensajes_salientes: d.mensajesSalientes ?? 0,
        p_llamadas_claude: d.llamadasClaude ?? 0,
        p_tokens_entrada: d.tokensEntrada ?? 0,
        p_tokens_salida: d.tokensSalida ?? 0,
        p_costo_claude_usd: d.costoClaudeUsd ?? 0,
        p_costo_whatsapp_usd: 0,
      });
      verificar(error, "registrarUso");
      return data as UsoMensual;
    },

    async marcarAvisoTope(corredorId, mes) {
      const { data, error } = await db
        .from("uso_mensual")
        .update({ aviso_tope_enviado_at: new Date().toISOString() })
        .eq("corredor_id", corredorId)
        .eq("mes", mes)
        .is("aviso_tope_enviado_at", null)
        .select("mes");
      verificar(error, "marcarAvisoTope");
      return (data ?? []).length > 0;
    },

    async actualizarEstadoEntrega(waMessageId, estado) {
      const { error } = await db.from("mensajes").update({ estado_entrega: estado }).eq("wa_message_id", waMessageId);
      verificar(error, "actualizarEstadoEntrega");
    },
  };
}
