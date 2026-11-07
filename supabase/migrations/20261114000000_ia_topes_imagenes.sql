-- Gasto de IA bajo control:
--  - El costo de las imágenes (OpenAI) se cuenta igual que el de Claude, por día y por mes.
--  - Topes de gasto de IA por día y por mes: los de la plataforma por defecto y, si hace falta, uno
--    propio para cada corredor. Los define el superadministrador.
--  - Superadministradores: quién ve y cambia esto (por correo de Supabase Auth). Solo el backend lee
--    esta tabla; el corredor nunca.

alter table public.uso_diario
  add column if not exists imagenes integer not null default 0,
  add column if not exists costo_imagenes_usd numeric(10, 4) not null default 0;
alter table public.uso_mensual
  add column if not exists imagenes integer not null default 0,
  add column if not exists costo_imagenes_usd numeric(10, 4) not null default 0;

-- Una sola fila con los valores por defecto de la plataforma.
create table public.plataforma (
  id               boolean primary key default true check (id),
  tope_ia_dia_usd  numeric(10, 2) not null default 10 check (tope_ia_dia_usd >= 0),
  tope_ia_mes_usd  numeric(10, 2) not null default 150 check (tope_ia_mes_usd >= 0),
  updated_at       timestamptz not null default now()
);
insert into public.plataforma (id) values (true) on conflict do nothing;
alter table public.plataforma enable row level security;
revoke all on public.plataforma from anon, authenticated;

-- Tope propio de un corredor (vacío: el de la plataforma) y si puede generar o editar imágenes.
alter table public.corredores
  add column if not exists tope_ia_dia_usd numeric(10, 2) check (tope_ia_dia_usd is null or tope_ia_dia_usd >= 0),
  add column if not exists tope_ia_mes_usd numeric(10, 2) check (tope_ia_mes_usd is null or tope_ia_mes_usd >= 0),
  add column if not exists imagenes_activas boolean not null default true;
-- El panel lee el corredor con la sesión: cada columna nueva necesita su permiso de lectura.
grant select (tope_ia_dia_usd, tope_ia_mes_usd, imagenes_activas) on public.corredores to authenticated;

create table public.superadmins (
  correo      text primary key check (correo = lower(correo) and position('@' in correo) > 1),
  created_at  timestamptz not null default now()
);
alter table public.superadmins enable row level security;
revoke all on public.superadmins from anon, authenticated;

-- Suma imágenes y su costo al día y al mes (fecha local del corredor).
create or replace function public.registrar_imagenes(p_corredor_id uuid, p_cantidad integer, p_costo_usd numeric)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_local timestamp;
begin
  select now() at time zone c.zona_horaria into v_local from public.corredores c where c.id = p_corredor_id;
  if v_local is null then
    raise exception 'corredor % no existe', p_corredor_id;
  end if;
  insert into public.uso_mensual as u (corredor_id, mes, imagenes, costo_imagenes_usd)
  values (p_corredor_id, date_trunc('month', v_local)::date, p_cantidad, p_costo_usd)
  on conflict (corredor_id, mes) do update set
    imagenes = u.imagenes + excluded.imagenes,
    costo_imagenes_usd = u.costo_imagenes_usd + excluded.costo_imagenes_usd,
    updated_at = now();
  insert into public.uso_diario as d (corredor_id, dia, imagenes, costo_imagenes_usd)
  values (p_corredor_id, v_local::date, p_cantidad, p_costo_usd)
  on conflict (corredor_id, dia) do update set
    imagenes = d.imagenes + excluded.imagenes,
    costo_imagenes_usd = d.costo_imagenes_usd + excluded.costo_imagenes_usd;
end;
$$;
revoke all on function public.registrar_imagenes(uuid, integer, numeric) from public, anon, authenticated;
grant execute on function public.registrar_imagenes(uuid, integer, numeric) to service_role;

-- Cuánto lleva gastado en IA (Claude + imágenes) hoy y este mes, y sus topes.
create or replace function public.presupuesto_ia(p_corredor_id uuid)
returns table (gasto_dia numeric, gasto_mes numeric, tope_dia numeric, tope_mes numeric)
language sql
stable
security invoker
set search_path = ''
as $$
  with c as (
    select co.id, (now() at time zone co.zona_horaria) as local, co.tope_ia_dia_usd, co.tope_ia_mes_usd
      from public.corredores co where co.id = p_corredor_id
  )
  select
    coalesce((select d.costo_claude_usd + d.costo_imagenes_usd from public.uso_diario d
               where d.corredor_id = c.id and d.dia = c.local::date), 0),
    coalesce((select m.costo_claude_usd + m.costo_imagenes_usd from public.uso_mensual m
               where m.corredor_id = c.id and m.mes = date_trunc('month', c.local)::date), 0),
    coalesce(c.tope_ia_dia_usd, (select p.tope_ia_dia_usd from public.plataforma p)),
    coalesce(c.tope_ia_mes_usd, (select p.tope_ia_mes_usd from public.plataforma p))
  from c;
$$;
revoke all on function public.presupuesto_ia(uuid) from public, anon, authenticated;
grant execute on function public.presupuesto_ia(uuid) to service_role;
