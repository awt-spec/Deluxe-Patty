-- CRM con historia y dinero real:
--  - actividades: lo que pasó con cada cliente (llamadas, mensajes, visitas, notas, cambios de etapa).
--  - en el cliente: la casa que le interesa, la oferta y, al cerrar, la casa, el precio y la comisión.
--  - en el corredor: el porcentaje de comisión con el que se estima lo que gana.

create table public.actividades (
  id           uuid primary key default gen_random_uuid(),
  corredor_id  uuid not null references public.corredores (id) on delete cascade,
  contacto_id  uuid not null,
  tipo         text not null check (tipo in ('llamada', 'mensaje', 'visita', 'nota', 'correo', 'etapa', 'oferta', 'cierre', 'otro')),
  texto        text not null check (length(texto) between 1 and 500),
  autor        text not null default 'corredor' check (autor in ('corredor', 'asistente')),
  created_at   timestamptz not null default now(),
  foreign key (contacto_id, corredor_id) references public.contactos (id, corredor_id) on delete cascade
);
create index actividades_contacto_idx on public.actividades (corredor_id, contacto_id, created_at desc);
alter table public.actividades enable row level security;
create policy actividades_select on public.actividades
  for select to authenticated using (corredor_id in (select public.mis_corredores()));
-- Las escribe el backend después de comprobar la sesión (como los contactos).
revoke all on public.actividades from anon, authenticated;
grant select on public.actividades to authenticated;

alter table public.contactos
  add column if not exists ultima_actividad_at timestamptz,
  add column if not exists propiedad_interes_id uuid,
  add column if not exists oferta_monto numeric(14, 2) check (oferta_monto is null or oferta_monto > 0),
  add column if not exists cierre_propiedad_id uuid,
  add column if not exists cierre_precio numeric(14, 2) check (cierre_precio is null or cierre_precio > 0),
  add column if not exists cierre_comision numeric(14, 2) check (cierre_comision is null or cierre_comision >= 0),
  add column if not exists cierre_at timestamptz;
alter table public.contactos
  add constraint contactos_propiedad_interes_fk foreign key (propiedad_interes_id, corredor_id)
    references public.propiedades (id, corredor_id) on delete set null (propiedad_interes_id),
  add constraint contactos_cierre_propiedad_fk foreign key (cierre_propiedad_id, corredor_id)
    references public.propiedades (id, corredor_id) on delete set null (cierre_propiedad_id);

-- Una actividad nueva cuenta como movimiento del cliente (reinicia el "sin movimiento").
create or replace function public.anotar_ultima_actividad() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.contactos set ultima_actividad_at = new.created_at
   where id = new.contacto_id and corredor_id = new.corredor_id;
  return new;
end;
$$;
create trigger actividades_ultima after insert on public.actividades
  for each row execute function public.anotar_ultima_actividad();

alter table public.corredores
  add column if not exists comision_pct numeric(5, 2) not null default 5 check (comision_pct >= 0 and comision_pct <= 20);
-- El panel lee el corredor con su sesión (permisos por columna): sin esto queda sin acceso.
grant select (comision_pct) on public.corredores to authenticated;
grant update (comision_pct) on public.corredores to authenticated;
