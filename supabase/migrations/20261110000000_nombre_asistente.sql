-- Cada corredor le pone nombre a su asistente (Deluxe: "Patty"). El panel lo muestra y el corredor
-- puede cambiarlo desde Ajustes.
alter table public.corredores
  add column if not exists nombre_asistente text not null default 'Patty'
    check (length(nombre_asistente) between 1 and 40);

-- El panel lee y edita el corredor con la sesión (permisos por columna): sin el permiso de lectura el
-- corredor queda sin acceso al panel.
grant select (nombre_asistente) on public.corredores to authenticated;
grant update (nombre_asistente) on public.corredores to authenticated;
