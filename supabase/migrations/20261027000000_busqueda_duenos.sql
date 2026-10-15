-- Búsqueda semanal de dueños directos en Encuentra24.

-- Zonas como aparecen en las URL de Encuentra24 (por ejemplo "san-jose-provincia-escazu") y
-- categoría a recorrer.
alter table public.corredores
  add column zonas_e24 text[] not null default '{}',
  add column categoria_busqueda_e24 text not null default 'bienes-raices-venta-de-propiedades-casas';

grant update (zonas_e24) on public.corredores to authenticated;
grant select (zonas_e24, categoria_busqueda_e24) on public.corredores to authenticated;

alter table public.leads_duenos
  add column anunciante_e24_id text,
  add column descripcion text,
  add column m2_construccion numeric(10, 2),
  add column habitaciones smallint,
  add column foto_url text;

-- Un corredor conocido puede venir de la lista de WhatsApp (teléfono, nombre) o marcarse desde un
-- lead (cuenta de Encuentra24).
alter table public.corredores_bloqueados
  add column anunciante_e24_id text,
  drop constraint corredores_bloqueados_check,
  add constraint corredores_bloqueados_check
    check (telefono is not null or nombre is not null or anunciante_e24_id is not null);

create unique index corredores_bloqueados_e24_idx
  on public.corredores_bloqueados (corredor_id, anunciante_e24_id) where anunciante_e24_id is not null;

-- Mensajes largos para el corredor que esperan a que abra la ventana de 24 horas (por ejemplo la
-- lista semanal de dueños). Se entregan en cuanto el corredor le escribe a su asistente.
create table public.envios_pendientes (
  id           uuid primary key default gen_random_uuid(),
  corredor_id  uuid not null references public.corredores (id) on delete cascade,
  tipo         text not null check (tipo in ('lista_duenos')),
  contenido    text not null,
  enviado_at   timestamptz,
  created_at   timestamptz not null default now()
);

create index envios_pendientes_corredor_idx on public.envios_pendientes (corredor_id) where enviado_at is null;

alter table public.envios_pendientes enable row level security;
revoke all on public.envios_pendientes from anon;
create policy envios_pendientes_select on public.envios_pendientes for select to authenticated
  using (corredor_id in (select public.mis_corredores()));
