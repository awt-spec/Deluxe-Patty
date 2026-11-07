-- Unir clientes: el que sale pasa todo al que queda (chats, visitas, historia), se completan los datos
-- y se borra; nunca une clientes de corredores distintos; el corredor no puede llamarla con su sesión.

\set ON_ERROR_STOP on
begin;
\set deluxe '00000000-0000-4000-8000-000000000001'
\set otro   '00000000-0000-4000-8000-000000000002'
\set user_patricia '10000000-0000-4000-8000-000000000001'
insert into public.corredores (id, slug, nombre, nombre_contacto) values (:'otro', 'otro-corredor', 'Otro Corredor', 'Otro');
insert into public.miembros (corredor_id, user_id) values (:'deluxe', :'user_patricia');
insert into public.contactos (id, corredor_id, telefono, nombre, email, etapa, busca, oferta_monto, oferta_moneda) values
  ('40000000-0000-4000-8000-000000000001', :'deluxe', '+50688880301', null, null, 'interesado', '{"zonas":["Escazú"]}', null, 'USD'),
  ('40000000-0000-4000-8000-000000000002', :'deluxe', '+50688880302', 'Ana', 'ana@correo.com', 'visita', '{"presupuesto_max":500000}', 450000, 'CRC'),
  ('40000000-0000-4000-8000-000000000003', :'otro', '+50688880303', 'Otro', null, 'nuevo', '{}', null, 'USD');
insert into public.conversaciones (corredor_id, contacto_id, estado) values
  (:'deluxe', '40000000-0000-4000-8000-000000000001', 'abierta'),
  (:'deluxe', '40000000-0000-4000-8000-000000000002', 'abierta');
insert into public.actividades (corredor_id, contacto_id, tipo, texto) values
  (:'deluxe', '40000000-0000-4000-8000-000000000002', 'llamada', 'La llamé');

do $$
declare c public.contactos%rowtype;
begin
  if public.unir_contactos('00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000003') then
    raise exception 'FALLA: unió clientes de corredores distintos';
  end if;
  if not public.unir_contactos('00000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000002') then
    raise exception 'FALLA: no unió dos clientes del mismo corredor';
  end if;
  select * into c from public.contactos where id = '40000000-0000-4000-8000-000000000001';
  if c.nombre is distinct from 'Ana' or c.email is distinct from 'ana@correo.com' or c.etapa <> 'visita'
     or c.busca ->> 'presupuesto_max' is null or c.busca -> 'zonas' is null or c.notas not like '%+50688880302%' then
    raise exception 'FALLA: no completó los datos del que queda';
  end if;
  if c.oferta_monto is distinct from 450000 or c.oferta_moneda <> 'CRC' then
    raise exception 'FALLA: la oferta no pasó con su moneda';
  end if;
  if exists (select 1 from public.contactos where id = '40000000-0000-4000-8000-000000000002') then
    raise exception 'FALLA: el que sale no se borró';
  end if;
  if (select count(*) from public.conversaciones where contacto_id = '40000000-0000-4000-8000-000000000001') <> 2
     or (select count(*) from public.conversaciones where contacto_id = '40000000-0000-4000-8000-000000000001' and estado <> 'cerrada') <> 1 then
    raise exception 'FALLA: los chats no quedaron con un solo chat abierto';
  end if;
  if (select count(*) from public.actividades where contacto_id = '40000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'FALLA: la historia no pasó al que queda';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_patricia', 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform public.unir_contactos('00000000-0000-4000-8000-000000000001', gen_random_uuid(), gen_random_uuid());
    raise exception 'FALLA: el corredor pudo llamar unir_contactos con su sesión';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK: unir clientes completa datos, mueve todo y solo lo hace el backend';
end;
$$;
rollback;
