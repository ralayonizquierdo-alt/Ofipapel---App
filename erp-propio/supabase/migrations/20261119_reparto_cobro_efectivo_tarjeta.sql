-- App de reparto: cobrado en efectivo o con tarjeta (Rober, 18/11/2026: «cuando el repartidor acepta como entregado
-- uno de los pedidos y le pregunta si lo ha cobrado, también hay que preguntarle si en efectivo o con tarjeta… y en
-- caja deben separarse los dos importes»).
--
--  · reparto_linea.cobro_medio: 'efectivo' o 'tarjeta' (vacío si no se cobró o si se marcó antes de este cambio, que
--    cuenta como efectivo).
--  · fn_app_rep_marcar: con «entregado», p_detalle trae el medio. Queda también en las observaciones del parte
--    («Cobrado con tarjeta»), para David al cerrar en GeminisWin.
--  · Las listas de la app (repartidor, oficina y caja) devuelven «medio».
--  · fn_app_rep_liquidar: «esperado» es solo el EFECTIVO (lo que el repartidor entrega en mano); lo cobrado con
--    tarjeta va aparte (reparto_liquidacion.tarjeta), se liquida igual pero no se compara con el dinero entregado.
alter table public.reparto_linea add column if not exists cobro_medio text;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'reparto_linea_cobro_medio_chk') then
    alter table public.reparto_linea add constraint reparto_linea_cobro_medio_chk check (cobro_medio is null or cobro_medio in ('efectivo', 'tarjeta'));
  end if;
end $$;
alter table public.reparto_liquidacion add column if not exists tarjeta numeric not null default 0;

do $$
declare v text; n int;
begin
  -- 1) Marcar: guardar el medio (y dejarlo vacío en cualquier otra acción).
  v := pg_get_functiondef('public.fn_app_rep_marcar(uuid,text,integer,text,integer,text,text,text,timestamp with time zone,double precision,double precision)'::regprocedure);
  if position('cobro_medio' in v) = 0 then
    if position($a$  return jsonb_build_object('ok', true);
end$a$ in v) = 0 then raise exception 'fn_app_rep_marcar no tiene el trozo esperado'; end if;
    v := replace(v, $a$  return jsonb_build_object('ok', true);
end$a$, $a$  update reparto_linea
     set cobro_medio = case when p_accion = 'entregado' and p_detalle in ('efectivo', 'tarjeta') then p_detalle end,
         estado_observaciones = case when p_accion = 'entregado' and p_detalle in ('efectivo', 'tarjeta')
                                     then concat_ws(' · ', case p_detalle when 'tarjeta' then 'Cobrado con tarjeta' else 'Cobrado en efectivo' end, v_nota)
                                     else estado_observaciones end
   where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  return jsonb_build_object('ok', true);
end$a$);
    execute v;
  end if;

  -- 2) Listas: añadir «medio» junto a «no_cobro».
  foreach v in array array['public.fn_app_rep_lineas(uuid,text,integer)', 'public.fn_app_rep_todas_lineas(uuid,text,bigint)', 'public.fn_app_rep_por_cobrar(uuid)'] loop
    declare d text := pg_get_functiondef(v::regprocedure);
    begin
      if position($a$'medio', l.cobro_medio$a$ in d) > 0 then continue; end if;
      n := (length(d) - length(replace(d, $a$'no_cobro', l.motivo_no_cobro$a$, ''))) / length($a$'no_cobro', l.motivo_no_cobro$a$);
      if n = 0 then raise exception '% no tiene el trozo esperado', v; end if;
      execute replace(d, $a$'no_cobro', l.motivo_no_cobro$a$, $a$'no_cobro', l.motivo_no_cobro, 'medio', l.cobro_medio$a$);
    end;
  end loop;

  -- 3) Liquidar: el efectivo es lo esperado; la tarjeta, aparte.
  v := pg_get_functiondef('public.fn_app_rep_liquidar(uuid,jsonb,numeric,text)'::regprocedure);
  if position('cobro_medio' in v) = 0 then
    if position($a$v_lin jsonb := '[]'::jsonb;$a$ in v) = 0 or position($a$l.estado, l.motivo_no_cobro,$a$ in v) = 0
       or position($a$v_esp := v_esp + v_imp; v_n := v_n + 1;$a$ in v) = 0
       or position($a$'importe', v_imp);$a$ in v) = 0
       or position($a$set esperado = v_esp, facturas = v_n,$a$ in v) = 0
       or position($a$'esperado', v_esp, 'entregado'$a$ in v) = 0 then
      raise exception 'fn_app_rep_liquidar no tiene los trozos esperados';
    end if;
    v := replace(v, $a$v_lin jsonb := '[]'::jsonb;$a$, $a$v_lin jsonb := '[]'::jsonb; v_tar numeric := 0;$a$);
    v := replace(v, $a$l.estado, l.motivo_no_cobro,$a$, $a$l.estado, l.motivo_no_cobro, l.cobro_medio,$a$);
    v := replace(v, $a$v_esp := v_esp + v_imp; v_n := v_n + 1;$a$,
                    $a$if x.cobro_medio = 'tarjeta' then v_tar := v_tar + v_imp; else v_esp := v_esp + v_imp; end if; v_n := v_n + 1;$a$);
    v := replace(v, $a$'importe', v_imp);$a$, $a$'importe', v_imp, 'medio', coalesce(x.cobro_medio, 'efectivo'));$a$);
    v := replace(v, $a$set esperado = v_esp, facturas = v_n,$a$, $a$set esperado = v_esp, tarjeta = v_tar, facturas = v_n,$a$);
    v := replace(v, $a$'esperado', v_esp, 'entregado'$a$, $a$'esperado', v_esp, 'tarjeta', v_tar, 'entregado'$a$);
    execute v;
  end if;
end $$;
