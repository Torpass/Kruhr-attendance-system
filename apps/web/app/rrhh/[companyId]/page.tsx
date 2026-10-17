"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, Stat } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import { formatMoney, RUN_STATE } from "@/lib/money";
import { formatDay, formatHoursValue, todayInCaracas } from "@/lib/time";
import type { CompanyToday, Employee, PayrollRun, PeriodSummary } from "@/lib/types";

/** Bloque de KPIs con enlace a la pantalla donde se gestiona. */
function Section({ title, href, action, children }: { title: string; href: string; action: string; children: ReactNode }) {
  return (
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-semibold">{title}</h2>
        <Link href={href} className="text-sm font-semibold text-kru-700 hover:text-kru-800">
          {action} →
        </Link>
      </div>
      <div className="mt-4">{children}</div>
    </Card>
  );
}

const pending = <p className="text-sm text-gris">Cargando…</p>;

/** Panel de la empresa: solo indicadores. Las gestiones viven en cada sección de la barra lateral. */
export default function DashboardPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const company = useCurrentCompany(companyId);
  const base = `/rrhh/${companyId}`;
  const week = new URLSearchParams({ kind: "week", date: todayInCaracas() }).toString();

  const today = useQuery({
    queryKey: ["companies", companyId, "today"],
    queryFn: () => api<CompanyToday>(`/companies/${companyId}/today`),
    refetchInterval: 60_000,
  });
  const period = useQuery({
    queryKey: ["companies", companyId, "periods", week],
    queryFn: () => api<PeriodSummary>(`/companies/${companyId}/periods?${week}`),
  });
  const runs = useQuery({
    queryKey: ["companies", companyId, "payroll-runs"],
    queryFn: () => api<{ runs: PayrollRun[] }>(`/companies/${companyId}/payroll-runs`).then((r) => r.runs),
  });
  const employees = useQuery({
    queryKey: ["companies", companyId, "employees"],
    queryFn: () => api<{ employees: Employee[] }>(`/companies/${companyId}/employees`).then((r) => r.employees),
  });

  const error = [today, period, runs, employees].find((q) => q.isError)?.error;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.025em]">Panel</h1>
        <p className="mt-1 text-sm text-gris first-letter:uppercase">
          {company?.name ?? "Empresa"}
          {today.data && ` · ${formatDay(today.data.date)}`}
        </p>
      </div>

      {error && <EmptyState>{errorMessage(error)}</EmptyState>}

      <Section title="Asistencia de hoy" href={`${base}/hoy`} action="Ver asistencia">
        {!today.data ? pending : <TodayKpis data={today.data} />}
      </Section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Section title="Semana en curso" href={`${base}/periodos`} action="Ver períodos">
          {!period.data ? pending : <WeekKpis data={period.data} />}
        </Section>

        <Section title="Nómina" href={`${base}/nomina`} action="Ver lotes">
          {!runs.data ? pending : <PayrollKpis runs={runs.data} href={`${base}/nomina`} />}
        </Section>
      </div>

      <Section title="Personas" href={`${base}/colaboradores`} action="Ver colaboradores">
        {!employees.data ? pending : <PeopleKpis employees={employees.data} />}
      </Section>
    </div>
  );
}

function TodayKpis({ data }: { data: CompanyToday }) {
  const { counts } = data;
  const marked = counts.active - counts.notClockedIn;
  const rate = counts.active ? Math.round((marked / counts.active) * 100) : 0;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Dentro ahora" value={counts.inside} tone="marca" />
        <Stat label="Ya marcaron" value={marked} hint={`de ${counts.active} activos`} />
        <Stat label="No han marcado" value={counts.notClockedIn} />
        <Stat
          label="Sin salida"
          value={counts.missingClockOut}
          tone={counts.missingClockOut > 0 ? "alerta" : "neutral"}
          hint={counts.missingClockOut > 0 ? "Turnos por corregir" : "Todo en orden"}
        />
      </div>
      <div className="mt-4">
        <div className="flex justify-between text-[13px] text-gris">
          <span>Asistencia del día</span>
          <span className="font-semibold text-grafito tabular-nums">{rate}%</span>
        </div>
        <div
          role="progressbar"
          aria-label="Asistencia del día"
          aria-valuenow={rate}
          aria-valuemin={0}
          aria-valuemax={100}
          className="mt-1.5 h-2 overflow-hidden rounded-full bg-hueso"
        >
          <div className="h-full rounded-full bg-kru-600 transition-[width]" style={{ width: `${rate}%` }} />
        </div>
      </div>
    </>
  );
}

function WeekKpis({ data }: { data: PeriodSummary }) {
  const sum = (pick: (row: PeriodSummary["rows"][number]) => number) => data.rows.reduce((t, r) => t + pick(r), 0);
  const worked = sum((r) => r.hours.worked);
  const overtime = sum((r) => r.hours.overtimeDay + r.hours.overtimeNight);
  const night = sum((r) => r.hours.nightOrdinary);
  return (
    <>
      <p className="mb-3 text-[13px] text-gris first-letter:uppercase">
        {formatDay(data.period.from)} → {formatDay(data.period.to)}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Stat label="Horas trabajadas" value={formatHoursValue(worked)} tone="marca" />
        <Stat label="Horas extra" value={formatHoursValue(overtime)} />
        <Stat label="Horas nocturnas" value={formatHoursValue(night)} />
        <Stat
          label="Alertas de extra"
          value={data.alerts}
          tone={data.alerts > 0 ? "alerta" : "neutral"}
          hint={data.openShifts > 0 ? `${data.openShifts} turno(s) abierto(s)` : "Sin turnos abiertos"}
        />
      </div>
    </>
  );
}

function PayrollKpis({ runs, href }: { runs: PayrollRun[]; href: string }) {
  const last = runs.find((r) => r.state !== "cancelled");
  const toPay = runs.filter((r) => r.state === "computed" || r.state === "validated");
  const paidNet = runs.filter((r) => r.state === "paid").reduce((t, r) => t + (r.net ?? 0), 0);

  if (runs.length === 0) return <EmptyState>Todavía no hay lotes de nómina.</EmptyState>;
  return (
    <div className="flex flex-col gap-3">
      {last && (
        <Link
          href={`${href}/${last.id}`}
          className="flex items-center gap-3 rounded-xl border border-borde px-3.5 py-3 transition-colors hover:border-kru-300"
        >
          <span className="min-w-0 flex-1">
            <span className="rotulo block text-gris">Último lote</span>
            <span className="block truncate text-sm font-semibold">{last.name}</span>
            <span className="block text-[13px] font-semibold tabular-nums">Bs. {formatMoney(last.net ?? 0)}</span>
          </span>
          <Badge tone={RUN_STATE[last.state].tone}>{RUN_STATE[last.state].label}</Badge>
        </Link>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Stat
          label="Por pagar"
          value={toPay.length}
          tone={toPay.length > 0 ? "alerta" : "neutral"}
          hint="Lotes calculados o validados"
        />
        <Stat label="Total pagado" value={<span className="text-xl">Bs. {formatMoney(paidNet)}</span>} />
      </div>
    </div>
  );
}

function PeopleKpis({ employees }: { employees: Employee[] }) {
  const active = employees.filter((e) => e.active).length;
  const month = todayInCaracas().slice(0, 7);
  const newThisMonth = employees.filter((e) => (e.hiredOn ?? e.createdAt).slice(0, 7) === month).length;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat label="Colaboradores" value={employees.length} />
      <Stat label="Activos" value={active} tone="marca" />
      <Stat label="Inactivos" value={employees.length - active} />
      <Stat label="Altas del mes" value={newThisMonth} />
    </div>
  );
}
