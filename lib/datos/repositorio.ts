import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  Cita,
  CitaCalendario,
  CitaParaRecordar,
  Contacto,
  DatosAgenda,
  EstadoCita,
  NuevaCita,
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

  // Agenda
  datosAgenda(corredorId: string, desde: Date, hasta: Date): Promise<DatosAgenda>;
  citasProximasContacto(corredorId: string, contactoId: string, desde: Date): Promise<Cita[]>;
  /** Devuelve null si el horario ya está tomado (restricción citas_sin_choques). */
  crearCita(cita: NuevaCita): Promise<string | null>;
  /** Cambia el estado solo si la cita está activa. true si cambió. */
  cambiarEstadoCita(corredorId: string, citaId: string, estado: EstadoCita): Promise<boolean>;
  citasParaRecordar(desde: Date, hasta: Date): Promise<CitaParaRecordar[]>;
  /** Marca el recordatorio. true solo para la llamada que lo marcó (evita recordatorios dobles). */
  marcarRecordatorio(corredorId: string, citaId: string): Promise<boolean>;
  calendarioPorToken(token: string, desde: Date): Promise<{ nombre: string; citas: CitaCalendario[] } | null>;
}

const UNICA_VIOLADA = "23505";
const EXCLUSION_VIOLADA = "23P01";
const CITA_ACTIVA = ["agendada", "confirmada"];

// Las relaciones embebidas de PostgREST llegan como objeto (muchos a uno).
type Embebido<T> = T | T[] | null;
function uno<T>(v: Embebido<T>): T | null {
  return Array.isArray(v) ? (v[0] ?? null) : v;
}

function verificar(error: { message: string; code?: string } | null, que: string): void {
  if (error) throw new Error(`${que}: ${error.code ?? ""} ${error.message}`);
}

export function crearRepositorioSupabase(db: SupabaseClient): Repositorio {
  return {
    async corredorPorPhoneNumberId(phoneNumberId) {
      const { data, error } = await db
        .from("corredores")
        .select(
          "id, nombre, nombre_contacto, whatsapp_phone_number_id, whatsapp_corredor, zona_horaria, tono, reglas_escalamiento, tope_mensajes_mes, aviso_mensajes_mes, respuesta_automatica, duracion_visita_min, margen_visitas_min, anticipacion_min_horas, horizonte_agenda_dias",
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
          "id, codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno, descripcion, amenidades, url_e24, estado",
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

    async datosAgenda(corredorId, desde, hasta) {
      const [horarios, bloqueos, citas] = await Promise.all([
        db.from("horarios_visitas").select("dia_semana, hora_inicio, hora_fin").eq("corredor_id", corredorId),
        db
          .from("bloqueos_agenda")
          .select("inicio, fin")
          .eq("corredor_id", corredorId)
          .lt("inicio", hasta.toISOString())
          .gt("fin", desde.toISOString()),
        db
          .from("citas")
          .select("inicio, fin")
          .eq("corredor_id", corredorId)
          .in("estado", CITA_ACTIVA)
          .lt("inicio", hasta.toISOString())
          .gt("fin", desde.toISOString()),
      ]);
      verificar(horarios.error, "datosAgenda (horarios)");
      verificar(bloqueos.error, "datosAgenda (bloqueos)");
      verificar(citas.error, "datosAgenda (citas)");
      const fechas = (filas: { inicio: string; fin: string }[] | null) =>
        (filas ?? []).map((f) => ({ inicio: new Date(f.inicio), fin: new Date(f.fin) }));
      return {
        horarios: horarios.data ?? [],
        bloqueos: fechas(bloqueos.data),
        citas: fechas(citas.data),
      };
    },

    async citasProximasContacto(corredorId, contactoId, desde) {
      const { data, error } = await db
        .from("citas")
        .select("id, inicio, fin, estado, propiedades(titulo)")
        .eq("corredor_id", corredorId)
        .eq("contacto_id", contactoId)
        .in("estado", CITA_ACTIVA)
        .gte("inicio", desde.toISOString())
        .order("inicio");
      verificar(error, "citasProximasContacto");
      return (data ?? []).map((c) => ({
        id: c.id as string,
        inicio: new Date(c.inicio as string),
        fin: new Date(c.fin as string),
        estado: c.estado as EstadoCita,
        propiedad_titulo: uno(c.propiedades as Embebido<{ titulo: string }>)?.titulo ?? null,
      }));
    },

    async crearCita(cita) {
      const { data, error } = await db
        .from("citas")
        .insert({ ...cita, inicio: cita.inicio.toISOString(), fin: cita.fin.toISOString() })
        .select("id")
        .single();
      if (error?.code === EXCLUSION_VIOLADA) return null;
      verificar(error, "crearCita");
      return (data as { id: string }).id;
    },

    async cambiarEstadoCita(corredorId, citaId, estado) {
      const { data, error } = await db
        .from("citas")
        .update({ estado })
        .eq("corredor_id", corredorId)
        .eq("id", citaId)
        .in("estado", CITA_ACTIVA)
        .select("id");
      verificar(error, "cambiarEstadoCita");
      return (data ?? []).length > 0;
    },

    async citasParaRecordar(desde, hasta) {
      const { data, error } = await db
        .from("citas")
        .select(
          "id, corredor_id, contacto_id, conversacion_id, inicio, created_at, contactos(telefono), propiedades(titulo), corredores!inner(whatsapp_phone_number_id, zona_horaria, nombre_contacto, activo)",
        )
        .in("estado", CITA_ACTIVA)
        .is("recordatorio_enviado_at", null)
        .gte("inicio", desde.toISOString())
        .lte("inicio", hasta.toISOString())
        .eq("corredores.activo", true)
        .not("corredores.whatsapp_phone_number_id", "is", null);
      verificar(error, "citasParaRecordar");
      return (data ?? []).flatMap((c) => {
        const corredor = uno(
          c.corredores as Embebido<{ whatsapp_phone_number_id: string; zona_horaria: string; nombre_contacto: string }>,
        );
        const contacto = uno(c.contactos as Embebido<{ telefono: string }>);
        if (!corredor || !contacto) return [];
        return [
          {
            id: c.id as string,
            corredor_id: c.corredor_id as string,
            contacto_id: c.contacto_id as string,
            conversacion_id: (c.conversacion_id as string | null) ?? null,
            inicio: new Date(c.inicio as string),
            creada: new Date(c.created_at as string),
            telefono: contacto.telefono,
            propiedad_titulo: uno(c.propiedades as Embebido<{ titulo: string }>)?.titulo ?? null,
            phone_number_id: corredor.whatsapp_phone_number_id,
            zona_horaria: corredor.zona_horaria,
            nombre_contacto: corredor.nombre_contacto,
          },
        ];
      });
    },

    async marcarRecordatorio(corredorId, citaId) {
      const { data, error } = await db
        .from("citas")
        .update({ recordatorio_enviado_at: new Date().toISOString() })
        .eq("corredor_id", corredorId)
        .eq("id", citaId)
        .is("recordatorio_enviado_at", null)
        .select("id");
      verificar(error, "marcarRecordatorio");
      return (data ?? []).length > 0;
    },

    async calendarioPorToken(token, desde) {
      const { data: corredor, error } = await db
        .from("corredores")
        .select("id, nombre")
        .eq("token_calendario", token)
        .eq("activo", true)
        .maybeSingle();
      verificar(error, "calendarioPorToken (corredor)");
      if (!corredor) return null;
      const { data, error: e2 } = await db
        .from("citas")
        .select("id, inicio, fin, estado, notas, updated_at, contactos(nombre, telefono), propiedades(titulo, codigo)")
        .eq("corredor_id", corredor.id)
        .gte("inicio", desde.toISOString())
        .order("inicio")
        .limit(500);
      verificar(e2, "calendarioPorToken (citas)");
      return {
        nombre: corredor.nombre as string,
        citas: (data ?? []).map((c) => {
          const contacto = uno(c.contactos as Embebido<{ nombre: string | null; telefono: string }>);
          const propiedad = uno(c.propiedades as Embebido<{ titulo: string; codigo: string }>);
          return {
            id: c.id as string,
            inicio: new Date(c.inicio as string),
            fin: new Date(c.fin as string),
            estado: c.estado as EstadoCita,
            cliente_nombre: contacto?.nombre ?? null,
            cliente_telefono: contacto?.telefono ?? "",
            propiedad_titulo: propiedad?.titulo ?? null,
            propiedad_codigo: propiedad?.codigo ?? null,
            notas: (c.notas as string | null) ?? null,
            updated_at: new Date(c.updated_at as string),
          };
        }),
      };
    },
  };
}
