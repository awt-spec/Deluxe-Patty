-- Agenda propia: la disponibilidad del corredor vive en la base, no en Google Calendar.
--   * horarios_visitas: franjas semanales en que el corredor acepta visitas.
--   * bloqueos_agenda: excepciones (vacaciones, compromisos personales).
--   * citas: una restricción de exclusión impide dos visitas activas encimadas.
--   * corredores.token_calendario: enlace secreto de solo lectura (ICS) para ver las citas
--     en el calendario del teléfono.

create schema if not exists extensions;
create extension if not exists btree_gist with schema extensions;

-- ---------------------------------------------------------------------------
-- Parámetros de agenda por corredor
-- ---------------------------------------------------------------------------

alter table public.corredores
  add column duracion_visita_min   smallint not null default 60 check (duracion_visita_min between 15 and 480),
  add column margen_visitas_min    smallint not null default 30 check (margen_visitas_min between 0 and 240),
  add column anticipacion_min_horas smallint not null default 3 check (anticipacion_min_horas between 0 and 168),
  add column horizonte_agenda_dias smallint not null default 14 check (horizonte_agenda_dias between 1 and 90),
  add column token_calendario      text not null unique
    default replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', '');

-- El token es secreto: el corredor no lo lee por la API (se le entrega el enlace aparte).
revoke select on public.corredores from authenticated;
grant select (id, slug, nombre, nombre_contacto, whatsapp_numero, whatsapp_phone_number_id, whatsapp_corredor,
              calendario_id, zona_horaria, zonas, precio_busqueda_min, precio_busqueda_max, tono,
              reglas_escalamiento, hora_plan_dia, plan, tope_mensajes_mes, aviso_mensajes_mes,
              respuesta_automatica, activo, created_at, updated_at, duracion_visita_min,
              margen_visitas_min, anticipacion_min_horas, horizonte_agenda_dias)
  on public.corredores to authenticated;
grant update (duracion_visita_min, margen_visitas_min, anticipacion_min_horas, horizonte_agenda_dias)
  on public.corredores to authenticated;

-- Ya no se integra un calendario externo.
alter table public.corredores drop column calendario_id;
alter table public.citas drop column calendario_evento_id;

-- ---------------------------------------------------------------------------
-- horarios_visitas
-- ---------------------------------------------------------------------------

create table public.horarios_visitas (
  id           uuid primary key default gen_random_uuid(),
  corredor_id  uuid not null references public.corredores (id) on delete cascade,
  -- 0 = domingo … 6 = sábado (como extract(dow)).
  dia_semana   smallint not null check (dia_semana between 0 and 6),
  hora_inicio  time not null,
  hora_fin     time not null,
  created_at   timestamptz not null default now(),
  check (hora_fin > hora_inicio)
);

create index horarios_visitas_corredor_idx on public.horarios_visitas (corredor_id, dia_semana);

-- ---------------------------------------------------------------------------
-- bloqueos_agenda
-- ---------------------------------------------------------------------------

create table public.bloqueos_agenda (
  id           uuid primary key default gen_random_uuid(),
  corredor_id  uuid not null references public.corredores (id) on delete cascade,
  inicio       timestamptz not null,
  fin          timestamptz not null,
  motivo       text,
  created_at   timestamptz not null default now(),
  check (fin > inicio)
);

create index bloqueos_agenda_corredor_idx on public.bloqueos_agenda (corredor_id, fin);

-- ---------------------------------------------------------------------------
-- citas: sin choques
-- ---------------------------------------------------------------------------

alter table public.citas
  add constraint citas_sin_choques
  exclude using gist (corredor_id with =, tstzrange(inicio, fin) with &&)
  where (estado in ('agendada', 'confirmada'));

-- ---------------------------------------------------------------------------
-- mensajes: acción pendiente de un borrador
-- ---------------------------------------------------------------------------

-- En piloto en sombra un borrador puede llevar una acción (crear o cancelar una cita) que se
-- ejecuta solo cuando el corredor aprueba el mensaje.
alter table public.mensajes
  add column accion jsonb check (accion is null or jsonb_typeof(accion) = 'object');

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------

alter table public.horarios_visitas enable row level security;
alter table public.bloqueos_agenda  enable row level security;
revoke all on public.horarios_visitas, public.bloqueos_agenda from anon;

create policy horarios_visitas_corredor on public.horarios_visitas for all to authenticated
  using (corredor_id in (select public.mis_corredores()))
  with check (corredor_id in (select public.mis_corredores()));

create policy bloqueos_agenda_corredor on public.bloqueos_agenda for all to authenticated
  using (corredor_id in (select public.mis_corredores()))
  with check (corredor_id in (select public.mis_corredores()));
