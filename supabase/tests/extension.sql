-- Extensión de Chrome: el corredor ve si su extensión está conectada, pero no las huellas del código ni
-- del permiso, no ve las de otro corredor y no escribe nada (lo escribe el backend). Rollback al final.

\set ON_ERROR_STOP on

begin;

\set deluxe '00000000-0000-4000-8000-000000000001'
\set otro   '00000000-0000-4000-8000-000000000002'
\set user_patricia '10000000-0000-4000-8000-000000000001'

insert into public.corredores (id, slug, nombre, nombre_contacto) values (:'otro', 'otro-corredor', 'Otro Corredor', 'Otro');
insert into public.miembros (corredor_id, user_id) values (:'deluxe', :'user_patricia');
insert into public.extension_conexiones (corredor_id, token_hash, conectada_at) values
  (:'deluxe', 'huella-deluxe', now()),
  (:'otro', 'huella-otro', now());
insert into public.busquedas_extension (id, corredor_id, estado)
values ('50000000-0000-4000-8000-000000000001', :'deluxe', '{}');
insert into public.busquedas_extension_anuncios (busqueda_id, corredor_id, e24_id, anuncio)
values ('50000000-0000-4000-8000-000000000001', :'deluxe', '1', '{}');

-- Un anuncio en tránsito no puede colgar de la búsqueda de otro corredor.
do $$
begin
  insert into public.busquedas_extension_anuncios (busqueda_id, corredor_id, e24_id, anuncio)
  values ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000002', '2', '{}');
  raise exception 'FALLA: un anuncio quedó en la búsqueda de otro corredor';
exception when foreign_key_violation then null;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_patricia', 'role', 'authenticated')::text, true);

do $$
declare
  n bigint;
begin
  select count(*) into n from public.extension_conexiones where conectada_at is not null;
  if n <> 1 then raise exception 'FALLA: el corredor ve % conexiones (esperaba solo la suya)', n; end if;

  begin
    perform token_hash from public.extension_conexiones;
    raise exception 'FALLA: el corredor leyó la huella del permiso';
  exception when insufficient_privilege then null;
  end;

  begin
    insert into public.extension_conexiones (corredor_id, token_hash)
    values ('00000000-0000-4000-8000-000000000001', 'propia');
    raise exception 'FALLA: el corredor creó una conexión';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.busquedas_extension;
    raise exception 'FALLA: el corredor leyó búsquedas en curso';
  exception when insufficient_privilege then null;
  end;

  begin
    perform 1 from public.busquedas_extension_anuncios;
    raise exception 'FALLA: el corredor leyó anuncios en tránsito';
  exception when insufficient_privilege then null;
  end;

  raise notice 'OK: extensión aislada y huellas ocultas';
end;
$$;

rollback;
