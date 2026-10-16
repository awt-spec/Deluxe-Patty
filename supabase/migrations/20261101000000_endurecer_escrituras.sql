-- Revisión de seguridad antes de producción: el corredor (rol authenticated, con la llave pública y su
-- sesión) solo puede escribir lo que el panel le deja escribir. Lo demás lo escribe el backend.

-- 1. Mensajes, conversaciones, contactos, citas y anuncios los escribe solo el backend (webhook y
--    acciones del panel con service_role después de comprobar con la sesión). Así nadie puede, por
--    ejemplo, cambiar el teléfono de un contacto y aprobar un "borrador" para escribirle en frío.
revoke insert, update, delete on public.mensajes, public.conversaciones, public.contactos,
  public.citas, public.anuncios_e24 from authenticated;

-- 2. Propiedades: el corredor edita la ficha, pero no las fotos (sus URLs las arma el backend desde el
--    bucket propio) ni borra filas.
revoke insert, update, delete on public.propiedades from authenticated;
grant insert (corredor_id, codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito,
              zona, habitaciones, banos, m2_construccion, m2_terreno, descripcion, amenidades, url_e24, estado)
  on public.propiedades to authenticated;
grant update (codigo, titulo, tipo, operacion, precio, moneda, provincia, canton, distrito, zona,
              habitaciones, banos, m2_construccion, m2_terreno, descripcion, amenidades, url_e24, estado)
  on public.propiedades to authenticated;

-- El código se usa en comandos de WhatsApp y en rutas de archivos: solo letras, números y guiones.
alter table public.propiedades
  add constraint propiedades_codigo_formato check (codigo ~ '^[A-Za-z0-9][A-Za-z0-9-]{1,39}$'),
  add constraint propiedades_url_e24_https check (url_e24 is null or url_e24 ~ '^https://');

-- 3. El número personal del corredor lo carga soporte: cambiarlo desviaría avisos con datos de clientes.
revoke update (whatsapp_corredor) on public.corredores from authenticated;

-- 4. Buckets: solo imágenes (fotos) o PDF (fichas) y con tamaño máximo.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    update storage.buckets
      set file_size_limit = 15 * 1024 * 1024,
          allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp']
      where id = 'fotos';
    update storage.buckets
      set file_size_limit = 20 * 1024 * 1024,
          allowed_mime_types = array['application/pdf']
      where id = 'fichas';
  end if;
end;
$$;
