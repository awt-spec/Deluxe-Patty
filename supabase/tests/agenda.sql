-- Agenda propia: sin choques de citas, token del calendario oculto, horarios aislados por corredor.
\set ON_ERROR_STOP on

begin;

\set deluxe '00000000-0000-4000-8000-000000000001'
\set otro   '00000000-0000-4000-8000-000000000002'

insert into public.corredores (id, slug, nombre, nombre_contacto) values (:'otro', 'otro', 'Otro', 'Otro');
insert into public.miembros (corredor_id, user_id) values
  (:'deluxe', '10000000-0000-4000-8000-000000000001'),
  (:'otro', '10000000-0000-4000-8000-000000000002');
insert into public.contactos (id, corredor_id, telefono) values
  ('30000000-0000-4000-8000-000000000001', :'deluxe', '+50688880001'),
  ('30000000-0000-4000-8000-000000000002', :'otro', '+50688880002');

do $$
declare
  n bigint;
begin
  -- Una cita de 10:00 a 11:00.
  insert into public.citas (corredor_id, contacto_id, inicio, fin)
  values ('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          '2026-11-02 10:00-06', '2026-11-02 11:00-06');

  -- Otra que se cruza: rechazada.
  begin
    insert into public.citas (corredor_id, contacto_id, inicio, fin)
    values ('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
            '2026-11-02 10:30-06', '2026-11-02 11:30-06');
    raise exception 'FALLA: se aceptaron dos citas encimadas';
  exception when exclusion_violation then null;
  end;

  -- Pegada (11:00–12:00): se acepta.
  insert into public.citas (corredor_id, contacto_id, inicio, fin)
  values ('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          '2026-11-02 11:00-06', '2026-11-02 12:00-06');

  -- Una cancelada no bloquea el horario.
  update public.citas set estado = 'cancelada' where inicio = '2026-11-02 11:00-06';
  insert into public.citas (corredor_id, contacto_id, inicio, fin)
  values ('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
          '2026-11-02 11:00-06', '2026-11-02 12:00-06');

  -- Otro corredor puede tener cita a la misma hora.
  insert into public.citas (corredor_id, contacto_id, inicio, fin)
  values ('00000000-0000-4000-8000-000000000002', '30000000-0000-4000-8000-000000000002',
          '2026-11-02 10:00-06', '2026-11-02 11:00-06');

  select count(*) into n from public.corredores where length(token_calendario) = 64;
  if n < 2 then raise exception 'FALLA: falta token_calendario'; end if;

  raise notice 'OK: citas sin choques';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"10000000-0000-4000-8000-000000000002"}', true);

do $$
declare
  n bigint;
begin
  select count(*) into n from public.horarios_visitas;
  if n <> 0 then raise exception 'FALLA: el otro corredor ve % horarios de Deluxe', n; end if;

  begin
    perform token_calendario from public.corredores;
    raise exception 'FALLA: un usuario autenticado pudo leer token_calendario';
  exception when insufficient_privilege then null;
  end;

  perform nombre, duracion_visita_min from public.corredores;

  begin
    insert into public.bloqueos_agenda (corredor_id, inicio, fin)
    values ('00000000-0000-4000-8000-000000000001', now(), now() + interval '1 hour');
    raise exception 'FALLA: el otro corredor bloqueó la agenda de Deluxe';
  exception when insufficient_privilege then null;
  end;

  raise notice 'OK: agenda aislada y token oculto';
end;
$$;

rollback;
