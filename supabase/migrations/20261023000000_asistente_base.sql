-- Asistente Base: el corredor le escribe a su asistente (análisis a pedido) y recibe el plan del día.

-- El corredor también conversa con su asistente desde su número personal. Su contacto se marca
-- para separarlo de los clientes en el panel y en los conteos de prospectos.
alter table public.contactos add column es_corredor boolean not null default false;

-- Un plan por corredor y día. La fila se crea al generarlo (evita duplicados si el cron corre dos
-- veces) y enviado_at queda en null mientras el corredor no haya abierto la ventana de 24 horas.
create table public.planes_dia (
  corredor_id  uuid not null references public.corredores (id) on delete cascade,
  fecha        date not null,
  contenido    text not null,
  enviado_at   timestamptz,
  created_at   timestamptz not null default now(),
  primary key (corredor_id, fecha)
);

alter table public.planes_dia enable row level security;
revoke all on public.planes_dia from anon;

create policy planes_dia_select on public.planes_dia for select to authenticated
  using (corredor_id in (select public.mis_corredores()));
