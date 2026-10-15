CREATE TYPE "public"."staff_role" AS ENUM('superadmin', 'admin', 'analyst');--> statement-breakpoint
CREATE TABLE "companies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"rif" text,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "companies_slug_unique" UNIQUE("slug"),
	CONSTRAINT "companies_id_group_id_key" UNIQUE("id","group_id"),
	CONSTRAINT "companies_slug_format" CHECK ("companies"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "company_groups" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"currency_code" char(3) DEFAULT 'VES' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "company_groups_slug_unique" UNIQUE("slug"),
	CONSTRAINT "company_groups_slug_format" CHECK ("company_groups"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
CREATE TABLE "employees" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"cedula" text NOT NULL,
	"name" text NOT NULL,
	"pin_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"hired_on" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "employees_company_id_cedula_key" UNIQUE("company_id","cedula"),
	CONSTRAINT "employees_id_company_id_key" UNIQUE("id","company_id"),
	CONSTRAINT "employees_cedula_digits" CHECK ("employees"."cedula" ~ '^[0-9]{5,10}$')
);
--> statement-breakpoint
CREATE TABLE "shift_corrections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"shift_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"corrected_by" uuid NOT NULL,
	"reason" text NOT NULL,
	"before" jsonb,
	"after" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shift_corrections_reason_required" CHECK (length(trim("shift_corrections"."reason")) >= 5)
);
--> statement-breakpoint
CREATE TABLE "shifts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"clock_in" timestamp with time zone NOT NULL,
	"clock_out" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "shifts_id_company_id_key" UNIQUE("id","company_id"),
	CONSTRAINT "shifts_clock_out_after_clock_in" CHECK ("shifts"."clock_out" is null or "shifts"."clock_out" > "shifts"."clock_in")
);
--> statement-breakpoint
CREATE TABLE "user_companies" (
	"user_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"group_id" uuid NOT NULL,
	CONSTRAINT "user_companies_user_id_company_id_pk" PRIMARY KEY("user_id","company_id")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"role" "staff_role" NOT NULL,
	"group_id" uuid,
	"name" text NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email"),
	CONSTRAINT "users_id_group_id_key" UNIQUE("id","group_id"),
	CONSTRAINT "users_superadmin_without_group" CHECK (("users"."role" = 'superadmin') = ("users"."group_id" is null)),
	CONSTRAINT "users_email_lowercase" CHECK ("users"."email" = lower("users"."email"))
);
--> statement-breakpoint
ALTER TABLE "companies" ADD CONSTRAINT "companies_group_id_company_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."company_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_corrections" ADD CONSTRAINT "shift_corrections_corrected_by_users_id_fk" FOREIGN KEY ("corrected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shift_corrections" ADD CONSTRAINT "shift_corrections_shift_fk" FOREIGN KEY ("shift_id","company_id") REFERENCES "public"."shifts"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shifts" ADD CONSTRAINT "shifts_employee_fk" FOREIGN KEY ("employee_id","company_id") REFERENCES "public"."employees"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_user_fk" FOREIGN KEY ("user_id","group_id") REFERENCES "public"."users"("id","group_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_companies" ADD CONSTRAINT "user_companies_company_fk" FOREIGN KEY ("company_id","group_id") REFERENCES "public"."companies"("id","group_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "users" ADD CONSTRAINT "users_group_id_company_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."company_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "companies_group_id_idx" ON "companies" USING btree ("group_id");--> statement-breakpoint
CREATE INDEX "shift_corrections_shift_id_idx" ON "shift_corrections" USING btree ("shift_id");--> statement-breakpoint
CREATE UNIQUE INDEX "shifts_one_open_per_employee" ON "shifts" USING btree ("employee_id") WHERE "shifts"."clock_out" is null;--> statement-breakpoint
CREATE INDEX "shifts_company_id_clock_in_idx" ON "shifts" USING btree ("company_id","clock_in");--> statement-breakpoint
CREATE INDEX "shifts_employee_id_clock_in_idx" ON "shifts" USING btree ("employee_id","clock_in");--> statement-breakpoint
CREATE INDEX "user_companies_company_id_idx" ON "user_companies" USING btree ("company_id");--> statement-breakpoint
CREATE INDEX "users_group_id_idx" ON "users" USING btree ("group_id");