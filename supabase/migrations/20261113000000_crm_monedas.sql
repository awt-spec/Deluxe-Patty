-- Ofertas y cierres en su moneda (dólares o colones): un alquiler en colones se anota en colones y
-- nunca se suma con dólares.
alter table public.contactos
  add column if not exists oferta_moneda text not null default 'USD' check (oferta_moneda in ('USD', 'CRC')),
  add column if not exists cierre_moneda text not null default 'USD' check (cierre_moneda in ('USD', 'CRC'));

-- Al unir dos clientes, la moneda viaja con su oferta.
create or replace function public.unir_contactos(p_corredor uuid, p_queda uuid, p_sale uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  q public.contactos%rowtype;
  s public.contactos%rowtype;
  orden constant jsonb := '{"nuevo":0,"interesado":1,"visita":2,"negociando":3,"cerrado":4,"perdido":4}';
begin
  if p_queda = p_sale then
    return false;
  end if;
  select * into q from public.contactos where id = p_queda and corredor_id = p_corredor for update;
  select * into s from public.contactos where id = p_sale and corredor_id = p_corredor for update;
  if q.id is null or s.id is null then
    return false;
  end if;

  if exists (select 1 from public.conversaciones where corredor_id = p_corredor and contacto_id = p_queda and estado <> 'cerrada') then
    update public.conversaciones set estado = 'cerrada'
     where corredor_id = p_corredor and contacto_id = p_sale and estado <> 'cerrada';
  end if;
  update public.conversaciones set contacto_id = p_queda where corredor_id = p_corredor and contacto_id = p_sale;
  update public.citas set contacto_id = p_queda where corredor_id = p_corredor and contacto_id = p_sale;
  update public.actividades set contacto_id = p_queda where corredor_id = p_corredor and contacto_id = p_sale;
  update public.correos_procesados set contacto_id = p_queda where corredor_id = p_corredor and contacto_id = p_sale;

  update public.contactos set
    nombre = coalesce(q.nombre, s.nombre),
    email = coalesce(q.email, s.email),
    notas = nullif(concat_ws(E'\n', q.notas, s.notas, 'Otro teléfono: ' || s.telefono), ''),
    busca = s.busca || q.busca,
    seguimiento_fecha = coalesce(q.seguimiento_fecha, s.seguimiento_fecha),
    seguimiento_nota = case when q.seguimiento_fecha is null then s.seguimiento_nota else q.seguimiento_nota end,
    propiedad_interes_id = coalesce(q.propiedad_interes_id, s.propiedad_interes_id),
    oferta_monto = coalesce(q.oferta_monto, s.oferta_monto),
    oferta_moneda = case when q.oferta_monto is null and s.oferta_monto is not null then s.oferta_moneda else q.oferta_moneda end,
    anuncio_id = coalesce(q.anuncio_id, s.anuncio_id),
    etapa = case when q.etapa in ('cerrado', 'perdido') or (orden ->> q.etapa)::int >= (orden ->> s.etapa)::int then q.etapa else s.etapa end,
    etapa_at = case when q.etapa in ('cerrado', 'perdido') or (orden ->> q.etapa)::int >= (orden ->> s.etapa)::int then q.etapa_at else s.etapa_at end
  where id = p_queda and corredor_id = p_corredor;

  insert into public.actividades (corredor_id, contacto_id, tipo, texto)
  values (p_corredor, p_queda, 'nota', 'Se unió con otro cliente que era la misma persona (' || coalesce(s.nombre, s.telefono) || ')');

  delete from public.contactos where id = p_sale and corredor_id = p_corredor;
  return true;
end;
$$;

revoke all on function public.unir_contactos(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.unir_contactos(uuid, uuid, uuid) to service_role;
