-- Notas de voz: la transcripción (OpenAI) tiene costo y cuenta contra el tope de gasto de IA igual que Claude y
-- las imágenes. Se guarda aparte (segundos y costo) para verlo en /admin.

alter table public.uso_diario
  add column if not exists segundos_audio integer not null default 0,
  add column if not exists costo_audio_usd numeric(10, 4) not null default 0;
alter table public.uso_mensual
  add column if not exists segundos_audio integer not null default 0,
  add column if not exists costo_audio_usd numeric(10, 4) not null default 0;

create or replace function public.registrar_audio(p_corredor_id uuid, p_segundos integer, p_costo_usd numeric)
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
  insert into public.uso_mensual as u (corredor_id, mes, segundos_audio, costo_audio_usd)
  values (p_corredor_id, date_trunc('month', v_local)::date, p_segundos, p_costo_usd)
  on conflict (corredor_id, mes) do update set
    segundos_audio = u.segundos_audio + excluded.segundos_audio,
    costo_audio_usd = u.costo_audio_usd + excluded.costo_audio_usd,
    updated_at = now();
  insert into public.uso_diario as d (corredor_id, dia, segundos_audio, costo_audio_usd)
  values (p_corredor_id, v_local::date, p_segundos, p_costo_usd)
  on conflict (corredor_id, dia) do update set
    segundos_audio = d.segundos_audio + excluded.segundos_audio,
    costo_audio_usd = d.costo_audio_usd + excluded.costo_audio_usd;
end;
$$;
revoke all on function public.registrar_audio(uuid, integer, numeric) from public, anon, authenticated;
grant execute on function public.registrar_audio(uuid, integer, numeric) to service_role;

-- El presupuesto de IA ahora suma también el audio.
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
    coalesce((select d.costo_claude_usd + d.costo_imagenes_usd + d.costo_audio_usd from public.uso_diario d
               where d.corredor_id = c.id and d.dia = c.local::date), 0),
    coalesce((select m.costo_claude_usd + m.costo_imagenes_usd + m.costo_audio_usd from public.uso_mensual m
               where m.corredor_id = c.id and m.mes = date_trunc('month', c.local)::date), 0),
    coalesce(c.tope_ia_dia_usd, (select p.tope_ia_dia_usd from public.plataforma p)),
    coalesce(c.tope_ia_mes_usd, (select p.tope_ia_mes_usd from public.plataforma p))
  from c;
$$;
revoke all on function public.presupuesto_ia(uuid) from public, anon, authenticated;
grant execute on function public.presupuesto_ia(uuid) to service_role;
