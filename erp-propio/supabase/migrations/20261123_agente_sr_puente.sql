-- El agente del PC de Mónica pasa a llamarse «Sr. Puente» (Rober, 23/11/2026; antes «Espejito»).
update public.agente set nombre = 'Sr. Puente',
  intro = '¡Hola! Soy el Sr. Puente, el agente del PC de Mónica. Hago de puente entre GeminisWin, el ERP y la app de los repartidores: copio GeminisWin al ERP sin parar y llevo los repartos a la app, para que todo esté siempre al día.'
 where codigo = 'pc_monica';
