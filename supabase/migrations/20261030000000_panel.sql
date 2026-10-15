-- Panel del corredor: piloto en sombra (correcciones de tono), monitoreo y costo diario.

-- Cada corrección del corredor a un borrador queda como ejemplo de tono para las respuestas siguientes.
create table public.correcciones (
  id           uuid primary key default gen_random_uuid(),
  corredor_id  uuid not null references public.corredores (id) on delete cascade,
  mensaje_id   uuid not null,
  original     text not null,
  corregido    text not null,
  created_at   timestamptz not null default now()
);

create index correcciones_corredor_idx on public.correcciones (corredor_id, created_at desc);

alter table public.correcciones enable row level security;
revoke all on public.correcciones from anon;
create policy correcciones_select on public.correcciones for select to authenticated
  using (corredor_id in (select public.mis_corredores()));

-- Uso por día (además del mensual), para ver el costo diario por corredor.
create table public.uso_diario (
  corredor_id         uuid not null references public.corredores (id) on delete cascade,
  dia                 date not null,
  mensajes            integer not null default 0,
  llamadas_claude     integer not null default 0,
  costo_claude_usd    numeric(10, 4) not null default 0,
  primary key (corredor_id, dia)
);

alter table public.uso_diario enable row level security;
revoke all on public.uso_diario from anon;
create policy uso_diario_select on public.uso_diario for select to authenticated
  using (corredor_id in (select public.mis_corredores()));

-- registrar_uso() también suma al día (misma firma: no cambia a quien la llama).
create or replace function public.registrar_uso(
  p_corredor_id        uuid,
  p_mensajes_entrantes integer default 0,
  p_mensajes_salientes integer default 0,
  p_llamadas_claude    integer default 0,
  p_tokens_entrada     bigint default 0,
  p_tokens_salida      bigint default 0,
  p_costo_claude_usd   numeric default 0,
  p_costo_whatsapp_usd numeric default 0
)
returns public.uso_mensual
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_local timestamp;
  v_fila public.uso_mensual;
begin
  select now() at time zone c.zona_horaria into v_local
    from public.corredores c where c.id = p_corredor_id;
  if v_local is null then
    raise exception 'corredor % no existe', p_corredor_id;
  end if;

  insert into public.uso_mensual as u (
    corredor_id, mes, mensajes_entrantes, mensajes_salientes, llamadas_claude,
    tokens_entrada, tokens_salida, costo_claude_usd, costo_whatsapp_usd
  ) values (
    p_corredor_id, date_trunc('month', v_local)::date, p_mensajes_entrantes, p_mensajes_salientes,
    p_llamadas_claude, p_tokens_entrada, p_tokens_salida, p_costo_claude_usd, p_costo_whatsapp_usd
  )
  on conflict (corredor_id, mes) do update set
    mensajes_entrantes = u.mensajes_entrantes + excluded.mensajes_entrantes,
    mensajes_salientes = u.mensajes_salientes + excluded.mensajes_salientes,
    llamadas_claude    = u.llamadas_claude + excluded.llamadas_claude,
    tokens_entrada     = u.tokens_entrada + excluded.tokens_entrada,
    tokens_salida      = u.tokens_salida + excluded.tokens_salida,
    costo_claude_usd   = u.costo_claude_usd + excluded.costo_claude_usd,
    costo_whatsapp_usd = u.costo_whatsapp_usd + excluded.costo_whatsapp_usd,
    updated_at         = now()
  returning * into v_fila;

  insert into public.uso_diario as d (corredor_id, dia, mensajes, llamadas_claude, costo_claude_usd)
  values (p_corredor_id, v_local::date, p_mensajes_entrantes + p_mensajes_salientes, p_llamadas_claude, p_costo_claude_usd)
  on conflict (corredor_id, dia) do update set
    mensajes         = d.mensajes + excluded.mensajes,
    llamadas_claude  = d.llamadas_claude + excluded.llamadas_claude,
    costo_claude_usd = d.costo_claude_usd + excluded.costo_claude_usd;

  return v_fila;
end;
$$;

-- Alertas de monitoreo ya enviadas, para no repetir la misma alerta en ráfaga.
create table public.alertas (
  clave       text primary key,
  enviada_at  timestamptz not null default now()
);
alter table public.alertas enable row level security;
revoke all on public.alertas from anon, authenticated;
