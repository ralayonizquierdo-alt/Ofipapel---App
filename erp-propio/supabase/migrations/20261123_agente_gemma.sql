-- El agente de GeminisWin del PC de Rober pasa a llamarse «Gemma» (Rober, 23/11/2026; antes «Geminio»). El código
-- interno (geminis_pc) no cambia: la clave y los avisos que prepara el Cowork siguen valiendo.
update public.agente set nombre = 'Gemma',
  intro = '¡Hola! Soy Gemma, la agente que trabaja dentro de GeminisWin desde el PC de Rober. Saco los listados y preparo los pedidos de informática para que nadie tenga que hacerlo a mano.'
 where codigo = 'geminis_pc';
update public.agente_funcion set texto = replace(texto, 'E-milio y Geminio', 'E-milio y Gemma'), actualizado_en = now()
 where agente = 'vigilante' and texto like '%Geminio%';
update public.nexa_memoria set texto = replace(replace(texto, 'GEMINIO', 'GEMMA'), 'Geminio', 'Gemma')
 where ambito = 'global' and activa and (texto like '%GEMINIO%' or texto like '%Geminio%');
do $$
declare d text := pg_get_functiondef('public.fn_virgilio_sistema()'::regprocedure);
begin
  if position('Geminio' in d) > 0 then
    execute replace(d, 'Geminio', 'Gemma');
  end if;
end $$;
