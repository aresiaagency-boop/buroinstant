-- La fecha de inicio de actividad declarada en el modelo 036.
--
-- Sin ella el calendario ofrecía vencimientos de períodos en los que la empresa
-- todavía no existía: A.R.E.S., constituyéndose en septiembre, veía el IVA del
-- tercer trimestre. Un vencimiento falso enseña a ignorar los avisos.
--
-- Se deja nula a propósito: mientras no se declare, el calendario no filtra
-- nada. Esconder una obligación de una empresa que ya venía funcionando sería
-- peor que mostrar una de más.
alter table business_projects
  add column if not exists activity_start_date date;

comment on column business_projects.activity_start_date is
  'Fecha de inicio de actividad declarada en el modelo 036. Filtra el calendario de obligaciones.';
