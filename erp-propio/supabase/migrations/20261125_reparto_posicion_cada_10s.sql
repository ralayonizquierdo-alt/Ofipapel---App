-- Rober, 25/11/2026: la app de reparto manda la posición cada 20 s (antes 30 s) y además al instante cuando se desbloquea el móvil
-- o se marca un pedido. Para que esos avisos extra no se pierdan, el servidor admite un punto cada 10 s por repartidor (antes 20 s).
-- Aplicada en Supabase como «reparto_posicion_cada_10s».
do $$
declare d text := pg_get_functiondef('public.fn_app_rep_posicion(uuid,text,integer,double precision,double precision,real)'::regprocedure);
begin
  if position('interval ''10 seconds''' in d) = 0 then
    if position('interval ''20 seconds''' in d) = 0 then raise exception 'No se encontró el sitio en fn_app_rep_posicion (ha cambiado).'; end if;
    d := replace(d, 'interval ''20 seconds''', 'interval ''10 seconds''');
    if position('interval ''10 seconds''' in d) = 0 then raise exception 'No se pudo cambiar fn_app_rep_posicion.'; end if;
    execute d;
  end if;
end $$;
