-- App de reparto: entrada «PAGOS», la caja de administración (Rober, 17/11/2026).
--
-- Quien recibe en administración el dinero de los repartidores entra con su propio usuario y PIN, como los
-- demás, y va directo a la Caja: por cada ruta, las facturas de contado que el repartidor dice que cobró y
-- el total que tiene que entregar. No ve las rutas ni las facturas sin cobrar (eso es de la oficina).
--
--  · repartidor_pin.solo_caja: la marca. Quien la tiene sale en la pantalla de entrada y la app le abre
--    solo la Caja.
--  · Ficha de apoyo «PAG» (no es una persona, como «OFI»). Su PIN inicial se pone aparte, fuera de este
--    fichero, con «debe_cambiar»: la primera vez que entra tiene que poner uno suyo.
--  · fn_app_rep_login devuelve «solo_caja». fn_app_rep_repartidores la incluye en la lista.
--  · fn_app_rep_por_cobrar la deja entrar, pero a ella solo le da lo de contado que el repartidor NO marcó
--    como sin cobrar: lo demás no se le envía.
alter table public.repartidor_pin add column if not exists solo_caja boolean not null default false;

insert into public.repartidor (codigo, nombre, nombre_corto) values ('PAG', 'PAGOS (caja de administración)', 'PAGOS')
on conflict (codigo) do nothing;

do $$
declare v text; f regprocedure; par text[]; cambios text[][] := array[
    array['public.fn_app_rep_repartidores()', $a$     and (p.supervisor or p.prueba$a$, $b$     and (p.supervisor or p.solo_caja or p.prueba$b$],
    array['public.fn_app_rep_repartidores()', $a$   order by p.supervisor, p.prueba, 2$a$, $b$   order by (p.supervisor or p.solo_caja), p.prueba, 2$b$],
    array['public.fn_app_rep_login(text, text, text)', $a$'debe_cambiar', p.debe_cambiar);$a$, $b$'debe_cambiar', p.debe_cambiar, 'solo_caja', p.solo_caja);$b$],
    array['public.fn_app_rep_por_cobrar(uuid)',
          $a$declare v_rep text := reparto_privado.sesion(p_token); v_hoy date := fn_app_rep_hoy();$a$,
          $b$declare v_rep text := reparto_privado.sesion(p_token); v_hoy date := fn_app_rep_hoy(); v_sup boolean; v_caja boolean;$b$],
    array['public.fn_app_rep_por_cobrar(uuid)',
          $a$  if not coalesce((select supervisor from repartidor_pin where repartidor_codigo = v_rep), false) then$a$,
          $b$  select coalesce(supervisor, false), coalesce(solo_caja, false) into v_sup, v_caja from repartidor_pin where repartidor_codigo = v_rep;
  if not (coalesce(v_sup, false) or coalesce(v_caja, false)) then$b$],
    array['public.fn_app_rep_por_cobrar(uuid)',
          $a$       and l.estado = 'entregado'
       and coalesce(g.total, v.total)$a$,
          $b$       and l.estado = 'entregado'
       and (coalesce(v_sup, false) or (g.forma_pago = 1 and l.motivo_no_cobro is null))
       and coalesce(g.total, v.total)$b$]];
begin
  foreach par slice 1 in array cambios loop
    f := par[1]::regprocedure;
    v := pg_get_functiondef(f);
    if position(par[3] in v) > 0 then continue; end if;
    if position(par[2] in v) = 0 then raise exception 'no encuentro «%» en %', left(par[2], 60), par[1]; end if;
    execute replace(v, par[2], par[3]);
  end loop;
end $$;
