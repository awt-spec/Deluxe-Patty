-- Historia del cliente: el corredor ve sus actividades, no las de otro, y no las escribe con su sesión.
-- Una actividad nueva marca el último movimiento del cliente. Rollback al final.

\set ON_ERROR_STOP on
begin;
\set deluxe '00000000-0000-4000-8000-000000000001'
\set otro   '00000000-0000-4000-8000-000000000002'
\set user_patricia '10000000-0000-4000-8000-000000000001'
insert into public.corredores (id, slug, nombre, nombre_contacto) values (:'otro', 'otro-corredor', 'Otro Corredor', 'Otro');
insert into public.miembros (corredor_id, user_id) values (:'deluxe', :'user_patricia');
insert into public.contactos (id, corredor_id, telefono) values
  ('30000000-0000-4000-8000-0000000000a1', :'deluxe', '+50688880201'),
  ('30000000-0000-4000-8000-0000000000a2', :'otro', '+50688880202');
insert into public.actividades (corredor_id, contacto_id, tipo, texto) values
  (:'deluxe', '30000000-0000-4000-8000-0000000000a1', 'llamada', 'Lo llamé'),
  (:'otro', '30000000-0000-4000-8000-0000000000a2', 'nota', 'Nota de otro');

do $$
begin
  if (select ultima_actividad_at from public.contactos where id = '30000000-0000-4000-8000-0000000000a1') is null then
    raise exception 'FALLA: la actividad no marcó el último movimiento del cliente';
  end if;
  begin
    insert into public.actividades (corredor_id, contacto_id, tipo, texto)
      values ('00000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-0000000000a1', 'nota', 'cruzada');
    raise exception 'FALLA: una actividad apuntó al cliente de otro corredor';
  exception when foreign_key_violation then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_patricia', 'role', 'authenticated')::text, true);
do $$
begin
  if (select count(*) from public.actividades) <> 1 then
    raise exception 'FALLA: el corredor ve actividades de otro corredor';
  end if;
  begin
    insert into public.actividades (corredor_id, contacto_id, tipo, texto)
      values ('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-0000000000a1', 'nota', 'directa');
    raise exception 'FALLA: el corredor escribió una actividad con su sesión';
  exception when insufficient_privilege then null;
  end;
  perform oferta_monto, cierre_precio, cierre_comision, propiedad_interes_id from public.contactos;
  raise notice 'OK: historia del cliente aislada y solo la escribe el backend';
end;
$$;
rollback;
