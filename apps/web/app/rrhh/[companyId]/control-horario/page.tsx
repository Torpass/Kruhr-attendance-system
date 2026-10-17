"use client";

import { PUNCTUALITY_TOLERANCE_MINUTES, type DayStatus } from "@marcaje/core";
import { useQuery } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { PeriodPicker, usePeriodPicker } from "@/components/period-picker";
import { ShiftsPanel, type PanelEmployee } from "@/components/shifts-panel";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState, Stat } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";
import { formatDay, formatHours, formatTime } from "@/lib/time";
import type { AttendanceDay, AttendanceReport, PayrollRun } from "@/lib/types";

type Tone = "marca" | "exito" | "alerta" | "error" | "neutro";

const STATUS: Record<DayStatus, { label: string; tone: Tone }> = {
  on_time: { label: "A tiempo", tone: "exito" },
  late: { label: "Llegó tarde", tone: "alerta" },
  left_early: { label: "Salió antes", tone: "alerta" },
  incomplete: { label: "Incompleto", tone: "error" },
  extended: { label: "Extendido", tone: "marca" },
  absent: { label: "Ausente", tone: "error" },
  pending: { label: "Pendiente", tone: "neutro" },
  open: { label: "Sin salida", tone: "error" },
  worked_day_off: { label: "Día libre trabajado", tone: "marca" },
  unscheduled: { label: "Sin horario", tone: "neutro" },
};

/** Lo que RRHH tiene que mirar: faltas de puntualidad, ausencias y turnos sin salida. */
const ISSUES: DayStatus[] = ["late", "left_early", "incomplete", "absent", "open"];
const ORDER = Object.keys(STATUS) as DayStatus[];

type Filter = "all" | "issues" | DayStatus;

/** 25 → "25 min"; 90 → "1 h 30 min". */
function duration(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return h === 0 ? `${m} min` : m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/** Hora marcada con su desvío frente a la jornada (rojo si pasa la tolerancia). */
function Punch({ at, delay, ahead, delayLabel, aheadLabel }: {
  at: string | null;
  delay: number;
  ahead: number;
  delayLabel: string;
  aheadLabel: string;
}) {
  if (!at) return <span className="text-gris-claro">—</span>;
  const off = delay > PUNCTUALITY_TOLERANCE_MINUTES;
  return (
    <span className="flex flex-col leading-tight">
      <span className="font-mono tabular-nums">{formatTime(at)}</span>
      {delay > 0 && (
        <span className={`text-[12px] ${off ? "font-semibold text-error-texto" : "text-gris"}`}>
          {duration(delay)} {delayLabel}
        </span>
      )}
      {ahead > 0 && <span className="text-[12px] text-gris">{duration(ahead)} {aheadLabel}</span>}
    </span>
  );
}

function Row({ day, onOpen }: { day: AttendanceDay; onOpen: () => void }) {
  const status = STATUS[day.status];
  const diff = day.differenceMinutes;
  return (
    <tr onClick={onOpen} className="cursor-pointer align-top transition-colors hover:bg-hueso/60">
      <td className="px-4 py-3">
        <button type="button" onClick={onOpen} className="text-left font-semibold hover:text-kru-700">
          {day.employee.name}
        </button>
        <span className="block text-[12px] text-gris tabular-nums">C.I. {day.employee.cedula}</span>
      </td>
      <td className="px-4 py-3 font-mono text-[13px] text-gris tabular-nums">
        {day.scheduled ? `${formatTime(day.scheduled.start)}–${formatTime(day.scheduled.end)}` : "—"}
      </td>
      <td className="px-4 py-3">
        <Punch at={day.firstIn} delay={day.lateMinutes} ahead={day.arrivedEarlyMinutes} delayLabel="tarde" aheadLabel="antes" />
      </td>
      <td className="px-4 py-3">
        {day.status === "open" ? (
          <span className="text-[13px] font-semibold text-error-texto">Sin salida</span>
        ) : (
          <Punch at={day.lastOut} delay={day.leftEarlyMinutes} ahead={day.stayedLateMinutes} delayLabel="antes" aheadLabel="después" />
        )}
      </td>
      <td className="px-4 py-3 text-right tabular-nums">
        <span className="block">
          {formatHours(day.workedMinutes)}
          {day.plannedMinutes > 0 && <span className="text-gris"> / {formatHours(day.plannedMinutes)}</span>}
        </span>
        {day.plannedMinutes > 0 && diff !== 0 && (
          <span className={`text-[12px] ${diff < 0 ? "text-error-texto" : "text-kru-700"}`}>
            {diff > 0 ? "+" : "−"}{formatHours(Math.abs(diff))} h
          </span>
        )}
      </td>
      <td className="px-4 py-3">
        <span className="flex flex-wrap items-center gap-1">
          <Badge tone={status.tone}>{status.label}</Badge>
          {day.corrected && <Badge tone="neutro">Corregido</Badge>}
        </span>
      </td>
    </tr>
  );
}

/**
 * Control de horario: la jornada programada de cada colaborador (su horario) contra sus marcajes.
 * Inspirado en el análisis de asistencia de Binaural (Cadipa), sin generar entradas de trabajo:
 * las correcciones se hacen sobre el turno, con motivo, desde el panel.
 */
export default function ControlHorarioPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const picker = usePeriodPicker();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [panel, setPanel] = useState<PanelEmployee | null>(null);

  const report = useQuery({
    queryKey: ["companies", companyId, "attendance", picker.params],
    queryFn: () => api<AttendanceReport>(`/companies/${companyId}/periods/attendance?${picker.params}`),
  });
  const runs = useQuery({
    queryKey: ["companies", companyId, "payroll-runs"],
    queryFn: () => api<{ runs: PayrollRun[] }>(`/companies/${companyId}/payroll-runs`).then((r) => r.runs),
  });

  const data = report.data;
  const query = search.trim().toLowerCase();
  const visible = (data?.days ?? []).filter(
    (d) =>
      (filter === "all" || (filter === "issues" ? ISSUES.includes(d.status) : d.status === filter)) &&
      (!query || d.employee.name.toLowerCase().includes(query) || d.employee.cedula.includes(query)),
  );
  const byDate = new Map<string, AttendanceDay[]>();
  for (const day of visible) byDate.set(day.date, [...(byDate.get(day.date) ?? []), day]);

  const count = (statuses: DayStatus[]) => statuses.reduce((t, s) => t + (data?.counts[s] ?? 0), 0);
  const scheduled = (data?.days ?? []).filter((d) => d.scheduled && d.status !== "pending");
  const punctual = count(["on_time", "extended"]);
  const judged = count(["on_time", "extended", "late", "left_early", "incomplete"]);
  const lateDays = (data?.days ?? []).filter((d) => d.status === "late" || d.status === "incomplete");
  const avgLate = lateDays.length ? Math.round(lateDays.reduce((t, d) => t + d.lateMinutes, 0) / lateDays.length) : 0;

  const chips: { value: Filter; label: string; count: number }[] = [
    { value: "all", label: "Todos", count: data?.days.length ?? 0 },
    { value: "issues", label: "Con incidencias", count: count(ISSUES) },
    ...ORDER.filter((s) => (data?.counts[s] ?? 0) > 0).map((s) => ({ value: s, label: STATUS[s].label, count: data!.counts[s] })),
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="max-w-2xl">
        <h1 className="text-2xl font-bold tracking-[-0.025em]">Control de horario</h1>
        <p className="mt-1 text-sm text-gris">
          La jornada de cada colaborador según su horario, contra sus marcajes. Tolerancia de{" "}
          {PUNCTUALITY_TOLERANCE_MINUTES} min para llegar tarde, salir antes o quedarse más.
        </p>
      </div>

      <PeriodPicker picker={picker} period={data?.period} />

      {report.isError ? (
        <EmptyState>{errorMessage(report.error)}</EmptyState>
      ) : !data ? (
        <p className="text-sm text-gris">Calculando…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label="Jornadas programadas" value={scheduled.length} hint="hasta hoy" />
            <Stat
              label="Puntualidad"
              value={judged ? `${Math.round((punctual / judged) * 100)} %` : "—"}
              tone="marca"
              hint={`${punctual} de ${judged} jornadas`}
            />
            <Stat
              label="Llegadas tarde"
              value={lateDays.length}
              tone={lateDays.length ? "alerta" : "neutral"}
              hint={lateDays.length ? `promedio ${duration(avgLate)}` : "Ninguna"}
            />
            <Stat
              label="Ausencias"
              value={data.counts.absent}
              tone={data.counts.absent ? "alerta" : "neutral"}
              hint={data.counts.open ? `${data.counts.open} sin salida` : undefined}
            />
          </div>

          <Card flush>
            <div className="flex flex-col gap-3 border-b border-borde p-4">
              <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por estado">
                {chips.map((chip) => (
                  <button
                    key={chip.value}
                    type="button"
                    onClick={() => setFilter(chip.value)}
                    aria-pressed={filter === chip.value}
                    className={`rounded-full border px-3 py-1 text-[13px] font-medium transition-colors ${
                      filter === chip.value
                        ? "border-kru-300 bg-kru-100 text-kru-800"
                        : "border-borde text-gris hover:border-kru-300"
                    }`}
                  >
                    {chip.label} <span className="tabular-nums opacity-70">{chip.count}</span>
                  </button>
                ))}
              </div>
              <label className="sr-only" htmlFor="buscar">Buscar colaborador</label>
              <input
                id="buscar"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o cédula"
                className="w-full rounded-lg border border-borde-fuerte px-3.5 py-2 text-sm outline-none focus:border-kru-500 focus:ring-4 focus:ring-kru-100 sm:max-w-xs"
              />
            </div>

            {visible.length === 0 ? (
              <div className="p-4">
                <EmptyState>
                  {data.days.length === 0
                    ? "No hay jornadas ni marcajes en este período."
                    : "Ningún día coincide con el filtro."}
                </EmptyState>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[48rem] text-sm">
                  <thead>
                    <tr className="rotulo border-b border-borde text-left text-gris">
                      <th className="px-4 py-2.5 font-semibold">Colaborador</th>
                      <th className="px-4 py-2.5 font-semibold">Horario</th>
                      <th className="px-4 py-2.5 font-semibold">Entrada</th>
                      <th className="px-4 py-2.5 font-semibold">Salida</th>
                      <th className="px-4 py-2.5 text-right font-semibold">Horas / plan</th>
                      <th className="px-4 py-2.5 font-semibold">Estado</th>
                    </tr>
                  </thead>
                  {[...byDate].map(([date, days]) => (
                    <tbody key={date} className="divide-y divide-borde border-b border-borde">
                      <tr className="bg-hueso/60">
                        <th colSpan={6} className="px-4 py-2 text-left text-[13px] font-semibold first-letter:uppercase">
                          {formatDay(date)}
                        </th>
                      </tr>
                      {days.map((day) => (
                        <Row key={`${day.employee.id}-${day.date}`} day={day} onOpen={() => setPanel(day.employee)} />
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            )}
          </Card>
        </>
      )}

      <Dialog open={panel !== null} onClose={() => setPanel(null)} size="side" title={panel?.name ?? ""}>
        {panel && data && (
          <ShiftsPanel
            key={panel.id}
            companyId={companyId}
            employee={panel}
            period={data.period}
            focus={null}
            runs={runs.data ?? []}
          />
        )}
      </Dialog>
    </div>
  );
}
