-- No puede haber dos lotes vigentes de la misma empresa y estructura que se solapen:
-- evita pagar dos veces el mismo período. Los lotes anulados no cuentan.
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_no_overlap" EXCLUDE USING gist (
  "company_id" extensions.gist_uuid_ops WITH =,
  "structure_id" extensions.gist_uuid_ops WITH =,
  daterange("date_from", "date_to", '[]') WITH &&
) WHERE ("state" <> 'cancelled');
