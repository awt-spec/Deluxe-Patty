-- Prueba de aislamiento multicliente: un corredor no ve ni toca datos de otro.
-- Corre dentro de una transacción y hace rollback; no deja datos.
-- Requiere el esquema y la semilla de Deluxe ya aplicados.

\set ON_ERROR_STOP on

begin;

-- ---------------------------------------------------------------------------
-- Preparación (como dueño de la base, sin RLS)
-- ---------------------------------------------------------------------------

\set deluxe '00000000-0000-4000-8000-000000000001'
\set otro   '00000000-0000-4000-8000-000000000002'
\set user_patricia '10000000-0000-4000-8000-000000000001'
\set user_otro     '10000000-0000-4000-8000-000000000002'

insert into public.corredores (id, slug, nombre, nombre_contacto)
values (:'otro', 'otro-corredor', 'Otro Corredor', 'Otro');

insert into public.miembros (corredor_id, user_id) values
  (:'deluxe', :'user_patricia'),
  (:'otro', :'user_otro');

-- Un dato de Deluxe en cada tabla.
insert into public.anuncios_e24 (id, corredor_id, propiedad_id, e24_id, url, referencia, vence_en)
select '20000000-0000-4000-8000-000000000001', :'deluxe', p.id, 'E24-1', 'https://www.encuentra24.com/x', 'DLX1', current_date + 30
from public.propiedades p where p.corredor_id = :'deluxe' and p.codigo = 'EJEMPLO-001';

insert into public.contactos (id, corredor_id, telefono, nombre, origen, anuncio_id)
values ('30000000-0000-4000-8000-000000000001', :'deluxe', '+50688880001', 'Cliente Deluxe', 'anuncio',
        '20000000-0000-4000-8000-000000000001');

insert into public.conversaciones (id, corredor_id, contacto_id)
values ('40000000-0000-4000-8000-000000000001', :'deluxe', '30000000-0000-4000-8000-000000000001');

insert into public.mensajes (corredor_id, conversacion_id, direccion, autor, contenido, wa_message_id)
values (:'deluxe', '40000000-0000-4000-8000-000000000001', 'entrante', 'cliente', 'Hola', 'wamid.prueba1');

insert into public.citas (corredor_id, contacto_id, inicio, fin)
values (:'deluxe', '30000000-0000-4000-8000-000000000001', now() + interval '1 day', now() + interval '1 day 1 hour');

insert into public.leads_duenos (corredor_id, e24_id, url, semana)
values (:'deluxe', 'E24-L1', 'https://www.encuentra24.com/y', date_trunc('week', now())::date);

insert into public.corredores_bloqueados (corredor_id, telefono, nombre)
values (:'deluxe', '+50677770001', 'Corredor conocido');

insert into public.planes_dia (corredor_id, fecha, contenido)
values (:'deluxe', current_date, 'Plan de prueba');

insert into public.envios_pendientes (corredor_id, tipo, contenido)
values (:'deluxe', 'lista_duenos', 'Lista de prueba');

insert into public.correcciones (corredor_id, mensaje_id, original, corregido)
values (:'deluxe', gen_random_uuid(), 'Hola', 'Buenas tardes');

set local role service_role;
select public.registrar_uso(:'deluxe', p_mensajes_entrantes => 1);
reset role;

-- Contactos del otro corredor, para la prueba de llaves compuestas.
insert into public.contactos (id, corredor_id, telefono)
values ('30000000-0000-4000-8000-000000000002', :'otro', '+50688880002');

-- ---------------------------------------------------------------------------
-- Como el otro corredor
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_otro', 'role', 'authenticated')::text, true);

do $$
declare
  t text;
  n bigint;
begin
  -- 1. No ve ninguna fila de Deluxe.
  foreach t in array array[
    'propiedades', 'anuncios_e24', 'contactos', 'conversaciones', 'mensajes',
    'citas', 'leads_duenos', 'corredores_bloqueados', 'uso_mensual', 'planes_dia', 'envios_pendientes',
    'correcciones', 'uso_diario'
  ] loop
    execute format('select count(*) from public.%I where corredor_id = %L', t, '00000000-0000-4000-8000-000000000001') into n;
    if n <> 0 then
      raise exception 'FALLA: el otro corredor ve % filas de Deluxe en %', n, t;
    end if;
  end loop;

  select count(*) into n from public.corredores where id = '00000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FALLA: el otro corredor ve la fila de Deluxe en corredores'; end if;

  select count(*) into n from public.miembros where corredor_id = '00000000-0000-4000-8000-000000000001';
  if n <> 0 then raise exception 'FALLA: el otro corredor ve miembros de Deluxe'; end if;

  -- Sí ve lo suyo (la prueba no pasa en vacío).
  select count(*) into n from public.contactos;
  if n <> 1 then raise exception 'FALLA: el otro corredor debería ver 1 contacto propio, ve %', n; end if;

  select count(*) into n from public.corredores;
  if n <> 1 then raise exception 'FALLA: el otro corredor debería ver solo su corredor, ve %', n; end if;

  -- 2. No puede modificar ni borrar datos de Deluxe.
  update public.propiedades set precio = 1 where corredor_id = '00000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLA: el otro corredor modificó % propiedades de Deluxe', n; end if;

  -- (Los contactos ya no se escriben desde la sesión; si algún día vuelve a poder, RLS debe frenarlo.)
  begin
    delete from public.contactos where corredor_id = '00000000-0000-4000-8000-000000000001';
    get diagnostics n = row_count;
    if n <> 0 then raise exception 'FALLA: el otro corredor borró % contactos de Deluxe', n; end if;
  exception when insufficient_privilege then null;
  end;

  update public.corredores set tono = 'x' where id = '00000000-0000-4000-8000-000000000001';
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'FALLA: el otro corredor cambió el tono de Deluxe'; end if;

  -- 3. No puede insertar filas a nombre de Deluxe.
  begin
    insert into public.contactos (corredor_id, telefono)
    values ('00000000-0000-4000-8000-000000000001', '+50688889999');
    raise exception 'FALLA: el otro corredor insertó un contacto en Deluxe';
  exception when insufficient_privilege then null;
  end;

  -- 4. No puede apuntar desde su corredor a una conversación de Deluxe (llave compuesta).
  begin
    insert into public.mensajes (corredor_id, conversacion_id, direccion, autor, contenido)
    values ('00000000-0000-4000-8000-000000000002', '40000000-0000-4000-8000-000000000001',
            'saliente', 'corredor', 'x');
    raise exception 'FALLA: se creó un mensaje del otro corredor en una conversación de Deluxe';
  -- Hoy el corredor ni siquiera puede insertar mensajes; la llave compuesta sigue protegiendo al backend.
  exception when foreign_key_violation or insufficient_privilege then null;
  end;

  -- 5. No puede darse acceso a Deluxe ni subir su propio tope.
  begin
    insert into public.miembros (corredor_id, user_id)
    values ('00000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000002');
    raise exception 'FALLA: el otro corredor se agregó como miembro de Deluxe';
  exception when insufficient_privilege then null;
  end;

  begin
    update public.corredores set tope_mensajes_mes = 100000;
    raise exception 'FALLA: el corredor pudo cambiar su propio tope de mensajes';
  exception when insufficient_privilege then null;
  end;

  -- 6. No puede inflar ni borrar su contador de uso.
  begin
    perform public.registrar_uso('00000000-0000-4000-8000-000000000002', 0, -500);
    raise exception 'FALLA: un usuario autenticado pudo llamar registrar_uso';
  exception when insufficient_privilege then null;
  end;

  raise notice 'OK: el otro corredor no ve ni toca datos de Deluxe';
end;
$$;

-- ---------------------------------------------------------------------------
-- Como Patricia: ve lo suyo
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claims', json_build_object('sub', :'user_patricia', 'role', 'authenticated')::text, true);

do $$
declare
  n bigint;
begin
  select count(*) into n from public.propiedades;
  if n <> 3 then raise exception 'FALLA: Patricia debería ver 3 propiedades, ve %', n; end if;

  select count(*) into n from public.mensajes;
  if n <> 1 then raise exception 'FALLA: Patricia debería ver 1 mensaje, ve %', n; end if;

  select count(*) into n from public.contactos;
  if n <> 1 then raise exception 'FALLA: Patricia no debería ver contactos del otro corredor (ve %)', n; end if;

  select mensajes_total into n from public.uso_mensual;
  if n <> 1 then raise exception 'FALLA: Patricia debería ver 1 mensaje en uso_mensual, ve %', n; end if;

  update public.corredores set tono = 'cercano y profesional';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLA: Patricia no pudo ajustar su tono'; end if;

  raise notice 'OK: Patricia ve y ajusta solo lo suyo';
end;
$$;

-- ---------------------------------------------------------------------------
-- Sin sesión (anon): no ve nada
-- ---------------------------------------------------------------------------

reset role;
set local role anon;
select set_config('request.jwt.claims', '', true);

do $$
begin
  begin
    perform 1 from public.propiedades;
    raise exception 'FALLA: anon pudo leer propiedades';
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK: anon no tiene acceso';
end;
$$;

rollback;
