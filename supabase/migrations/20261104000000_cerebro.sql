-- Segundo cerebro de la asistente: lo que el corredor le enseña (datos que no están en las fichas de las
-- casas: políticas, procesos, zonas, preguntas frecuentes) y las dudas que la asistente no supo contestar.
-- Cada duda que el corredor responde pasa a ser algo que la asistente ya sabe.

create table public.conocimiento (
  id               uuid primary key default gen_random_uuid(),
  corredor_id      uuid not null references public.corredores (id) on delete cascade,
  tema             text not null check (length(tema) between 1 and 300),
  respuesta        text check (respuesta is null or length(respuesta) <= 2000),
  estado           text not null default 'activo' check (estado in ('pendiente', 'activo', 'archivado')),
  origen           text not null default 'manual' check (origen in ('manual', 'duda')),
  conversacion_id  uuid,
  veces            integer not null default 1,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (estado <> 'activo' or respuesta is not null),
  foreign key (conversacion_id, corredor_id) references public.conversaciones (id, corredor_id) on delete set null (conversacion_id)
);

create index conocimiento_corredor_idx on public.conocimiento (corredor_id, estado, updated_at desc);

alter table public.conocimiento enable row level security;
revoke all on public.conocimiento from anon;
-- El corredor lee y edita lo que sabe su asistente desde el panel; las dudas las crea el backend.
create policy conocimiento_corredor on public.conocimiento for all to authenticated
  using (corredor_id in (select public.mis_corredores()))
  with check (corredor_id in (select public.mis_corredores()));
