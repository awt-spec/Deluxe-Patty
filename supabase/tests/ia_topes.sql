-- Gasto de IA: las imágenes suman al día y al mes, el presupuesto toma el tope del corredor o el de la
-- plataforma, y ni el corredor ni anon leen superadmins ni plataforma.
\set ON_ERROR_STOP on
begin;
\set deluxe '00000000-0000-4000-8000-000000000001'
\set user_patricia '10000000-0000-4000-8000-000000000001'
insert into public.miembros (corredor_id, user_id) values (:'deluxe', :'user_patricia');
insert into public.superadmins (correo) values ('soporte@ejemplo.com');

do $$
declare p record;
begin
  perform public.registrar_uso('00000000-0000-4000-8000-000000000001', 1, 0, 1, 10, 10, 0.5);
  perform public.registrar_imagenes('00000000-0000-4000-8000-000000000001', 2, 0.3);
  select * into p from public.presupuesto_ia('00000000-0000-4000-8000-000000000001');
  if p.gasto_dia <> 0.8 or p.gasto_mes <> 0.8 then
    raise exception 'FALLA: el gasto no suma Claude e imágenes (% / %)', p.gasto_dia, p.gasto_mes;
  end if;
  if p.tope_dia <> 10 or p.tope_mes <> 150 then raise exception 'FALLA: no tomó los topes de la plataforma'; end if;
  update public.corredores set tope_ia_dia_usd = 2 where id = '00000000-0000-4000-8000-000000000001';
  select * into p from public.presupuesto_ia('00000000-0000-4000-8000-000000000001');
  if p.tope_dia <> 2 or p.tope_mes <> 150 then raise exception 'FALLA: no tomó el tope propio del corredor'; end if;
  if (select imagenes from public.uso_mensual where corredor_id = '00000000-0000-4000-8000-000000000001') <> 2 then
    raise exception 'FALLA: el mes no contó las imágenes';
  end if;
  -- Notas de voz: la transcripción suma al mismo presupuesto.
  perform public.registrar_audio('00000000-0000-4000-8000-000000000001', 60, 0.2);
  select * into p from public.presupuesto_ia('00000000-0000-4000-8000-000000000001');
  if p.gasto_dia <> 1.0 or p.gasto_mes <> 1.0 then
    raise exception 'FALLA: el gasto no suma el audio (% / %)', p.gasto_dia, p.gasto_mes;
  end if;
  if (select segundos_audio from public.uso_mensual where corredor_id = '00000000-0000-4000-8000-000000000001') <> 60 then
    raise exception 'FALLA: el mes no contó los segundos de audio';
  end if;
end;
$$;

set local role authenticated;
select set_config('request.jwt.claims', json_build_object('sub', :'user_patricia', 'role', 'authenticated')::text, true);
do $$
begin
  begin
    perform 1 from public.superadmins;
    raise exception 'FALLA: el corredor puede leer superadmins';
  exception when insufficient_privilege then null;
  end;
  begin
    perform 1 from public.plataforma;
    raise exception 'FALLA: el corredor puede leer la plataforma';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.presupuesto_ia('00000000-0000-4000-8000-000000000001');
    raise exception 'FALLA: el corredor puede llamar presupuesto_ia';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.registrar_audio('00000000-0000-4000-8000-000000000001', 10, 0.01);
    raise exception 'FALLA: el corredor puede llamar registrar_audio';
  exception when insufficient_privilege then null;
  end;
  begin
    update public.corredores set tope_ia_dia_usd = 999 where id = '00000000-0000-4000-8000-000000000001';
    if found then raise exception 'FALLA: el corredor cambió su propio tope'; end if;
  exception when insufficient_privilege then null;
  end;
  raise notice 'OK: topes de IA con imágenes y superadmins solo para el backend';
end;
$$;
rollback;
