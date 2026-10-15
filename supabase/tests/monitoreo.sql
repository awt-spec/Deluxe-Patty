-- reclamar_alerta: una alerta por clave dentro de la ventana; uso_diario se suma con registrar_uso.
\set ON_ERROR_STOP on
begin;
do $$
begin
  if not public.reclamar_alerta('prueba', 60) then raise exception 'FALLA: la primera alerta no se reclamó'; end if;
  if public.reclamar_alerta('prueba', 60) then raise exception 'FALLA: la alerta se repitió dentro de la ventana'; end if;
  update public.alertas set enviada_at = now() - interval '2 hours' where clave = 'prueba';
  if not public.reclamar_alerta('prueba', 60) then raise exception 'FALLA: la alerta no volvió después de la ventana'; end if;

  perform public.registrar_uso('00000000-0000-4000-8000-000000000001', 2, 3, 1, 10, 10, 0.5);
  if (select mensajes from public.uso_diario where corredor_id = '00000000-0000-4000-8000-000000000001') <> 5 then
    raise exception 'FALLA: uso_diario no sumó los mensajes';
  end if;
  raise notice 'OK: alertas sin ráfagas y uso diario';
end;
$$;
rollback;
