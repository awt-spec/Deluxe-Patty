-- Anuncios de Encuentra24: preparación, atribución de contactos y vencimiento.
--
-- Un anuncio nace como borrador cuando la asistente prepara el texto (todavía sin e24_id ni url).
-- Su referencia va en el enlace de WhatsApp de la descripción; cuando el anuncio aparece publicado
-- en el perfil del corredor, la lectura del perfil lo enlaza a su borrador por esa referencia.

alter table public.anuncios_e24
  alter column e24_id drop not null,
  alter column url drop not null,
  alter column referencia set default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6)),
  add column texto_preparado jsonb check (texto_preparado is null or jsonb_typeof(texto_preparado) = 'object'),
  drop constraint anuncios_e24_estado_check,
  add constraint anuncios_e24_estado_check
    check (estado in ('borrador', 'activo', 'vencido', 'pausado', 'eliminado')),
  add constraint anuncios_e24_publicado_completo
    check (estado = 'borrador' or (e24_id is not null and url is not null));

-- Un borrador abierto por propiedad: preparar otra vez reescribe el mismo.
create unique index anuncios_e24_borrador_por_propiedad_idx
  on public.anuncios_e24 (corredor_id, propiedad_id) where estado = 'borrador';
