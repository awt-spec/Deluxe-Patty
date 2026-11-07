-- CRM: por qué se perdió un cliente (para aprender de eso) y el corredor puede anotarlo desde su panel.
alter table public.contactos
  add column if not exists motivo_perdida text
    check (motivo_perdida is null or length(motivo_perdida) <= 200);

grant update (motivo_perdida) on public.contactos to authenticated;
