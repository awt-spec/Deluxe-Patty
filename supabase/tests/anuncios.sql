-- Anuncios: borradores sin publicar, referencia automática y un borrador por propiedad.
\set ON_ERROR_STOP on

begin;

do $$
declare
  p uuid;
  ref text;
begin
  select id into p from public.propiedades
   where corredor_id = '00000000-0000-4000-8000-000000000001' and codigo = 'EJEMPLO-001';

  -- Un borrador no necesita e24_id ni url y recibe referencia sola.
  insert into public.anuncios_e24 (corredor_id, propiedad_id, estado, titulo)
  values ('00000000-0000-4000-8000-000000000001', p, 'borrador', 'Casa')
  returning referencia into ref;
  if ref !~ '^[0-9A-F]{6}$' then raise exception 'FALLA: referencia automática inválida: %', ref; end if;

  -- Un segundo borrador de la misma propiedad: rechazado.
  begin
    insert into public.anuncios_e24 (corredor_id, propiedad_id, estado)
    values ('00000000-0000-4000-8000-000000000001', p, 'borrador');
    raise exception 'FALLA: dos borradores para la misma propiedad';
  exception when unique_violation then null;
  end;

  -- Publicado sin url: rechazado.
  begin
    update public.anuncios_e24 set estado = 'activo', e24_id = '123' where referencia = ref;
    raise exception 'FALLA: anuncio activo sin url';
  exception when check_violation then null;
  end;

  update public.anuncios_e24 set estado = 'activo', e24_id = '123', url = 'https://www.encuentra24.com/x'
   where referencia = ref;

  raise notice 'OK: reglas de anuncios';
end;
$$;

rollback;
