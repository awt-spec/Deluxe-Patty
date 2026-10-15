-- Datos semilla: Deluxe Properties como primer corredor.
--
-- Las propiedades de abajo son de EJEMPLO para desarrollo y pruebas (código EJEMPLO-*).
-- Las reales llegan con la lista de propiedades activas que entrega Patricia en la semana 0
-- y se cargan con un script aparte; nunca se mezclan con estas.
-- Los números de WhatsApp quedan en null hasta que se decida el número de la asistente.

insert into public.corredores (
  id, slug, nombre, nombre_contacto, zona_horaria, zonas, tono, reglas_escalamiento,
  hora_plan_dia, plan, tope_mensajes_mes, aviso_mensajes_mes, respuesta_automatica
) values (
  '00000000-0000-4000-8000-000000000001',
  'deluxe-properties',
  'Deluxe Properties',
  'Patricia',
  'America/Costa_Rica',
  '{}',
  '',
  array[
    'negociación de precio',
    'comisiones',
    'ofertas formales',
    'quejas'
  ],
  '07:00',
  'usd_299',
  1000,
  900,
  false
)
on conflict (id) do nothing;

insert into public.propiedades (
  corredor_id, codigo, titulo, tipo, operacion, precio, moneda,
  provincia, canton, distrito, zona, habitaciones, banos, m2_construccion, m2_terreno,
  descripcion, amenidades, estado
) values
  ('00000000-0000-4000-8000-000000000001', 'EJEMPLO-001',
   'Casa de ejemplo en condominio', 'casa', 'venta', 450000, 'USD',
   'San José', 'Escazú', 'San Rafael', 'Escazú', 3, 3.5, 320, 500,
   'Propiedad ficticia para pruebas de desarrollo.', array['piscina', 'seguridad 24/7'], 'activa'),
  ('00000000-0000-4000-8000-000000000001', 'EJEMPLO-002',
   'Apartamento de ejemplo', 'apartamento', 'alquiler', 2200, 'USD',
   'San José', 'Santa Ana', 'Pozos', 'Santa Ana', 2, 2, 140, null,
   'Propiedad ficticia para pruebas de desarrollo.', array['gimnasio', 'amueblado'], 'activa'),
  ('00000000-0000-4000-8000-000000000001', 'EJEMPLO-003',
   'Lote de ejemplo', 'lote', 'venta', 180000, 'USD',
   'Heredia', 'Belén', 'La Asunción', 'Belén', null, null, null, 1200,
   'Propiedad ficticia para pruebas de desarrollo.', '{}', 'activa')
on conflict (corredor_id, codigo) do nothing;
