-- Luis se suma a la tabla de notas de coordinación (28/10/2026).
alter table public.coordinacion_notas drop constraint coordinacion_notas_de_check;
alter table public.coordinacion_notas drop constraint coordinacion_notas_para_check;
alter table public.coordinacion_notas add constraint coordinacion_notas_de_check check (de = any (array['claude-code','cowork','rober','luis']));
alter table public.coordinacion_notas add constraint coordinacion_notas_para_check check (para = any (array['claude-code','cowork','rober','luis','todos']));
