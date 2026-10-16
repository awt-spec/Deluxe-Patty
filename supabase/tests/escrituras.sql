-- El corredor solo escribe lo que el panel le deja: la ficha de sus propiedades, su horario, sus
-- bloqueos, sus corredores conocidos y algunos ajustes. Corre en una transacción con rollback.

\set ON_ERROR_STOP on

begin;

\set deluxe '00000000-0000-4000-8000-000000000001'
\set user_patricia '10000000-0000-4000-8000-000000000001'

insert into public.miembros (corredor_id, user_id) values (:'deluxe', :'user_patricia');
insert into public.contactos (id, corredor_id, telefono, nombre)
values ('30000000-0000-4000-8000-000000000009', :'deluxe', '+50688880009', 'Cliente');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_patricia', 'role', 'authenticated')::text, true);

do $$
declare
  n bigint;
begin
  -- Puede editar la ficha de su propiedad.
  update public.propiedades set titulo = 'Nuevo título' where codigo = 'EJEMPLO-001';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLA: el corredor no pudo editar la ficha de su propiedad'; end if;

  -- No puede escribir URLs de fotos directamente.
  begin
    update public.propiedades set fotos = '[{"url": "http://169.254.169.254/"}]' where codigo = 'EJEMPLO-001';
    raise exception 'FALLA: el corredor escribió fotos directamente';
  exception when insufficient_privilege then null;
  end;

  -- No puede borrar propiedades.
  begin
    delete from public.propiedades where codigo = 'EJEMPLO-001';
    raise exception 'FALLA: el corredor borró una propiedad';
  exception when insufficient_privilege then null;
  end;

  -- No puede tocar contactos, conversaciones, mensajes ni citas.
  begin
    update public.contactos set telefono = '+50670000999';
    raise exception 'FALLA: el corredor cambió el teléfono de un contacto';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.conversaciones (corredor_id, contacto_id)
    values ('00000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000009');
    raise exception 'FALLA: el corredor creó una conversación';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.citas set estado = 'cancelada';
    raise exception 'FALLA: el corredor cambió citas directamente';
  exception when insufficient_privilege then null;
  end;

  -- No puede cambiar su número personal.
  begin
    update public.corredores set whatsapp_corredor = '+50670000999';
    raise exception 'FALLA: el corredor cambió su número personal';
  exception when insufficient_privilege then null;
  end;

  -- Sí puede guardar su horario y sus ajustes.
  insert into public.horarios_visitas (corredor_id, dia_semana, hora_inicio, hora_fin)
  values ('00000000-0000-4000-8000-000000000001', 0, '08:00', '12:00');
  update public.corredores set tono = 'Cordial';
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'FALLA: el corredor no pudo guardar su tono'; end if;
end;
$$;

reset role;

-- El código de propiedad no admite rutas ni espacios.
do $$
begin
  begin
    update public.propiedades set codigo = 'x/../../otro' where codigo = 'EJEMPLO-002';
    raise exception 'FALLA: se aceptó un código con barras';
  exception when check_violation then null;
  end;
  raise notice 'OK: el corredor solo escribe lo que el panel le deja';
end;
$$;

rollback;
