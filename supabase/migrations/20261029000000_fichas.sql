-- Fichas de propiedad en PDF. La identidad visual de cada corredor es dato (corredores.marca).

alter table public.corredores
  add column marca jsonb check (marca is null or jsonb_typeof(marca) = 'object');

grant select (marca) on public.corredores to authenticated;

-- Bucket público para las fichas: son material de venta que el corredor comparte con clientes.
do $$
begin
  if to_regclass('storage.buckets') is not null then
    insert into storage.buckets (id, name, public) values ('fichas', 'fichas', true)
    on conflict (id) do nothing;
  end if;
end;
$$;
