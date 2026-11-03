-- CRM: el corredor edita etapa, lo que busca, notas y seguimiento de sus clientes, pero no el teléfono
-- ni los clientes de otro corredor. Rollback al final.

\set ON_ERROR_STOP on

begin;

\set deluxe '00000000-0000-4000-8000-000000000001'
\set otro   '00000000-0000-4000-8000-000000000002'
\set user_patricia '10000000-0000-4000-8000-000000000001'

insert into public.corredores (id, slug, nombre, nombre_contacto) values (:'otro', 'otro-corredor', 'Otro Corredor', 'Otro');
insert into public.miembros (corredor_id, user_id) values (:'deluxe', :'user_patricia');
insert into public.contactos (id, corredor_id, telefono, nombre) values
  ('30000000-0000-4000-8000-0000000000c1', :'deluxe', '+50688880101', 'Cliente Deluxe'),
  ('30000000-0000-4000-8000-0000000000c2', :'otro', '+50688880102', 'Cliente Otro');

do $$
begin
  if (select etapa from public.contactos where id = '30000000-0000-4000-8000-0000000000c1') <> 'nuevo' then
    raise exception 'FALLA: un cliente nuevo no empieza en la etapa nuevo';
  end if;
  begin
    update public.contactos set etapa = 'ganado' where id = '30000000-0000-4000-8000-0000000000c1';
    raise exception 'FALLA: se aceptó una etapa que no existe';
  exception when check_violation then null;
  end;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_patricia', 'role', 'authenticated')::text, true);

do $$
declare
  n bigint;
begin
  update public.contactos
    set etapa = 'visita', busca = '{"zonas": ["Escazú"]}', notas = 'Busca colegio cerca',
        seguimiento_fecha = current_date, seguimiento_nota = 'Llamarla'
    where id = '30000000-0000-4000-8000-0000000000c1';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLA: el corredor no pudo editar el CRM de su cliente'; end if;

  update public.contactos set etapa = 'perdido' where id = '30000000-0000-4000-8000-0000000000c2';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLA: el corredor editó un cliente de otro corredor'; end if;

  begin
    update public.contactos set telefono = '+50600000000' where id = '30000000-0000-4000-8000-0000000000c1';
    raise exception 'FALLA: el corredor cambió el teléfono de un cliente';
  exception when insufficient_privilege then null;
  end;

  raise notice 'OK: CRM editable solo en lo suyo';
end;
$$;

rollback;
