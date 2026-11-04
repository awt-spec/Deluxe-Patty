-- Cerebro de la asistente: cada corredor ve y edita solo lo suyo; una respuesta activa necesita texto.
\set ON_ERROR_STOP on
begin;
\set deluxe '00000000-0000-4000-8000-000000000001'
\set otro   '00000000-0000-4000-8000-000000000002'
\set user_patricia '10000000-0000-4000-8000-000000000001'

insert into public.corredores (id, slug, nombre, nombre_contacto) values (:'otro', 'otro-corredor', 'Otro Corredor', 'Otro');
insert into public.miembros (corredor_id, user_id) values (:'deluxe', :'user_patricia');
insert into public.conocimiento (corredor_id, tema, respuesta, estado, origen) values
  (:'deluxe', 'Mascotas', 'Sí, perros pequeños', 'activo', 'manual'),
  (:'otro', 'Comisión', '5 %', 'activo', 'manual');

do $$
begin
  insert into public.conocimiento (corredor_id, tema, estado) values ('00000000-0000-4000-8000-000000000001', 'Sin respuesta', 'activo');
  raise exception 'FALLA: se guardó algo activo sin respuesta';
exception when check_violation then null;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_patricia', 'role', 'authenticated')::text, true);

do $$
declare n bigint;
begin
  select count(*) into n from public.conocimiento;
  if n <> 1 then raise exception 'FALLA: el corredor ve % temas (esperaba solo el suyo)', n; end if;
  update public.conocimiento set respuesta = 'cambiado' where tema = 'Comisión';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLA: el corredor cambió el cerebro de otro corredor'; end if;
  insert into public.conocimiento (corredor_id, tema, respuesta) values ('00000000-0000-4000-8000-000000000001', 'Horario de oficina', 'De 8 a 5');
  begin
    insert into public.conocimiento (corredor_id, tema, respuesta) values ('00000000-0000-4000-8000-000000000002', 'Intruso', 'x');
    raise exception 'FALLA: el corredor escribió en el cerebro de otro';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK: cerebro de la asistente aislado por corredor';
end;
$$;
rollback;
