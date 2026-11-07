-- Embudo de dueños (captación): Encontrado → Le escribí → Respondió → Visité la casa → Firmó conmigo →
-- Publicada. Al publicarla, la casa pasa a Mis casas y el dueño queda enlazado a ella.

alter table public.leads_duenos drop constraint if exists leads_duenos_estado_contacto_check;
alter table public.leads_duenos add constraint leads_duenos_estado_contacto_check
  check (estado_contacto in ('nuevo', 'contactado', 'respondio', 'visitada', 'captado', 'publicada', 'descartado'));

alter table public.leads_duenos
  add column if not exists propiedad_id uuid,
  add column if not exists notas text check (notas is null or length(notas) <= 2000),
  add column if not exists estado_at timestamptz not null default now();
alter table public.leads_duenos
  add constraint leads_duenos_propiedad_fk foreign key (propiedad_id, corredor_id)
    references public.propiedades (id, corredor_id) on delete set null (propiedad_id);
