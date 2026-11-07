-- El panel lee los datos del corredor con la sesión del corredor y en corredores los permisos son por
-- columna: sin esto, la consulta del panel falla y el corredor queda sin acceso.
grant select (zona_base) on public.corredores to authenticated;
