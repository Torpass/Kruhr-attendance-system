"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, Stat } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { api, errorMessage } from "@/lib/api";
import { RUN_STATE } from "@/lib/money";
import { addDays, formatDay, formatHoursValue, todayInCaracas } from "@/lib/time";
import type { PayrollRun, PeriodRow, PeriodSummary } from "@/lib/types";

type Kind = "week" | "half" | "range";

const KINDS: { value: Kind; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "half", label: "Quincena" },
  { value: "range", label: "Rango" },
];

const fieldClass = "rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-sm";

const shortDay = new Intl.DateTimeFormat("es-VE", { timeZone: "UTC", day: "numeric", month: "short" });
const monthName = new Intl.DateTimeFormat("es-VE", { timeZone: "UTC", month: "long", year: "numeric" });
const asDate = (localDate: string) => new Date(`${localDate}T00:00:00Z`);

/** La quincena la decide el día: del 1 al 15 es la primera. */
const halfOf = (date: string) => (Number(date.slice(8)) <= 15 ? "first_half" : "second_half");

function periodTitle(kind: Kind, from: string, to: string) {
  const range = `${shortDay.format(asDate(from))} – ${shortDay.format(asDate(to))} ${from.slice(0, 4)}`;
  if (kind === "half") {
    const half = halfOf(from) === "first_half" ? "1.ª" : "2.ª";
    return { title: `${half} quincena de ${monthName.format(asDate(from))}`, range };
  }
  return { title: kind === "week" ? `Semana del ${range}` : range, range: null };
}

const hasHours = (row: PeriodRow) => row.minutes.worked > 0;

export default function PeriodosPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const today = todayInCaracas();
  const [kind, setKind] = useState<Kind>("week");
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);

  const apiKind = kind === "half" ? halfOf(date) : kind;
  const params = new URLSearchParams(kind === "range" ? { from, to } : { kind: apiKind, date }).toString();
  const summary = useQuery({
    queryKey: ["companies", companyId, "periods", params],
    queryFn: () => api<PeriodSummary>(`/companies/${companyId}/periods?${params}`),
  });
  const runs = useQuery({
    queryKey: ["companies", companyId, "payroll-runs"],
    queryFn: () => api<{ runs: PayrollRun[] }>(`/companies/${companyId}/payroll-runs`).then((r) => r.runs),
    enabled: kind !== "range",
  });

  const data = summary.data;
  const period = data?.period;

  /** Período anterior o siguiente: el día justo antes del inicio o después del fin. */
  function step(direction: -1 | 1) {
    if (!period) return;
    setDate(direction < 0 ? addDays(period.from, -1) : addDays(period.to, 1));
  }

  const heading = period && periodTitle(kind, period.from, period.to);
  const isCurrent = period && today >= period.from && today <= period.to;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.025em]">Períodos</h1>
          <p className="mt-1 text-sm text-gris">Horas de cada colaborador en el período, clasificadas para la nómina.</p>
        </div>
        <a
          href={`/api/companies/${companyId}/periods/export.csv?${params}`}
          download
          aria-disabled={!data}
          className={`inline-flex items-center rounded-lg border border-borde-fuerte bg-white px-4 py-2.5 text-sm font-semibold hover:border-kru-300 hover:text-kru-700 ${
            data ? "" : "pointer-events-none opacity-50"
          }`}
        >
          Exportar CSV
        </a>
      </div>

      <Card className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div role="radiogroup" aria-label="Tipo de período" className="grid grid-cols-3 gap-1 rounded-lg bg-hueso p-1">
            {KINDS.map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-semibold transition-colors has-focus-visible:ring-2 has-focus-visible:ring-kru-300 ${
                  kind === option.value ? "bg-white text-grafito shadow-kru" : "text-gris hover:text-grafito"
                }`}
              >
                <input
                  type="radio"
                  name="kind"
                  value={option.value}
                  checked={kind === option.value}
                  onChange={() => {
                    setKind(option.value);
                    if (option.value === "range" && period) {
                      setFrom(period.from);
                      setTo(period.to);
                    }
                  }}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
          {kind === "range" ? (
            <div className="flex flex-wrap items-center gap-2">
              <label className="sr-only" htmlFor="from">Desde</label>
              <input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
              <span className="text-gris">→</span>
              <label className="sr-only" htmlFor="to">Hasta</label>
              <input id="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
            </div>
          ) : (
            <label className="flex items-center gap-2 text-[13px] text-gris">
              Ir a una fecha
              <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={fieldClass} />
            </label>
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-borde pt-4">
          {kind !== "range" && (
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={!period}
              aria-label="Período anterior"
              className="grid h-9 w-9 place-items-center rounded-lg border border-borde-fuerte text-gris hover:border-kru-300 hover:text-kru-700"
            >
              <Icon name="chevron" className="h-4 w-4 rotate-180" />
            </button>
          )}
          <div className="min-w-0 flex-1 px-1">
            <p className="text-base font-bold tracking-[-0.02em] first-letter:uppercase sm:text-lg">{heading?.title ?? "…"}</p>
            {heading?.range && <p className="text-[13px] text-gris">{heading.range}</p>}
          </div>
          {kind !== "range" && (
            <>
              {!isCurrent && (
                <button
                  type="button"
                  onClick={() => setDate(today)}
                  className="rounded-lg px-3 py-2 text-sm font-semibold text-kru-700 hover:bg-kru-50"
                >
                  Hoy
                </button>
              )}
              <button
                type="button"
                onClick={() => step(1)}
                disabled={!period}
                aria-label="Período siguiente"
                className="grid h-9 w-9 place-items-center rounded-lg border border-borde-fuerte text-gris hover:border-kru-300 hover:text-kru-700"
              >
                <Icon name="chevron" className="h-4 w-4" />
              </button>
            </>
          )}
        </div>
      </Card>

      {summary.isError ? (
        <EmptyState>{errorMessage(summary.error)}</EmptyState>
      ) : !data ? (
        <p className="text-sm text-gris">Calculando…</p>
      ) : (
        <PeriodBody
          companyId={companyId}
          data={data}
          payroll={kind === "range" ? null : { runs: runs.data, kind: apiKind, date }}
        />
      )}
    </div>
  );
}

function PeriodBody({
  companyId,
  data,
  payroll,
}: {
  companyId: string;
  data: PeriodSummary;
  payroll: { runs: PayrollRun[] | undefined; kind: string; date: string } | null;
}) {
  const employeeHref = (id: string) => `/rrhh/${companyId}/colaboradores/${id}`;
  const sum = (pick: (row: PeriodRow) => number) => data.rows.reduce((t, r) => t + pick(r), 0);
  const withHours = data.rows.filter(hasHours);
  const rows = [...withHours, ...data.rows.filter((r) => !hasHours(r))];

  // Columnas que en este período tienen algo: una columna llena de ceros no dice nada.
  const columns = [
    { key: "overtimeDay", label: "Extra diurna" },
    { key: "overtimeNight", label: "Extra nocturna" },
    { key: "nightOrdinary", label: "Nocturna ord." },
  ].filter(({ key }) => data.rows.some((r) => r.hours[key as keyof PeriodRow["hours"]] > 0)) as {
    key: keyof PeriodRow["hours"];
    label: string;
  }[];

  const pending = data.rows.flatMap((row) => [
    ...(row.openShifts > 0
      ? [{ key: `${row.employee.id}-open`, row, tone: "error" as const, text: `${row.openShifts} turno(s) sin salida`, action: "Corregir" }]
      : []),
    ...row.weeks
      .filter((week) => week.alert)
      .map((week) => ({
        key: `${row.employee.id}-${week.weekStart}`,
        row,
        tone: "alerta" as const,
        text: `${formatHoursValue(week.overtimeHours)} h extra la semana del ${formatDay(week.weekStart)} (límite: 10 h)`,
        action: "Revisar",
      })),
  ]);

  const run = payroll?.runs?.find(
    (r) => r.dateFrom === data.period.from && r.dateTo === data.period.to && r.state !== "cancelled",
  );

  return (
    <>
      {pending.length > 0 ? (
        <Card flush className="border-alerta-fondo">
          <h2 className="flex items-center gap-2 border-b border-borde px-4 py-3 text-sm font-semibold">
            <span className="grid h-6 w-6 place-items-center rounded-full bg-alerta-fondo text-[13px] text-alerta-texto">!</span>
            Pendientes antes de la nómina
            <span className="ml-auto text-gris tabular-nums">{pending.length}</span>
          </h2>
          <ul className="divide-y divide-borde">
            {pending.map((item) => (
              <li key={item.key}>
                <Link
                  href={employeeHref(item.row.employee.id)}
                  className="flex items-center gap-3 px-4 py-2.5 text-sm transition-colors hover:bg-hueso/60"
                >
                  <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full sm:hidden ${item.tone === "error" ? "bg-error" : "bg-alerta"}`} />
                  <span className="hidden w-28 shrink-0 sm:flex">
                    <Badge tone={item.tone}>{item.tone === "error" ? "Sin salida" : "Horas extra"}</Badge>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="font-semibold">{item.row.employee.name}</span>
                    <span className="text-gris"> · {item.text}</span>
                  </span>
                  <span className="font-semibold text-kru-700">{item.action} →</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : (
        withHours.length > 0 && (
          <p className="flex items-center gap-2 rounded-xl bg-exito-fondo px-4 py-3 text-sm text-exito-texto">
            <span aria-hidden>✓</span> Sin turnos abiertos ni excesos de horas extra.
          </p>
        )
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Con horas" value={withHours.length} hint={`de ${data.rows.length} colaboradores`} />
        <Stat label="Horas trabajadas" value={formatHoursValue(sum((r) => r.hours.worked))} tone="marca" />
        <Stat label="Horas extra" value={formatHoursValue(sum((r) => r.hours.overtimeDay + r.hours.overtimeNight))} />
        <Stat label="Nocturnas ord." value={formatHoursValue(sum((r) => r.hours.nightOrdinary))} />
      </div>

      {payroll && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-borde bg-white px-4 py-3 text-sm">
          <Icon name="wallet" className="h-5 w-5 text-kru-700" />
          {run ? (
            <>
              <span className="flex-1">
                Este período ya tiene lote: <b>{run.name}</b>
              </span>
              <Badge tone={RUN_STATE[run.state].tone}>{RUN_STATE[run.state].label}</Badge>
              <Link href={`/rrhh/${companyId}/nomina/${run.id}`} className="font-semibold text-kru-700 hover:text-kru-800">
                Ver lote →
              </Link>
            </>
          ) : (
            <>
              <span className="flex-1 text-gris">Este período todavía no tiene lote de nómina.</span>
              <Link
                href={`/rrhh/${companyId}/nomina?nuevo=${payroll.kind}&fecha=${payroll.date}`}
                className="font-semibold text-kru-700 hover:text-kru-800"
              >
                Calcular nómina →
              </Link>
            </>
          )}
        </div>
      )}

      <Card flush>
        {data.rows.length === 0 ? (
          <div className="p-4"><EmptyState>No hay colaboradores en este período.</EmptyState></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="rotulo border-b border-borde text-left text-gris">
                  <th className="px-4 py-2.5 font-semibold">Colaborador</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Trabajadas</th>
                  {columns.map((c) => (
                    <th key={c.key} className="px-4 py-2.5 text-right font-semibold">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {rows.map((row) => {
                  const alerts = row.weeks.filter((w) => w.alert).length;
                  return (
                    <tr key={row.employee.id} className={hasHours(row) ? "" : "text-gris"}>
                      <td className="px-4 py-3">
                        <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                          <Link href={`/rrhh/${companyId}/colaboradores/${row.employee.id}`} className="font-semibold hover:text-kru-700">
                            {row.employee.name}
                          </Link>
                          {row.openShifts > 0 && <Badge tone="error">{row.openShifts} sin salida</Badge>}
                          {alerts > 0 && <Badge tone="alerta">Extra &gt; 10 h</Badge>}
                          {!row.employee.active && <Badge>Inactivo</Badge>}
                        </span>
                        <span className="block text-[13px] text-gris tabular-nums">C.I. {row.employee.cedula}</span>
                      </td>
                      {hasHours(row) ? (
                        <>
                          <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatHoursValue(row.hours.worked)}</td>
                          {columns.map((c) => (
                            <td key={c.key} className="px-4 py-3 text-right tabular-nums">
                              {row.hours[c.key] > 0 ? formatHoursValue(row.hours[c.key]) : <span className="text-gris-claro">—</span>}
                            </td>
                          ))}
                        </>
                      ) : (
                        <td colSpan={columns.length + 1} className="px-4 py-3 text-right text-[13px]">
                          Sin horas en el período
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
