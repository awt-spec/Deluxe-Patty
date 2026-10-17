-- Cuenta de demo: un corredor con activo = false y datos ficticios (scripts/crear-demo.mts), al que se
-- entra con el botón "Ver la demo" de /entrar. Un corredor inactivo nunca manda nada por WhatsApp
-- (lib/asistente/dependencias.ts) y los crons, el webhook y la búsqueda de dueños ya lo saltan.
-- El panel necesita leer `activo` con la sesión del corredor para saberlo.

grant select (activo) on public.corredores to authenticated;
