-- Búsqueda de dueños desde la extensión de Chrome del corredor (extension/). Encuentra24 frena a los
-- servidores; desde el Chrome del corredor, con su internet de casa, no. La extensión solo abre las
-- páginas y las manda; el servidor las lee, filtra y clasifica igual que el worker.

-- Conexión de una extensión con un corredor. El panel genera un código de un solo uso (vence a los
-- 10 minutos); la extensión lo canjea por un permiso propio. Solo se guardan huellas (sha256).
create table public.extension_conexiones (
  id               uuid primary key default gen_random_uuid(),
  corredor_id      uuid not null references public.corredores (id) on delete cascade,
  codigo_hash      text unique,
  codigo_vence_at  timestamptz,
  token_hash       text unique,
  conectada_at     timestamptz,
  ultimo_uso_at    timestamptz,
  revocada_at      timestamptz,
  created_at       timestamptz not null default now(),
  check (codigo_hash is not null or token_hash is not null)
);

create index extension_conexiones_corredor_idx on public.extension_conexiones (corredor_id);

-- Una búsqueda en curso: el estado del recorrido (zonas, página, bloqueos) entre página y página.
create table public.busquedas_extension (
  id            uuid primary key default gen_random_uuid(),
  corredor_id   uuid not null references public.corredores (id) on delete cascade,
  estado        jsonb not null,
  terminada_at  timestamptz,
  created_at    timestamptz not null default now(),
  unique (id, corredor_id)
);

create index busquedas_extension_corredor_idx on public.busquedas_extension (corredor_id, created_at desc);

-- Anuncios leídos en una búsqueda en curso; se borran al terminar.
create table public.busquedas_extension_anuncios (
  busqueda_id  uuid not null,
  corredor_id  uuid not null,
  e24_id       text not null,
  anuncio      jsonb not null,
  primary key (busqueda_id, e24_id),
  foreign key (busqueda_id, corredor_id) references public.busquedas_extension (id, corredor_id) on delete cascade
);

-- Todo lo escribe el backend. El corredor solo ve si su extensión está conectada (sin las huellas).
alter table public.extension_conexiones enable row level security;
alter table public.busquedas_extension enable row level security;
alter table public.busquedas_extension_anuncios enable row level security;

revoke all on public.extension_conexiones, public.busquedas_extension, public.busquedas_extension_anuncios
  from anon, authenticated;

grant select (id, corredor_id, conectada_at, ultimo_uso_at, revocada_at, created_at)
  on public.extension_conexiones to authenticated;
create policy extension_conexiones_select on public.extension_conexiones for select to authenticated
  using (corredor_id in (select public.mis_corredores()));
