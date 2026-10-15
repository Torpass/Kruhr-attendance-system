-- Un colaborador tiene un solo contrato vigente a la vez. daterange(…, NULL) no tiene fin.
-- btree_gist ya está en `extensions` (migración 0001).
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_no_overlap" EXCLUDE USING gist (
  "employee_id" extensions.gist_uuid_ops WITH =,
  daterange("date_start", "date_end", '[]') WITH &&
);
