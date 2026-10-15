CREATE TYPE "public"."amount_type" AS ENUM('fixed', 'monthly_wage', 'weekly_wage', 'daily_wage', 'hourly_wage', 'percentage_of');--> statement-breakpoint
CREATE TYPE "public"."payroll_run_state" AS ENUM('computed', 'validated', 'paid', 'cancelled');--> statement-breakpoint
CREATE TYPE "public"."quantity_source" AS ENUM('one', 'worked_hours', 'input', 'period_days', 'mondays');--> statement-breakpoint
CREATE TYPE "public"."rule_condition" AS ENUM('always', 'nonzero_quantity');--> statement-breakpoint
CREATE TYPE "public"."schedule_pay" AS ENUM('weekly', 'semi_monthly', 'monthly');--> statement-breakpoint
CREATE TABLE "contracts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"structure_id" uuid NOT NULL,
	"wage" numeric(14, 2) NOT NULL,
	"date_start" date NOT NULL,
	"date_end" date,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "contracts_wage_positive" CHECK ("contracts"."wage" > 0),
	CONSTRAINT "contracts_dates" CHECK ("contracts"."date_end" is null or "contracts"."date_end" >= "contracts"."date_start")
);
--> statement-breakpoint
CREATE TABLE "input_types" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "input_types_group_id_code_key" UNIQUE("group_id","code"),
	CONSTRAINT "input_types_code_format" CHECK ("input_types"."code" ~ '^[A-Z][A-Z0-9_]{0,29}$')
);
--> statement-breakpoint
CREATE TABLE "payroll_parameter_values" (
	"parameter_id" uuid NOT NULL,
	"date_from" date NOT NULL,
	"value" numeric(14, 2) NOT NULL,
	CONSTRAINT "payroll_parameter_values_parameter_id_date_from_pk" PRIMARY KEY("parameter_id","date_from")
);
--> statement-breakpoint
CREATE TABLE "payroll_parameters" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_parameters_group_id_code_key" UNIQUE("group_id","code"),
	CONSTRAINT "payroll_parameters_code_format" CHECK ("payroll_parameters"."code" ~ '^[A-Z][A-Z0-9_]{0,29}$')
);
--> statement-breakpoint
CREATE TABLE "payroll_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"company_id" uuid NOT NULL,
	"structure_id" uuid NOT NULL,
	"name" text NOT NULL,
	"date_from" date NOT NULL,
	"date_to" date NOT NULL,
	"state" "payroll_run_state" DEFAULT 'computed' NOT NULL,
	"created_by" uuid NOT NULL,
	"computed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payroll_runs_id_company_id_key" UNIQUE("id","company_id"),
	CONSTRAINT "payroll_runs_dates" CHECK ("payroll_runs"."date_to" >= "payroll_runs"."date_from")
);
--> statement-breakpoint
CREATE TABLE "payslip_inputs" (
	"payslip_id" uuid NOT NULL,
	"code" text NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	CONSTRAINT "payslip_inputs_payslip_id_code_pk" PRIMARY KEY("payslip_id","code")
);
--> statement-breakpoint
CREATE TABLE "payslip_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payslip_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sequence" integer NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"amount" numeric(14, 4) NOT NULL,
	"rate" numeric(9, 4) NOT NULL,
	"total" numeric(14, 2) NOT NULL,
	"appears_on_payslip" boolean NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payslip_worked_hours" (
	"payslip_id" uuid NOT NULL,
	"code" text NOT NULL,
	"minutes" integer NOT NULL,
	CONSTRAINT "payslip_worked_hours_payslip_id_code_pk" PRIMARY KEY("payslip_id","code")
);
--> statement-breakpoint
CREATE TABLE "payslips" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"run_id" uuid NOT NULL,
	"company_id" uuid NOT NULL,
	"employee_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"wage" numeric(14, 2) NOT NULL,
	"earnings" numeric(14, 2) NOT NULL,
	"deductions" numeric(14, 2) NOT NULL,
	"net" numeric(14, 2) NOT NULL,
	CONSTRAINT "payslips_run_id_employee_id_key" UNIQUE("run_id","employee_id")
);
--> statement-breakpoint
CREATE TABLE "salary_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"structure_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"sequence" integer NOT NULL,
	"appears_on_payslip" boolean DEFAULT true NOT NULL,
	"condition" "rule_condition" DEFAULT 'always' NOT NULL,
	"quantity_source" "quantity_source" DEFAULT 'one' NOT NULL,
	"quantity_code" text,
	"amount_type" "amount_type" NOT NULL,
	"amount_fix" numeric(14, 4),
	"base_codes" text[],
	"amount_cap_param" text,
	"rate" numeric(9, 4) DEFAULT 100 NOT NULL,
	CONSTRAINT "salary_rules_structure_id_code_key" UNIQUE("structure_id","code"),
	CONSTRAINT "salary_rules_structure_id_sequence_key" UNIQUE("structure_id","sequence"),
	CONSTRAINT "salary_rules_code_format" CHECK ("salary_rules"."code" ~ '^[A-Z][A-Z0-9_]{0,29}$')
);
--> statement-breakpoint
CREATE TABLE "salary_structures" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"schedule_pay" "schedule_pay" NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "salary_structures_group_id_code_key" UNIQUE("group_id","code"),
	CONSTRAINT "salary_structures_id_group_id_key" UNIQUE("id","group_id"),
	CONSTRAINT "salary_structures_code_format" CHECK ("salary_structures"."code" ~ '^[A-Z][A-Z0-9_]{0,29}$')
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_structure_id_salary_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."salary_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_employee_fk" FOREIGN KEY ("employee_id","company_id") REFERENCES "public"."employees"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "input_types" ADD CONSTRAINT "input_types_group_id_company_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."company_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_parameter_values" ADD CONSTRAINT "payroll_parameter_values_parameter_id_payroll_parameters_id_fk" FOREIGN KEY ("parameter_id") REFERENCES "public"."payroll_parameters"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_parameters" ADD CONSTRAINT "payroll_parameters_group_id_company_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."company_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_companies_id_fk" FOREIGN KEY ("company_id") REFERENCES "public"."companies"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_structure_id_salary_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."salary_structures"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_inputs" ADD CONSTRAINT "payslip_inputs_payslip_id_payslips_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_lines" ADD CONSTRAINT "payslip_lines_payslip_id_payslips_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslip_worked_hours" ADD CONSTRAINT "payslip_worked_hours_payslip_id_payslips_id_fk" FOREIGN KEY ("payslip_id") REFERENCES "public"."payslips"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_contract_id_contracts_id_fk" FOREIGN KEY ("contract_id") REFERENCES "public"."contracts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_run_fk" FOREIGN KEY ("run_id","company_id") REFERENCES "public"."payroll_runs"("id","company_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payslips" ADD CONSTRAINT "payslips_employee_fk" FOREIGN KEY ("employee_id","company_id") REFERENCES "public"."employees"("id","company_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_rules" ADD CONSTRAINT "salary_rules_structure_id_salary_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."salary_structures"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "salary_structures" ADD CONSTRAINT "salary_structures_group_id_company_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."company_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contracts_employee_id_idx" ON "contracts" USING btree ("employee_id");--> statement-breakpoint
CREATE INDEX "payroll_runs_company_id_date_from_idx" ON "payroll_runs" USING btree ("company_id","date_from");--> statement-breakpoint
CREATE INDEX "payslip_lines_payslip_id_idx" ON "payslip_lines" USING btree ("payslip_id");--> statement-breakpoint
CREATE INDEX "payslips_employee_id_idx" ON "payslips" USING btree ("employee_id");