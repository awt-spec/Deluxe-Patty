-- El panel lee el corredor con la sesión del corredor (permisos por columna en corredores). Si una
-- columna nueva de COLUMNAS_CORREDOR (lib/datos/repositorio.ts) no tiene permiso de lectura, la consulta
-- falla y el corredor queda sin acceso. Mantener esta lista igual a COLUMNAS_CORREDOR.

\set ON_ERROR_STOP on

begin;
\set deluxe '00000000-0000-4000-8000-000000000001'
\set user_patricia '10000000-0000-4000-8000-000000000001'
insert into public.miembros (corredor_id, user_id) values (:'deluxe', :'user_patricia');

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_patricia', 'role', 'authenticated')::text, true);

select id, nombre, nombre_contacto, whatsapp_numero, whatsapp_phone_number_id, whatsapp_corredor, zona_horaria, tono,
       reglas_escalamiento, tope_mensajes_mes, aviso_mensajes_mes, respuesta_automatica, duracion_visita_min,
       margen_visitas_min, anticipacion_min_horas, horizonte_agenda_dias, hora_plan_dia, marca, activo, zona_base, nombre_asistente
  from public.corredores;

do $$ begin raise notice 'OK: el panel puede leer todas las columnas del corredor'; end $$;
rollback;
