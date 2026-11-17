-- Reparto: «entregado pero sin cobrar», con su motivo (Rober y David, 17/11/2026).
--
-- Hasta ahora la app solo recogía motivo cuando el pedido NO se entregaba. Faltaba el caso de la factura
-- de contado que se entrega y no se cobra: administración necesita saber por qué. Lo pone el repartidor:
-- al pulsar «Entregado» en una factura que había que cobrar, la app pregunta si cobró y, si no, el motivo.
--
--  · reparto_linea.motivo_no_cobro: paga_banco, sin_dinero, no_responsable, importe, ya_pagado u otro
--    (con «otro», la explicación va en nota_repartidor, como en los demás motivos).
--  · fn_app_rep_marcar: acción nueva «entregado_sin_cobrar» (misma firma: p_detalle lleva el motivo).
--    La línea queda «entregado»: SALE DEL REPARTO (no pasa al siguiente) y la cobra administración.
--    Cualquier otra acción sobre la línea borra el motivo.
--  · fn_app_rep_lineas, fn_app_rep_todas_lineas y fn_reparto_gw_partes devuelven «no_cobro».
--    En el parte de cierre la línea sigue saliendo como ENTREGADO (estado 4 de GeminisWin).

alter table public.reparto_linea add column if not exists motivo_no_cobro text;
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'reparto_linea_motivo_no_cobro_check') then
    alter table public.reparto_linea add constraint reparto_linea_motivo_no_cobro_check
      check (motivo_no_cobro is null or motivo_no_cobro in ('paga_banco', 'sin_dinero', 'no_responsable', 'importe', 'ya_pagado', 'otro'));
  end if;
end $$;

do $$
declare v text; f regprocedure; par text[]; cambios text[][] := array[
    -- Las acciones que ya había borran el motivo de no cobro.
    array['public.fn_app_rep_marcar(uuid, text, integer, text, integer, text, text, text, timestamptz, double precision, double precision)',
          $a$set estado = 'entregado', incidencia = null, motivo_no_entrega = null, nota_repartidor = v_nota,$a$,
          $b$set estado = 'entregado', incidencia = null, motivo_no_entrega = null, motivo_no_cobro = null, nota_repartidor = v_nota,$b$],
    array['public.fn_app_rep_marcar(uuid, text, integer, text, integer, text, text, text, timestamptz, double precision, double precision)',
          $a$set estado = 'entregado', incidencia = p_detalle, motivo_no_entrega = null, nota_repartidor = v_nota,$a$,
          $b$set estado = 'entregado', incidencia = p_detalle, motivo_no_entrega = null, motivo_no_cobro = null, nota_repartidor = v_nota,$b$],
    array['public.fn_app_rep_marcar(uuid, text, integer, text, integer, text, text, text, timestamptz, double precision, double precision)',
          $a$set estado = 'no_entregado', incidencia = null, motivo_no_entrega = p_detalle, nota_repartidor = v_nota,$a$,
          $b$set estado = 'no_entregado', incidencia = null, motivo_no_entrega = p_detalle, motivo_no_cobro = null, nota_repartidor = v_nota,$b$],
    array['public.fn_app_rep_marcar(uuid, text, integer, text, integer, text, text, text, timestamptz, double precision, double precision)',
          $a$incidencia = null, motivo_no_entrega = null, nota_repartidor = null, entregado_en = null,$a$,
          $b$incidencia = null, motivo_no_entrega = null, motivo_no_cobro = null, nota_repartidor = null, entregado_en = null,$b$],
    -- La acción nueva, delante de «incidencia».
    array['public.fn_app_rep_marcar(uuid, text, integer, text, integer, text, text, text, timestamptz, double precision, double precision)',
          $a$  elsif p_accion = 'incidencia' then$a$,
          $b$  elsif p_accion = 'entregado_sin_cobrar' then
    if p_detalle is null or p_detalle not in ('paga_banco', 'sin_dinero', 'no_responsable', 'importe', 'ya_pagado', 'otro') then raise exception 'Elige por qué no se cobró.'; end if;
    if p_detalle = 'otro' and v_nota is null then raise exception 'Explica por qué no se cobró.'; end if;
    v_obs := 'Entregado sin cobrar: ' || case p_detalle when 'paga_banco' then 'dice que paga por transferencia' when 'sin_dinero' then 'no tenía el dinero'
                                                        when 'no_responsable' then 'no estaba quien paga' when 'importe' then 'no está de acuerdo con el importe'
                                                        when 'ya_pagado' then 'dice que ya la pagó' else 'otro' end || coalesce(' · ' || v_nota, '');
    update reparto_linea set estado = 'entregado', incidencia = null, motivo_no_entrega = null, motivo_no_cobro = p_detalle, nota_repartidor = v_nota,
           entregado_en = t, estado_observaciones = v_obs, marcado_lat = p_lat, marcado_lng = p_lng
     where tienda_terminal_codigo = p_tienda and numero = p_numero and venta_tienda_codigo = p_vt and venta_numero = p_vn;
  elsif p_accion = 'incidencia' then$b$],
    array['public.fn_app_rep_lineas(uuid, text, integer)',
          $a$'incidencia', l.incidencia, 'motivo', l.motivo_no_entrega, 'nota', l.nota_repartidor,$a$,
          $b$'incidencia', l.incidencia, 'motivo', l.motivo_no_entrega, 'no_cobro', l.motivo_no_cobro, 'nota', l.nota_repartidor,$b$],
    array['public.fn_app_rep_todas_lineas(uuid, text, bigint)',
          $a$'incidencia', l.incidencia, 'motivo', l.motivo_no_entrega, 'nota', l.nota_repartidor,$a$,
          $b$'incidencia', l.incidencia, 'motivo', l.motivo_no_entrega, 'no_cobro', l.motivo_no_cobro, 'nota', l.nota_repartidor,$b$],
    array['public.fn_reparto_gw_partes()',
          $a$'motivo', l.motivo_no_entrega, 'incidencia', l.incidencia, 'nota', l.nota_repartidor,$a$,
          $b$'motivo', l.motivo_no_entrega, 'incidencia', l.incidencia, 'no_cobro', l.motivo_no_cobro, 'nota', l.nota_repartidor,$b$]];
begin
  foreach par slice 1 in array cambios loop
    f := par[1]::regprocedure;
    v := pg_get_functiondef(f);
    if position(par[3] in v) > 0 then continue; end if;
    if position(par[2] in v) = 0 then raise exception 'no encuentro «%» en %', left(par[2], 60), par[1]; end if;
    execute replace(v, par[2], par[3]);
  end loop;
end $$;
