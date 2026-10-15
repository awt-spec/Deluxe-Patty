-- Reclama una alerta: true si no se envió en los últimos p_minutos (y la marca como enviada ahora).
-- Atómico: dos errores simultáneos no mandan la misma alerta dos veces.
create or replace function public.reclamar_alerta(p_clave text, p_minutos integer)
returns boolean
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_clave text;
begin
  insert into public.alertas as a (clave, enviada_at) values (p_clave, now())
  on conflict (clave) do update set enviada_at = now()
    where a.enviada_at < now() - make_interval(mins => p_minutos)
  returning a.clave into v_clave;
  return v_clave is not null;
end;
$$;

revoke all on function public.reclamar_alerta(text, integer) from public, anon, authenticated;
grant execute on function public.reclamar_alerta(text, integer) to service_role;
