-- Conexión con Google del corredor (Gmail y Google Calendar). El permiso de Google (refresh token) se
-- guarda cifrado con GOOGLE_TOKEN_KEY y solo lo lee el backend; el corredor ve con qué correo conectó.

create table public.google_conexiones (
  corredor_id           uuid primary key references public.corredores (id) on delete cascade,
  correo                text not null,
  token_cifrado         text not null,
  permisos              text[] not null default '{}',
  calendario_id         text not null default 'primary',
  -- Hasta dónde ya se leyó el correo (milisegundos de Gmail) para no procesar dos veces.
  correo_leido_hasta    bigint,
  -- Último día en que se le mandó el resumen del día por correo.
  resumen_enviado_fecha date,
  ultimo_error          text,
  conectado_at          timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);
alter table public.google_conexiones enable row level security;
create policy google_conexiones_select on public.google_conexiones
  for select to authenticated using (corredor_id in (select public.mis_corredores()));
revoke all on public.google_conexiones from authenticated, anon;
grant select (corredor_id, correo, conectado_at, ultimo_error) on public.google_conexiones to authenticated;

-- Correos que la asistente ya revisó: qué eran y qué hizo (sin el contenido).
create table public.correos_procesados (
  corredor_id   uuid not null references public.corredores (id) on delete cascade,
  gmail_id      text not null,
  hilo_id       text,
  tipo          text not null check (tipo in ('cliente', 'otro')),
  contacto_id   uuid,
  remitente     text,
  asunto        text check (asunto is null or length(asunto) <= 300),
  resumen       text check (resumen is null or length(resumen) <= 500),
  borrador      boolean not null default false,
  created_at    timestamptz not null default now(),
  primary key (corredor_id, gmail_id),
  foreign key (contacto_id, corredor_id) references public.contactos (id, corredor_id) on delete set null (contacto_id)
);
create index correos_procesados_recientes_idx on public.correos_procesados (corredor_id, created_at desc);
alter table public.correos_procesados enable row level security;
create policy correos_procesados_select on public.correos_procesados
  for select to authenticated using (corredor_id in (select public.mis_corredores()));
revoke all on public.correos_procesados from authenticated, anon;
grant select on public.correos_procesados to authenticated;

-- Clientes que llegan por correo.
alter table public.contactos drop constraint if exists contactos_origen_check;
alter table public.contactos add constraint contactos_origen_check
  check (origen in ('anuncio', 'referido', 'busqueda', 'whatsapp', 'otro', 'correo'));

-- Visitas sincronizadas con Google Calendar: cuándo se mandó por última vez el evento.
alter table public.citas add column if not exists calendario_sincronizado_at timestamptz;
