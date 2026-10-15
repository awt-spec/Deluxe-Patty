import type { SupabaseClient } from "@supabase/supabase-js";
import type {
  AnuncioPorVencer,
  AnuncioResumen,
  Cita,
  CitaCalendario,
  CitaParaRecordar,
  Contacto,
  DatosAgenda,
  DatosPlan,
  EstadoCita,
  NuevaCita,
  Conversacion,
  Corredor,
  Mensaje,
  NuevoMensaje,
  Propiedad,
  PropiedadConFotos,
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

  // Asistente Base
  /** Contacto del propio corredor (es_corredor = true), para su conversación con la asistente. */
  contactoCorredor(corredorId: string, telefono: string): Promise<Contacto>;
  /** Último mensaje que el contacto le escribió a la asistente (ventana de 24 horas). */
  ultimoMensajeDe(corredorId: string, contactoId: string): Promise<Date | null>;
  corredoresActivos(): Promise<Corredor[]>;
  /** Citas de hoy y mañana, prospectos de las 24 horas previas a `ahora`, pendientes. */
  datosPlan(
    corredorId: string,
    ahora: Date,
    hoy: { desde: Date; hasta: Date },
    manana: { desde: Date; hasta: Date },
  ): Promise<DatosPlan>;
  /** Guarda el plan del día. false si ya había uno para esa fecha. */
  guardarPlan(corredorId: string, fecha: string, contenido: string): Promise<boolean>;
  /** Plan del día generado y todavía no entregado. */
  planPendiente(corredorId: string, fecha: string): Promise<string | null>;
  marcarPlanEnviado(corredorId: string, fecha: string): Promise<void>;

  // Anuncios de Encuentra24
  /** Enlaza un contacto sin origen al anuncio con esa referencia. true si lo enlazó. */
  atribuirContacto(corredorId: string, contactoId: string, referencia: string): Promise<boolean>;
  propiedadPorCodigo(corredorId: string, codigo: string): Promise<PropiedadConFotos | null>;
  /** Crea o reescribe el borrador de anuncio de la propiedad; devuelve su referencia. */
  guardarBorradorAnuncio(
    corredorId: string,
    propiedadId: string,
    titulo: string,
    texto: Record<string, unknown>,
  ): Promise<string>;
  /** Anuncios no eliminados, con contactos atribuidos desde `desde` y en total. */
  reporteAnuncios(corredorId: string, desde: Date): Promise<AnuncioResumen[]>;
  /** Anuncios activos que vencen entre las dos fechas (YYYY-MM-DD) y aún no tienen aviso. */
  anunciosPorVencer(corredorId: string, desde: string, hasta: string): Promise<AnuncioPorVencer[]>;
  /** Marca el aviso de vencimiento; devuelve los ids que esta llamada marcó. */
  marcarAvisoVencimiento(corredorId: string, ids: string[]): Promise<string[]>;

  // Envíos que esperan a que el corredor abra la ventana de 24 horas
  guardarEnvioPendiente(corredorId: string, tipo: "lista_duenos", contenido: string): Promise<void>;
  enviosPendientes(corredorId: string): Promise<{ id: string; contenido: string }[]>;
  /** true solo para la llamada que lo marcó (evita entregarlo dos veces). */
  marcarEnvioEntregado(corredorId: string, id: string): Promise<boolean>;
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

const COLUMNAS_CORREDOR =
  "id, nombre, nombre_contacto, whatsapp_numero, whatsapp_phone_number_id, whatsapp_corredor, zona_horaria, tono, reglas_escalamiento, tope_mensajes_mes, aviso_mensajes_mes, respuesta_automatica, duracion_visita_min, margen_visitas_min, anticipacion_min_horas, horizonte_agenda_dias, hora_plan_dia";

export function crearRepositorioSupabase(db: SupabaseClient): Repositorio {
  return {
    async corredorPorPhoneNumberId(phoneNumberId) {
      const { data, error } = await db
        .from("corredores")
        .select(COLUMNAS_CORREDOR)
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

    async contactoCorredor(corredorId, telefono) {
      const { data, error } = await db
        .from("contactos")
        .upsert(
          { corredor_id: corredorId, telefono, origen: "otro", es_corredor: true },
          { onConflict: "corredor_id,telefono" },
        )
        .select("id, corredor_id, telefono, nombre")
        .single();
      verificar(error, "contactoCorredor");
      return data as Contacto;
    },

    async ultimoMensajeDe(corredorId, contactoId) {
      const { data, error } = await db
        .from("conversaciones")
        .select("ultimo_mensaje_cliente_at")
        .eq("corredor_id", corredorId)
        .eq("contacto_id", contactoId)
        .not("ultimo_mensaje_cliente_at", "is", null)
        .order("ultimo_mensaje_cliente_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      verificar(error, "ultimoMensajeDe");
      return data ? new Date(data.ultimo_mensaje_cliente_at as string) : null;
    },

    async corredoresActivos() {
      const { data, error } = await db
        .from("corredores")
        .select(COLUMNAS_CORREDOR)
        .eq("activo", true)
        .not("whatsapp_phone_number_id", "is", null)
        .not("whatsapp_corredor", "is", null);
      verificar(error, "corredoresActivos");
      return (data ?? []) as Corredor[];
    },

    async datosPlan(corredorId, ahora, hoy, manana) {
      const [citas, prospectos, escaladas, borradores, citasManana] = await Promise.all([
        db
          .from("citas")
          .select("inicio, estado, contactos(nombre, telefono), propiedades(titulo)")
          .eq("corredor_id", corredorId)
          .in("estado", CITA_ACTIVA)
          .gte("inicio", hoy.desde.toISOString())
          .lt("inicio", hoy.hasta.toISOString())
          .order("inicio"),
        db
          .from("contactos")
          .select("nombre, telefono")
          .eq("corredor_id", corredorId)
          .eq("es_corredor", false)
          .gte("created_at", new Date(ahora.getTime() - 24 * 60 * 60_000).toISOString())
          .lt("created_at", ahora.toISOString())
          .order("created_at"),
        db
          .from("conversaciones")
          .select("contactos!inner(nombre, telefono, es_corredor)")
          .eq("corredor_id", corredorId)
          .eq("estado", "escalada")
          .eq("contactos.es_corredor", false),
        db
          .from("mensajes")
          .select("id", { count: "exact", head: true })
          .eq("corredor_id", corredorId)
          .eq("estado_borrador", "pendiente"),
        db
          .from("citas")
          .select("id", { count: "exact", head: true })
          .eq("corredor_id", corredorId)
          .in("estado", CITA_ACTIVA)
          .gte("inicio", manana.desde.toISOString())
          .lt("inicio", manana.hasta.toISOString()),
      ]);
      verificar(citas.error, "datosPlan (citas)");
      verificar(prospectos.error, "datosPlan (prospectos)");
      verificar(escaladas.error, "datosPlan (escaladas)");
      verificar(borradores.error, "datosPlan (borradores)");
      verificar(citasManana.error, "datosPlan (citas mañana)");
      const nombre = (c: { nombre: string | null; telefono: string } | null) => c?.nombre ?? c?.telefono ?? "Cliente";
      return {
        citasHoy: (citas.data ?? []).map((c) => ({
          inicio: new Date(c.inicio as string),
          estado: c.estado as EstadoCita,
          cliente: nombre(uno(c.contactos as Embebido<{ nombre: string | null; telefono: string }>)),
          propiedad: uno(c.propiedades as Embebido<{ titulo: string }>)?.titulo ?? null,
        })),
        prospectosNuevos: (prospectos.data ?? []).map((c) => nombre(c as { nombre: string | null; telefono: string })),
        conversacionesEscaladas: (escaladas.data ?? []).map((c) =>
          nombre(uno(c.contactos as Embebido<{ nombre: string | null; telefono: string }>)),
        ),
        borradoresPendientes: borradores.count ?? 0,
        citasManana: citasManana.count ?? 0,
      };
    },

    async guardarPlan(corredorId, fecha, contenido) {
      const { data, error } = await db
        .from("planes_dia")
        .upsert({ corredor_id: corredorId, fecha, contenido }, { onConflict: "corredor_id,fecha", ignoreDuplicates: true })
        .select("fecha");
      verificar(error, "guardarPlan");
      return (data ?? []).length > 0;
    },

    async planPendiente(corredorId, fecha) {
      const { data, error } = await db
        .from("planes_dia")
        .select("contenido")
        .eq("corredor_id", corredorId)
        .eq("fecha", fecha)
        .is("enviado_at", null)
        .maybeSingle();
      verificar(error, "planPendiente");
      return (data?.contenido as string | undefined) ?? null;
    },

    async marcarPlanEnviado(corredorId, fecha) {
      const { error } = await db
        .from("planes_dia")
        .update({ enviado_at: new Date().toISOString() })
        .eq("corredor_id", corredorId)
        .eq("fecha", fecha);
      verificar(error, "marcarPlanEnviado");
    },

    async atribuirContacto(corredorId, contactoId, referencia) {
      const { data: anuncio, error } = await db
        .from("anuncios_e24")
        .select("id")
        .eq("corredor_id", corredorId)
        .eq("referencia", referencia.toUpperCase())
        .maybeSingle();
      verificar(error, "atribuirContacto (anuncio)");
      if (!anuncio) return false;
      const { data, error: e2 } = await db
        .from("contactos")
        .update({ anuncio_id: anuncio.id, origen: "anuncio" })
        .eq("corredor_id", corredorId)
        .eq("id", contactoId)
        .is("anuncio_id", null)
        .select("id");
      verificar(e2, "atribuirContacto (contacto)");
      return (data ?? []).length > 0;
    },

    async propiedadPorCodigo(corredorId, codigo) {
      const { data, error } = await db
        .from("propiedades")
        .select(
          "id, codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno, descripcion, amenidades, url_e24, estado, fotos",
        )
        .eq("corredor_id", corredorId)
        .ilike("codigo", codigo.replace(/[%_\\]/g, "\\$&"))
        .maybeSingle();
      verificar(error, "propiedadPorCodigo");
      return data as PropiedadConFotos | null;
    },

    async guardarBorradorAnuncio(corredorId, propiedadId, titulo, texto) {
      const buscar = async () => {
        const { data, error } = await db
          .from("anuncios_e24")
          .select("id, referencia")
          .eq("corredor_id", corredorId)
          .eq("propiedad_id", propiedadId)
          .eq("estado", "borrador")
          .maybeSingle();
        verificar(error, "guardarBorradorAnuncio (leer)");
        return data as { id: string; referencia: string } | null;
      };
      const existente = await buscar();
      if (existente) {
        const { error } = await db
          .from("anuncios_e24")
          .update({ titulo, texto_preparado: texto })
          .eq("corredor_id", corredorId)
          .eq("id", existente.id);
        verificar(error, "guardarBorradorAnuncio (actualizar)");
        return existente.referencia;
      }
      const { data, error } = await db
        .from("anuncios_e24")
        .insert({ corredor_id: corredorId, propiedad_id: propiedadId, estado: "borrador", titulo, texto_preparado: texto })
        .select("referencia")
        .single();
      if (error?.code === UNICA_VIOLADA) {
        const otro = await buscar();
        if (otro) return otro.referencia;
      }
      verificar(error, "guardarBorradorAnuncio (crear)");
      return (data as { referencia: string }).referencia;
    },

    async reporteAnuncios(corredorId, desde) {
      const [anuncios, contactos] = await Promise.all([
        db
          .from("anuncios_e24")
          .select("id, titulo, referencia, url, estado, vence_en, propiedades(titulo)")
          .eq("corredor_id", corredorId)
          .neq("estado", "eliminado"),
        db.from("contactos").select("anuncio_id, created_at").eq("corredor_id", corredorId).not("anuncio_id", "is", null),
      ]);
      verificar(anuncios.error, "reporteAnuncios (anuncios)");
      verificar(contactos.error, "reporteAnuncios (contactos)");
      const total = new Map<string, number>();
      const periodo = new Map<string, number>();
      for (const c of contactos.data ?? []) {
        const id = c.anuncio_id as string;
        total.set(id, (total.get(id) ?? 0) + 1);
        if (new Date(c.created_at as string) >= desde) periodo.set(id, (periodo.get(id) ?? 0) + 1);
      }
      return (anuncios.data ?? []).map((a) => ({
        id: a.id as string,
        titulo: (a.titulo as string | null) ?? null,
        referencia: a.referencia as string,
        url: (a.url as string | null) ?? null,
        estado: a.estado as AnuncioResumen["estado"],
        vence_en: (a.vence_en as string | null) ?? null,
        propiedad_titulo: uno(a.propiedades as Embebido<{ titulo: string }>)?.titulo ?? null,
        contactos_periodo: periodo.get(a.id as string) ?? 0,
        contactos_total: total.get(a.id as string) ?? 0,
      }));
    },

    async anunciosPorVencer(corredorId, desde, hasta) {
      const { data, error } = await db
        .from("anuncios_e24")
        .select("id, titulo, referencia, vence_en")
        .eq("corredor_id", corredorId)
        .eq("estado", "activo")
        .is("aviso_vencimiento_enviado_at", null)
        .gte("vence_en", desde)
        .lte("vence_en", hasta)
        .order("vence_en");
      verificar(error, "anunciosPorVencer");
      return (data ?? []) as AnuncioPorVencer[];
    },

    async marcarAvisoVencimiento(corredorId, ids) {
      if (ids.length === 0) return [];
      const { data, error } = await db
        .from("anuncios_e24")
        .update({ aviso_vencimiento_enviado_at: new Date().toISOString() })
        .eq("corredor_id", corredorId)
        .in("id", ids)
        .is("aviso_vencimiento_enviado_at", null)
        .select("id");
      verificar(error, "marcarAvisoVencimiento");
      return (data ?? []).map((a) => a.id as string);
    },

    async guardarEnvioPendiente(corredorId, tipo, contenido) {
      const { error } = await db.from("envios_pendientes").insert({ corredor_id: corredorId, tipo, contenido });
      verificar(error, "guardarEnvioPendiente");
    },

    async enviosPendientes(corredorId) {
      const { data, error } = await db
        .from("envios_pendientes")
        .select("id, contenido")
        .eq("corredor_id", corredorId)
        .is("enviado_at", null)
        .order("created_at");
      verificar(error, "enviosPendientes");
      return (data ?? []) as { id: string; contenido: string }[];
    },

    async marcarEnvioEntregado(corredorId, id) {
      const { data, error } = await db
        .from("envios_pendientes")
        .update({ enviado_at: new Date().toISOString() })
        .eq("corredor_id", corredorId)
        .eq("id", id)
        .is("enviado_at", null)
        .select("id");
      verificar(error, "marcarEnvioEntregado");
      return (data ?? []).length > 0;
    },
  };
}
