-- La fecha en que la junta general aprobó las últimas cuentas anuales.
--
-- El artículo 279.1 de la Ley de Sociedades de Capital cuenta el plazo de
-- depósito «dentro del mes siguiente a la aprobación de las cuentas anuales».
-- Sin ese dato el calendario sólo podía ofrecer el límite legal exterior —30 de
-- julio, sumando el mes del 279 al último día en que la junta puede reunirse
-- según el artículo 164—, y un límite no es la fecha de nadie: la sociedad que
-- aprobó en marzo tenía su plazo vencido en abril.
--
-- Se deja nula a propósito. Mientras no conste, el calendario muestra el límite
-- y dice que lo es; en cuanto consta, recalcula la fecha propia y el aviso de
-- los diez, tres y un día antes se emite sobre ella.
alter table business_projects
  add column if not exists accounts_approval_date date;

comment on column business_projects.accounts_approval_date is
  'Fecha de aprobación de las cuentas anuales por la junta general. Fija el vencimiento del depósito en el Registro Mercantil (art. 279.1 LSC).';
