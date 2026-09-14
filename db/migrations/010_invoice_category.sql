-- Categoría de documento para la factura.
--
-- El propósito declarado de BUROINSTANT es que la empresa quede creada y
-- facture, pero no había dónde guardar la factura ni con qué acreditar ese
-- último paso. Sin categoría propia, la primera factura acababa en «Otros»,
-- que es donde se pierden las cosas.
alter table documents
  drop constraint if exists documents_category_check;

alter table documents
  add constraint documents_category_check
  check (category in (
    'IDENTITY','COMPANY_NAME','BYLAWS','NOTARY','TAX','REGISTRY',
    'SOCIAL_SECURITY','LICENSE','BANK','CONTRACT','INVOICE','OTHER'
  ));
