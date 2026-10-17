CREATE TYPE "public"."overtime_mode" AS ENUM('duration', 'schedule');--> statement-breakpoint
CREATE TABLE "work_schedules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"group_id" uuid NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"overtime_mode" "overtime_mode" DEFAULT 'duration' NOT NULL,
	"ordinary_minutes" integer DEFAULT 480 NOT NULL,
	"days" jsonb,
	"break_minutes" integer DEFAULT 0 NOT NULL,
	"break_after_minutes" integer DEFAULT 300 NOT NULL,
	"night_start" text DEFAULT '19:00' NOT NULL,
	"night_end" text DEFAULT '05:00' NOT NULL,
	"weekly_overtime_alert_minutes" integer DEFAULT 600 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "work_schedules_group_id_code_key" UNIQUE("group_id","code"),
	CONSTRAINT "work_schedules_code_format" CHECK ("work_schedules"."code" ~ '^[A-Z][A-Z0-9_]{0,29}$'),
	CONSTRAINT "work_schedules_minutes" CHECK ("work_schedules"."ordinary_minutes" between 1 and 1440 and "work_schedules"."break_minutes" between 0 and 1440 and "work_schedules"."break_after_minutes" between 0 and 1440 and "work_schedules"."weekly_overtime_alert_minutes" between 0 and 10080),
	CONSTRAINT "work_schedules_night" CHECK ("work_schedules"."night_start" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "work_schedules"."night_end" ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$' and "work_schedules"."night_start" <> "work_schedules"."night_end")
);
--> statement-breakpoint
ALTER TABLE "contracts" ADD COLUMN "schedule_id" uuid;--> statement-breakpoint
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_group_id_company_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."company_groups"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_schedule_id_work_schedules_id_fk" FOREIGN KEY ("schedule_id") REFERENCES "public"."work_schedules"("id") ON DELETE no action ON UPDATE no action;