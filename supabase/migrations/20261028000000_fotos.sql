-- Mejora de fotos con IA (OpenAI). Las mejoradas se guardan aparte; la original nunca se toca.

alter table public.uso_mensual add column fotos_mejoradas integer not null default 0;

create or replace function public.registrar_fotos_mejoradas(p_corredor_id uuid, p_cantidad integer)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_mes date;
begin
  select date_trunc('month', now() at time zone c.zona_horaria)::date into v_mes
    from public.corredores c where c.id = p_corredor_id;
  if v_mes is null then
    raise exception 'corredor % no existe', p_corredor_id;
  end if;
  insert into public.uso_mensual as u (corredor_id, mes, fotos_mejoradas)
  values (p_corredor_id, v_mes, p_cantidad)
  on conflict (corredor_id, mes) do update set
    fotos_mejoradas = u.fotos_mejoradas + excluded.fotos_mejoradas,
    updated_at = now();
end;
$$;

revoke all on function public.registrar_fotos_mejoradas(uuid, integer) from public, anon, authenticated;
grant execute on function public.registrar_fotos_mejoradas(uuid, integer) to service_role;

-- Bucket público para las fotos mejoradas: son fotos de anuncios que se publican de todos modos.
-- Solo existe en Supabase (en el Postgres de pruebas no hay esquema storage).
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('fotos', 'fotos', true)
    on conflict (id) do nothing;
  end if;
end;
$$;
