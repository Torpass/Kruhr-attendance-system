-- Un colaborador no puede tener dos turnos que se solapen (tampoco al corregirlos).
-- tstzrange(clock_in, NULL) no tiene fin, así que un turno abierto choca con cualquier turno posterior.
-- btree_gist va en el esquema `extensions` (convención de Supabase); el opclass se nombra completo
-- para no depender del search_path.
CREATE SCHEMA IF NOT EXISTS extensions;--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS btree_gist WITH SCHEMA extensions;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_no_overlap" EXCLUDE USING gist (
  "employee_id" extensions.gist_uuid_ops WITH =,
  tstzrange("clock_in", "clock_out") WITH &&
);
