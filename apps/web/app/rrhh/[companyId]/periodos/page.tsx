"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PeriodPicker, usePeriodPicker } from "@/components/period-picker";
import { ShiftsPanel, type PanelEmployee } from "@/components/shifts-panel";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, Stat } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Icon } from "@/components/ui/icons";
import { api, errorMessage } from "@/lib/api";
import { RUN_STATE } from "@/lib/money";
import { formatDay, formatHoursValue } from "@/lib/time";
import type { PayrollRun, PeriodRow, PeriodSummary } from "@/lib/types";

const hasHours = (row: PeriodRow) => row.minutes.worked > 0;

export default function PeriodosPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const picker = usePeriodPicker();
  const { kind, apiKind, date, params } = picker;
  const summary = useQuery({
    queryKey: ["companies", companyId, "periods", params],
    queryFn: () => api<PeriodSummary>(`/companies/${companyId}/periods?${params}`),
  });
  const runs = useQuery({
    queryKey: ["companies", companyId, "payroll-runs"],
    queryFn: () => api<{ runs: PayrollRun[] }>(`/companies/${companyId}/payroll-runs`).then((r) => r.runs),
  });

  const data = summary.data;
  const period = data?.period;

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

      <PeriodPicker picker={picker} period={period} />

      {summary.isError ? (
        <EmptyState>{errorMessage(summary.error)}</EmptyState>
      ) : !data ? (
        <p className="text-sm text-gris">Calculando…</p>
      ) : (
        <PeriodBody
          companyId={companyId}
          data={data}
          runs={runs.data ?? []}
          payroll={kind === "range" ? null : { kind: apiKind, date }}
        />
      )}
    </div>
  );
}

type Panel = { employee: PanelEmployee; focus: "open" | null };

function PeriodBody({
  companyId,
  data,
  runs,
  payroll,
}: {
  companyId: string;
  data: PeriodSummary;
  runs: PayrollRun[];
  payroll: { kind: string; date: string } | null;
}) {
  const [panel, setPanel] = useState<Panel | null>(null);
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

  // Lotes vigentes que tocan el período: el mismo período o uno que se solapa (p. ej. la quincena
  // que contiene la semana). La API no deja crear otro lote de la misma estructura encima.
  const covering = runs.filter(
    (r) => r.state !== "cancelled" && r.dateFrom <= data.period.to && r.dateTo >= data.period.from,
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
                <button
                  type="button"
                  onClick={() => setPanel({ employee: item.row.employee, focus: item.tone === "error" ? "open" : null })}
                  className="flex w-full items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors hover:bg-hueso/60"
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
                </button>
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
          {covering.length > 0 ? (
            <ul className="flex min-w-0 flex-1 flex-col gap-2">
              {covering.map((run) => {
                const exact = run.dateFrom === data.period.from && run.dateTo === data.period.to;
                return (
                  <li key={run.id} className="flex flex-wrap items-center gap-3">
                    <span className="min-w-0 flex-1">
                      {exact ? "Este período ya tiene lote: " : "Este período se solapa con el lote "}
                      <b>{run.name}</b>
                    </span>
                    <Badge tone={RUN_STATE[run.state].tone}>{RUN_STATE[run.state].label}</Badge>
                    <Link href={`/rrhh/${companyId}/nomina/${run.id}`} className="font-semibold text-kru-700 hover:text-kru-800">
                      Ver lote →
                    </Link>
                  </li>
                );
              })}
            </ul>
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
                          <button
                            type="button"
                            onClick={() => setPanel({ employee: row.employee, focus: null })}
                            className="font-semibold hover:text-kru-700"
                          >
                            {row.employee.name}
                          </button>
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

      <Dialog
        open={panel !== null}
        onClose={() => setPanel(null)}
        size="side"
        title={panel?.employee.name ?? ""}
      >
        {panel && (
          <ShiftsPanel
            key={panel.employee.id}
            companyId={companyId}
            employee={panel.employee}
            period={data.period}
            focus={panel.focus}
            runs={runs}
          />
        )}
      </Dialog>
    </>
  );
}
