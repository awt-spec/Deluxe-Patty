-- CRM de clientes: etapa del embudo, lo que busca (lo llena la asistente con lo que el cliente dice en
-- el chat), notas y seguimiento. El corredor edita estos campos desde su panel; teléfono y origen los
-- sigue escribiendo solo el backend.

alter table public.contactos
  add column etapa              text not null default 'nuevo'
    check (etapa in ('nuevo', 'interesado', 'visita', 'negociando', 'cerrado', 'perdido')),
  add column etapa_at           timestamptz not null default now(),
  -- { operacion, tipo, zonas[], presupuesto_max, moneda, habitaciones }: lo que el cliente dijo.
  add column busca              jsonb not null default '{}' check (jsonb_typeof(busca) = 'object'),
  add column seguimiento_fecha  date,
  add column seguimiento_nota   text check (seguimiento_nota is null or length(seguimiento_nota) <= 500);

create index contactos_etapa_idx on public.contactos (corredor_id, etapa);
create index contactos_seguimiento_idx on public.contactos (corredor_id, seguimiento_fecha)
  where seguimiento_fecha is not null;

-- El corredor puede editar el CRM de sus clientes (la política contactos_corredor ya limita a los suyos).
grant update (nombre, email, notas, etapa, etapa_at, busca, seguimiento_fecha, seguimiento_nota)
  on public.contactos to authenticated;
