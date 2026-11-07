-- Agenda por zona: de dónde sale el corredor cada día (su casa u oficina). Con esto y la zona de cada
-- propiedad, la asistente calcula el traslado entre visitas y junta las visitas cercanas el mismo día.
alter table public.corredores
  add column if not exists zona_base text check (zona_base is null or length(zona_base) <= 80);

grant update (zona_base) on public.corredores to authenticated;

-- Patricia (Deluxe Properties) vive en Lindora.
update public.corredores set zona_base = 'Lindora' where slug = 'deluxe-properties' and zona_base is null;
