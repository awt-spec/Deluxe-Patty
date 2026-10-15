-- Esquema multicliente de la asistente IA para corredores inmobiliarios.
--
-- Reglas:
--   * Toda tabla de negocio lleva corredor_id y RLS activado.
--   * Un usuario autenticado solo ve los corredores de los que es miembro (tabla miembros).
--   * El backend (webhook de WhatsApp, cron, worker de Encuentra24) usa service_role y salta RLS;
--     por eso cada consulta del backend debe filtrar por corredor_id explícitamente.
--   * Las llaves foráneas entre tablas de negocio son compuestas (id, corredor_id), así una fila
--     nunca puede apuntar a datos de otro corredor aunque el backend se equivoque.

-- ---------------------------------------------------------------------------
-- Utilidades
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- corredores
-- ---------------------------------------------------------------------------

create table public.corredores (
  id                         uuid primary key default gen_random_uuid(),
  slug                       text not null unique check (slug ~ '^[a-z0-9-]+$'),
  nombre                     text not null,
  nombre_contacto            text not null,
  -- Número de la asistente en formato E.164 y el phone_number_id de WhatsApp Cloud API.
  whatsapp_numero            text unique check (whatsapp_numero ~ '^\+[1-9][0-9]{7,14}$'),
  whatsapp_phone_number_id   text unique,
  -- Número personal del corredor: ahí llegan el plan del día, escalamientos y avisos.
  whatsapp_corredor          text check (whatsapp_corredor ~ '^\+[1-9][0-9]{7,14}$'),
  calendario_id              text,
  zona_horaria               text not null default 'America/Costa_Rica',
  zonas                      text[] not null default '{}',
  precio_busqueda_min        numeric(14, 2),
  precio_busqueda_max        numeric(14, 2),
  -- Instrucciones de tono (se afinan en el piloto en sombra).
  tono                       text not null default '',
  -- Temas que la asistente nunca responde y siempre pasa al corredor.
  reglas_escalamiento        text[] not null default '{}',
  hora_plan_dia              time not null default '07:00',
  plan                       text not null default 'usd_299' check (plan in ('usd_299')),
  tope_mensajes_mes          integer not null default 1000 check (tope_mensajes_mes > 0),
  aviso_mensajes_mes         integer not null default 900 check (aviso_mensajes_mes > 0),
  -- false = piloto en sombra: la asistente redacta y el corredor aprueba.
  respuesta_automatica       boolean not null default false,
  activo                     boolean not null default true,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  check (aviso_mensajes_mes <= tope_mensajes_mes),
  check (precio_busqueda_min is null or precio_busqueda_max is null
         or precio_busqueda_min <= precio_busqueda_max)
);

-- ---------------------------------------------------------------------------
-- miembros: qué usuario de Supabase Auth puede ver qué corredor
-- ---------------------------------------------------------------------------

create table public.miembros (
  corredor_id  uuid not null references public.corredores (id) on delete cascade,
  user_id      uuid not null,
  rol          text not null default 'corredor' check (rol in ('corredor', 'soporte')),
  created_at   timestamptz not null default now(),
  primary key (corredor_id, user_id)
);

create index miembros_user_id_idx on public.miembros (user_id);

-- Corredores a los que pertenece el usuario actual. security definer para no
-- evaluar la RLS de miembros dentro de cada política (evita recursión y es más rápido).
create or replace function public.mis_corredores()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.corredor_id
  from public.miembros m
  where m.user_id = (select auth.uid());
$$;

revoke all on function public.mis_corredores() from public;
grant execute on function public.mis_corredores() to authenticated;

-- ---------------------------------------------------------------------------
-- propiedades
-- ---------------------------------------------------------------------------

create table public.propiedades (
  id               uuid primary key default gen_random_uuid(),
  corredor_id      uuid not null references public.corredores (id) on delete cascade,
  codigo           text not null,
  titulo           text not null,
  tipo             text not null check (tipo in ('casa', 'apartamento', 'lote', 'local', 'oficina', 'finca', 'otro')),
  operacion        text not null check (operacion in ('venta', 'alquiler')),
  precio           numeric(14, 2) check (precio is null or precio > 0),
  moneda           text not null default 'USD' check (moneda in ('USD', 'CRC')),
  provincia        text,
  canton           text,
  distrito         text,
  zona             text,
  habitaciones     smallint check (habitaciones is null or habitaciones >= 0),
  banos            numeric(3, 1) check (banos is null or banos >= 0),
  m2_construccion  numeric(10, 2) check (m2_construccion is null or m2_construccion > 0),
  m2_terreno       numeric(12, 2) check (m2_terreno is null or m2_terreno > 0),
  descripcion      text,
  amenidades       text[] not null default '{}',
  -- [{ "url": "...", "orden": 1, "mejorada_url": "..." }]
  fotos            jsonb not null default '[]' check (jsonb_typeof(fotos) = 'array'),
  url_e24          text,
  estado           text not null default 'activa' check (estado in ('activa', 'reservada', 'vendida', 'alquilada', 'inactiva')),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (corredor_id, codigo),
  unique (id, corredor_id)
);

create index propiedades_corredor_zona_idx on public.propiedades (corredor_id, zona) where estado = 'activa';

-- ---------------------------------------------------------------------------
-- anuncios_e24 (antes que contactos, porque contactos se atribuye a un anuncio)
-- ---------------------------------------------------------------------------

create table public.anuncios_e24 (
  id                            uuid primary key default gen_random_uuid(),
  corredor_id                   uuid not null references public.corredores (id) on delete cascade,
  propiedad_id                  uuid,
  e24_id                        text not null,
  url                           text not null,
  titulo                        text,
  -- Referencia corta que va en el enlace de WhatsApp del anuncio para atribuir contactos.
  referencia                    text not null,
  publicado_en                  date,
  vence_en                      date,
  estado                        text not null default 'activo' check (estado in ('activo', 'vencido', 'pausado', 'eliminado')),
  aviso_vencimiento_enviado_at  timestamptz,
  ultima_lectura_at             timestamptz,
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  unique (corredor_id, e24_id),
  unique (corredor_id, referencia),
  unique (id, corredor_id),
  foreign key (propiedad_id, corredor_id) references public.propiedades (id, corredor_id) on delete set null (propiedad_id)
);

create index anuncios_e24_vence_idx on public.anuncios_e24 (vence_en) where estado = 'activo';

-- ---------------------------------------------------------------------------
-- contactos
-- ---------------------------------------------------------------------------

create table public.contactos (
  id           uuid primary key default gen_random_uuid(),
  corredor_id  uuid not null references public.corredores (id) on delete cascade,
  telefono     text not null check (telefono ~ '^\+[1-9][0-9]{7,14}$'),
  nombre       text,
  email        text,
  origen       text not null default 'whatsapp' check (origen in ('anuncio', 'referido', 'busqueda', 'whatsapp', 'otro')),
  anuncio_id   uuid,
  notas        text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (corredor_id, telefono),
  unique (id, corredor_id),
  foreign key (anuncio_id, corredor_id) references public.anuncios_e24 (id, corredor_id) on delete set null (anuncio_id)
);

create index contactos_anuncio_idx on public.contactos (anuncio_id) where anuncio_id is not null;

-- ---------------------------------------------------------------------------
-- conversaciones / mensajes
-- ---------------------------------------------------------------------------

create table public.conversaciones (
  id                       uuid primary key default gen_random_uuid(),
  corredor_id              uuid not null references public.corredores (id) on delete cascade,
  contacto_id              uuid not null,
  estado                   text not null default 'abierta' check (estado in ('abierta', 'escalada', 'cerrada')),
  -- Quién lleva la conversación: la asistente o el corredor (tomó control desde el panel).
  control                  text not null default 'asistente' check (control in ('asistente', 'corredor')),
  -- Último mensaje del cliente: define la ventana de 24 horas de WhatsApp.
  ultimo_mensaje_cliente_at timestamptz,
  resumen                  text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  unique (id, corredor_id),
  foreign key (contacto_id, corredor_id) references public.contactos (id, corredor_id) on delete cascade
);

-- Una sola conversación abierta o escalada por contacto.
create unique index conversaciones_activa_por_contacto_idx
  on public.conversaciones (corredor_id, contacto_id) where estado <> 'cerrada';

create table public.mensajes (
  id               uuid primary key default gen_random_uuid(),
  corredor_id      uuid not null references public.corredores (id) on delete cascade,
  conversacion_id  uuid not null,
  direccion        text not null check (direccion in ('entrante', 'saliente')),
  autor            text not null check (autor in ('cliente', 'asistente', 'corredor', 'sistema')),
  tipo             text not null default 'texto' check (tipo in ('texto', 'imagen', 'audio', 'documento', 'ubicacion', 'plantilla', 'otro')),
  contenido        text,
  -- wamid de Meta: evita guardar dos veces el mismo mensaje cuando Meta reintenta el webhook.
  wa_message_id    text unique,
  intencion        text check (intencion in ('consulta_propiedad', 'agendar_visita', 'otro', 'pasar_a_corredor')),
  -- Piloto en sombra: la respuesta de la asistente queda en borrador hasta que el corredor la aprueba.
  estado_borrador  text check (estado_borrador in ('pendiente', 'aprobado', 'corregido', 'descartado')),
  estado_entrega   text check (estado_entrega in ('enviado', 'entregado', 'leido', 'fallido')),
  created_at       timestamptz not null default now(),
  foreign key (conversacion_id, corredor_id) references public.conversaciones (id, corredor_id) on delete cascade,
  check (direccion = 'entrante' or autor <> 'cliente'),
  check (direccion = 'saliente' or autor = 'cliente')
);

create index mensajes_conversacion_idx on public.mensajes (conversacion_id, created_at);
create index mensajes_borradores_idx on public.mensajes (corredor_id) where estado_borrador = 'pendiente';

-- ---------------------------------------------------------------------------
-- citas
-- ---------------------------------------------------------------------------

create table public.citas (
  id                       uuid primary key default gen_random_uuid(),
  corredor_id              uuid not null references public.corredores (id) on delete cascade,
  contacto_id              uuid not null,
  propiedad_id             uuid,
  conversacion_id          uuid,
  inicio                   timestamptz not null,
  fin                      timestamptz not null,
  estado                   text not null default 'agendada' check (estado in ('agendada', 'confirmada', 'cancelada', 'realizada', 'no_asistio')),
  calendario_evento_id     text,
  recordatorio_enviado_at  timestamptz,
  notas                    text,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  check (fin > inicio),
  foreign key (contacto_id, corredor_id) references public.contactos (id, corredor_id) on delete cascade,
  foreign key (propiedad_id, corredor_id) references public.propiedades (id, corredor_id) on delete set null (propiedad_id),
  foreign key (conversacion_id, corredor_id) references public.conversaciones (id, corredor_id) on delete set null (conversacion_id)
);

create index citas_corredor_inicio_idx on public.citas (corredor_id, inicio) where estado in ('agendada', 'confirmada');

-- ---------------------------------------------------------------------------
-- leads_duenos: resultados de la búsqueda semanal en Encuentra24
-- ---------------------------------------------------------------------------

create table public.leads_duenos (
  id                  uuid primary key default gen_random_uuid(),
  corredor_id         uuid not null references public.corredores (id) on delete cascade,
  e24_id              text not null,
  url                 text not null,
  titulo              text,
  zona                text,
  precio              numeric(14, 2),
  moneda              text check (moneda in ('USD', 'CRC')),
  nombre_anunciante   text,
  telefono            text check (telefono is null or telefono ~ '^\+[1-9][0-9]{7,14}$'),
  es_dueno            boolean,
  puntaje             smallint check (puntaje between 0 and 100),
  -- ["publica una sola propiedad", "texto en primera persona", ...]
  senales             jsonb not null default '[]' check (jsonb_typeof(senales) = 'array'),
  estado_contacto     text not null default 'nuevo' check (estado_contacto in ('nuevo', 'contactado', 'respondio', 'captado', 'descartado')),
  semana              date not null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (corredor_id, e24_id)
);

create index leads_duenos_semana_idx on public.leads_duenos (corredor_id, semana desc);

-- ---------------------------------------------------------------------------
-- corredores_bloqueados: corredores conocidos que no se captan como dueños
-- ---------------------------------------------------------------------------

create table public.corredores_bloqueados (
  id           uuid primary key default gen_random_uuid(),
  corredor_id  uuid not null references public.corredores (id) on delete cascade,
  telefono     text check (telefono is null or telefono ~ '^\+[1-9][0-9]{7,14}$'),
  nombre       text,
  empresa      text,
  created_at   timestamptz not null default now(),
  check (telefono is not null or nombre is not null)
);

create unique index corredores_bloqueados_telefono_idx
  on public.corredores_bloqueados (corredor_id, telefono) where telefono is not null;

-- ---------------------------------------------------------------------------
-- uso_mensual: mensajes, llamadas a Claude y costo por corredor y mes
-- ---------------------------------------------------------------------------

create table public.uso_mensual (
  corredor_id          uuid not null references public.corredores (id) on delete cascade,
  mes                  date not null check (extract(day from mes) = 1),
  mensajes_entrantes   integer not null default 0,
  mensajes_salientes   integer not null default 0,
  mensajes_total       integer generated always as (mensajes_entrantes + mensajes_salientes) stored,
  llamadas_claude      integer not null default 0,
  tokens_entrada       bigint not null default 0,
  tokens_salida        bigint not null default 0,
  costo_claude_usd     numeric(10, 4) not null default 0,
  costo_whatsapp_usd   numeric(10, 4) not null default 0,
  aviso_tope_enviado_at timestamptz,
  updated_at           timestamptz not null default now(),
  primary key (corredor_id, mes)
);

-- Suma uso de forma atómica. Solo la llama el backend (service_role).
-- Devuelve la fila actualizada para decidir si toca mandar el aviso de 900 mensajes.
create or replace function public.registrar_uso(
  p_corredor_id        uuid,
  p_mensajes_entrantes integer default 0,
  p_mensajes_salientes integer default 0,
  p_llamadas_claude    integer default 0,
  p_tokens_entrada     bigint default 0,
  p_tokens_salida      bigint default 0,
  p_costo_claude_usd   numeric default 0,
  p_costo_whatsapp_usd numeric default 0
)
returns public.uso_mensual
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mes date;
  v_fila public.uso_mensual;
begin
  select date_trunc('month', now() at time zone c.zona_horaria)::date
    into v_mes
    from public.corredores c
   where c.id = p_corredor_id;

  if v_mes is null then
    raise exception 'corredor % no existe', p_corredor_id;
  end if;

  insert into public.uso_mensual as u (
    corredor_id, mes, mensajes_entrantes, mensajes_salientes, llamadas_claude,
    tokens_entrada, tokens_salida, costo_claude_usd, costo_whatsapp_usd
  ) values (
    p_corredor_id, v_mes, p_mensajes_entrantes, p_mensajes_salientes, p_llamadas_claude,
    p_tokens_entrada, p_tokens_salida, p_costo_claude_usd, p_costo_whatsapp_usd
  )
  on conflict (corredor_id, mes) do update set
    mensajes_entrantes = u.mensajes_entrantes + excluded.mensajes_entrantes,
    mensajes_salientes = u.mensajes_salientes + excluded.mensajes_salientes,
    llamadas_claude    = u.llamadas_claude + excluded.llamadas_claude,
    tokens_entrada     = u.tokens_entrada + excluded.tokens_entrada,
    tokens_salida      = u.tokens_salida + excluded.tokens_salida,
    costo_claude_usd   = u.costo_claude_usd + excluded.costo_claude_usd,
    costo_whatsapp_usd = u.costo_whatsapp_usd + excluded.costo_whatsapp_usd,
    updated_at         = now()
  returning * into v_fila;

  return v_fila;
end;
$$;

revoke all on function public.registrar_uso(uuid, integer, integer, integer, bigint, bigint, numeric, numeric) from public;
revoke all on function public.registrar_uso(uuid, integer, integer, integer, bigint, bigint, numeric, numeric) from anon, authenticated;
grant execute on function public.registrar_uso(uuid, integer, integer, integer, bigint, bigint, numeric, numeric) to service_role;

-- ---------------------------------------------------------------------------
-- updated_at
-- ---------------------------------------------------------------------------

create trigger corredores_updated_at before update on public.corredores for each row execute function public.set_updated_at();
create trigger propiedades_updated_at before update on public.propiedades for each row execute function public.set_updated_at();
create trigger anuncios_e24_updated_at before update on public.anuncios_e24 for each row execute function public.set_updated_at();
create trigger contactos_updated_at before update on public.contactos for each row execute function public.set_updated_at();
create trigger conversaciones_updated_at before update on public.conversaciones for each row execute function public.set_updated_at();
create trigger citas_updated_at before update on public.citas for each row execute function public.set_updated_at();
create trigger leads_duenos_updated_at before update on public.leads_duenos for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.corredores            enable row level security;
alter table public.miembros              enable row level security;
alter table public.propiedades           enable row level security;
alter table public.anuncios_e24          enable row level security;
alter table public.contactos             enable row level security;
alter table public.conversaciones        enable row level security;
alter table public.mensajes              enable row level security;
alter table public.citas                 enable row level security;
alter table public.leads_duenos          enable row level security;
alter table public.corredores_bloqueados enable row level security;
alter table public.uso_mensual           enable row level security;

-- anon no toca nada: el panel exige sesión.
revoke all on all tables in schema public from anon;

-- corredores: el miembro ve y ajusta su corredor (pantalla Ajustes). Crear o borrar
-- corredores, cambiar el plan, los topes o el número de WhatsApp es solo del backend.
create policy corredores_select on public.corredores
  for select to authenticated
  using (id in (select public.mis_corredores()));

create policy corredores_update on public.corredores
  for update to authenticated
  using (id in (select public.mis_corredores()))
  with check (id in (select public.mis_corredores()));

revoke update on public.corredores from authenticated;
grant update (nombre_contacto, whatsapp_corredor, calendario_id, zonas, precio_busqueda_min,
              precio_busqueda_max, tono, reglas_escalamiento, hora_plan_dia, respuesta_automatica)
  on public.corredores to authenticated;

-- miembros: cada usuario ve sus propias membresías; solo el backend las crea.
create policy miembros_select on public.miembros
  for select to authenticated
  using (user_id = (select auth.uid()));

-- uso_mensual: solo lectura para el corredor; lo escribe registrar_uso().
create policy uso_mensual_select on public.uso_mensual
  for select to authenticated
  using (corredor_id in (select public.mis_corredores()));

-- Resto de tablas: acceso completo dentro de su corredor.
do $$
declare
  t text;
begin
  foreach t in array array[
    'propiedades', 'anuncios_e24', 'contactos', 'conversaciones', 'mensajes',
    'citas', 'leads_duenos', 'corredores_bloqueados'
  ] loop
    execute format(
      'create policy %1$s_corredor on public.%1$I for all to authenticated
         using (corredor_id in (select public.mis_corredores()))
         with check (corredor_id in (select public.mis_corredores()))',
      t
    );
  end loop;
end;
$$;
