"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, Stat } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { formatDay, formatHoursValue, todayInCaracas } from "@/lib/time";
import type { PeriodSummary } from "@/lib/types";

type Kind = "week" | "first_half" | "second_half" | "range";

const KINDS: { value: Kind; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "first_half", label: "1.ª quincena" },
  { value: "second_half", label: "2.ª quincena" },
  { value: "range", label: "Rango" },
];

const fieldClass = "rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-sm";

export default function PeriodosPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const [kind, setKind] = useState<Kind>("week");
  const [date, setDate] = useState(todayInCaracas);
  const [from, setFrom] = useState(todayInCaracas);
  const [to, setTo] = useState(todayInCaracas);

  const params = new URLSearchParams(kind === "range" ? { from, to } : { kind, date }).toString();
  const summary = useQuery({
    queryKey: ["companies", companyId, "periods", params],
    queryFn: () => api<PeriodSummary>(`/companies/${companyId}/periods?${params}`),
  });

  const data = summary.data;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.025em]">Períodos</h1>
        <p className="mt-1 text-sm text-gris">
          Horas de cada colaborador listas para la nómina. Se redondean a 2 decimales al final del período.
        </p>
      </div>

      <Card className="flex flex-wrap items-end gap-3">
        <fieldset className="flex flex-col gap-1">
          <legend className="rotulo mb-1 text-gris">Período</legend>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-hueso p-1 sm:grid-cols-4">
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
                  onChange={() => setKind(option.value)}
                  className="sr-only"
                />
                {option.label}
              </label>
            ))}
          </div>
        </fieldset>
        {kind === "range" ? (
          <>
            <label className="flex flex-col gap-1">
              <span className="rotulo text-gris">Desde</span>
              <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
            </label>
            <label className="flex flex-col gap-1">
              <span className="rotulo text-gris">Hasta</span>
              <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
            </label>
          </>
        ) : (
          <label className="flex flex-col gap-1">
            <span className="rotulo text-gris">{kind === "week" ? "Un día de la semana" : "Un día del mes"}</span>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={fieldClass} />
          </label>
        )}
        <a
          href={`/api/companies/${companyId}/periods/export.csv?${params}`}
          download
          aria-disabled={!data}
          className={`ml-auto inline-flex items-center justify-center rounded-lg bg-kru-600 px-4 py-2.5 text-sm font-semibold text-white shadow-kru transition-colors hover:bg-kru-800 ${
            data ? "" : "pointer-events-none opacity-50"
          }`}
        >
          Exportar CSV
        </a>
      </Card>

      {summary.isError ? (
        <EmptyState>{errorMessage(summary.error)}</EmptyState>
      ) : !data ? (
        <p className="text-sm text-gris">Calculando…</p>
      ) : (
        <>
          <p className="text-sm font-medium first-letter:uppercase">
            {formatDay(data.period.from)} → {formatDay(data.period.to)}
          </p>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Colaboradores" value={data.rows.length} />
            <Stat
              label="Extra (diurna + nocturna)"
              value={formatHoursValue(
                data.rows.reduce((sum, r) => sum + r.hours.overtimeDay + r.hours.overtimeNight, 0),
              )}
              tone="marca"
            />
            <Stat label="Alertas > 10 h extra/semana" value={data.alerts} tone={data.alerts ? "alerta" : "neutral"} />
            <Stat label="Turnos abiertos" value={data.openShifts} tone={data.openShifts ? "alerta" : "neutral"} />
          </div>

          <Card flush>
            {data.rows.length === 0 ? (
              <div className="p-4"><EmptyState>No hay colaboradores en este período.</EmptyState></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[44rem] text-sm">
                  <thead>
                    <tr className="rotulo text-left text-gris">
                      <th className="px-4 py-2.5 font-semibold">Colaborador</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Trabajadas</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Extra diurna</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Extra nocturna</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Nocturna ord.</th>
                      <th className="px-4 py-2.5 font-semibold">Avisos</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-borde">
                    {data.rows.map((row) => (
                      <tr key={row.employee.id}>
                        <td className="px-4 py-3">
                          <Link
                            href={`/rrhh/${companyId}/colaboradores/${row.employee.id}`}
                            className="font-semibold hover:text-kru-700"
                          >
                            {row.employee.name}
                          </Link>
                          <span className="block text-[13px] text-gris tabular-nums">C.I. {row.employee.cedula}</span>
                        </td>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatHoursValue(row.hours.worked)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatHoursValue(row.hours.overtimeDay)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatHoursValue(row.hours.overtimeNight)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatHoursValue(row.hours.nightOrdinary)}</td>
                        <td className="px-4 py-3">
                          <span className="flex flex-wrap gap-1">
                            {row.weeks
                              .filter((week) => week.alert)
                              .map((week) => (
                                <Badge key={week.weekStart} tone="alerta">
                                  {formatHoursValue(week.overtimeHours)} h extra sem. {formatDay(week.weekStart)}
                                </Badge>
                              ))}
                            {row.openShifts > 0 && <Badge tone="error">{row.openShifts} sin salida</Badge>}
                            {!row.employee.active && <Badge>Inactivo</Badge>}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}
