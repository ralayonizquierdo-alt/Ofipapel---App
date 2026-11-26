-- Nuevo motivo de «entregado sin cobrar»: 'abono' = se descuenta de un abono a favor del cliente
-- (Rober, 26/11/2026: Librería Calita iba acumulando facturas contra un abono de -103,55 €).
alter table public.reparto_linea drop constraint reparto_linea_motivo_no_cobro_check;
alter table public.reparto_linea add constraint reparto_linea_motivo_no_cobro_check
  check (motivo_no_cobro is null or motivo_no_cobro = any (array['paga_banco', 'sin_dinero', 'no_responsable', 'importe', 'ya_pagado', 'abono', 'otro']));

do $$
declare v_def text := pg_get_functiondef('public.fn_app_rep_marcar'::regproc);
begin
  if position('''abono''' in v_def) > 0 then return; end if;
  if position('''ya_pagado'', ''otro'')' in v_def) = 0 or position('when ''ya_pagado'' then ''dice que ya la pagó''' in v_def) = 0 then
    raise exception 'fn_app_rep_marcar: no encuentro la lista de motivos';
  end if;
  v_def := replace(v_def, '''ya_pagado'', ''otro'')', '''ya_pagado'', ''abono'', ''otro'')');
  v_def := replace(v_def, 'when ''ya_pagado'' then ''dice que ya la pagó''',
                   'when ''ya_pagado'' then ''dice que ya la pagó'' when ''abono'' then ''se descuenta de un abono a su favor''');
  execute v_def;
end $$;
