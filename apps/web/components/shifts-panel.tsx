"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";
import { ShiftForm } from "@/components/shift-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { RUN_STATE } from "@/lib/money";
import { formatDay, formatHours, formatTime, todayInCaracas } from "@/lib/time";
import type { PayrollRun, Shift } from "@/lib/types";

/** Colaborador cuyos turnos se muestran en el panel. */
export type PanelEmployee = { id: string; name: string; cedula: string };

/** Días bloqueados: los de un lote validado o pagado (la API rechaza corregirlos). */
function lockingRun(runs: PayrollRun[], date: string) {
  return runs.find((r) => (r.state === "validated" || r.state === "paid") && r.dateFrom <= date && date <= r.dateTo);
}

/**
 * Turnos del colaborador en el período, con corrección y alta de turnos olvidados.
 * `editing`: id del turno, "new" o null; undefined mientras no se eligió nada (con `focus`
 * "open" se abre directo el turno sin salida).
 */
export function ShiftsPanel({
  companyId,
  employee,
  period,
  focus,
  runs,
}: {
  companyId: string;
  employee: PanelEmployee;
  period: { from: string; to: string };
  focus: "open" | null;
  runs: PayrollRun[];
}) {
  const [editing, setEditing] = useState<string | null | undefined>(undefined);
  const shifts = useQuery({
    queryKey: ["companies", companyId, "shifts", employee.id, period.from, period.to],
    queryFn: () =>
      api<{ shifts: Shift[] }>(
        `/companies/${companyId}/shifts?from=${period.from}&to=${period.to}&employeeId=${employee.id}`,
      ).then((r) => r.shifts),
  });

  const autoOpen = focus === "open" ? shifts.data?.find((s) => !s.clockOut && !lockingRun(runs, s.date)) : undefined;
  const current = editing === undefined ? (autoOpen?.id ?? null) : editing;
  const shift = shifts.data?.find((s) => s.id === current) ?? null;
  const today = todayInCaracas();
  const newShiftDay = today >= period.from && today <= period.to ? today : period.from;
  const periodLock = lockingRun(runs, newShiftDay);

  if (current !== null && (shift || current === "new")) {
    return (
      <div className="flex flex-col gap-4">
        <button type="button" onClick={() => setEditing(null)} className="self-start text-sm font-semibold text-kru-700 hover:text-kru-800">
          ← Turnos del período
        </button>
        <h3 className="font-semibold">
          {shift ? `Corregir turno del ${formatDay(shift.date)}` : "Agregar turno olvidado"}
        </h3>
        <ShiftForm
          companyId={companyId}
          employeeId={employee.id}
          shift={shift}
          defaultDate={newShiftDay}
          onDone={() => setEditing(null)}
          onCancel={() => setEditing(null)}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="-mt-2 flex items-center justify-between gap-3 text-[13px] text-gris">
        <span className="tabular-nums">C.I. {employee.cedula} · {formatDay(period.from)} → {formatDay(period.to)}</span>
        <Link href={`/rrhh/${companyId}/colaboradores/${employee.id}`} className="font-semibold text-kru-700 hover:text-kru-800">
          Ver ficha →
        </Link>
      </div>

      {shifts.isError ? (
        <EmptyState>{errorMessage(shifts.error)}</EmptyState>
      ) : !shifts.data ? (
        <p className="text-sm text-gris">Cargando…</p>
      ) : shifts.data.length === 0 ? (
        <EmptyState>No tiene turnos en este período.</EmptyState>
      ) : (
        <ul className="divide-y divide-borde rounded-xl border border-borde">
          {shifts.data.map((s) => {
            const lock = lockingRun(runs, s.date);
            return (
              <li key={s.id} className="flex items-center gap-3 px-3.5 py-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold first-letter:uppercase">{formatDay(s.date)}</span>
                  <span className="block text-[13px] text-gris tabular-nums">
                    {formatTime(s.clockIn)} → {s.clockOut ? formatTime(s.clockOut) : "sin salida"}
                    {s.minutes && ` · ${formatHours(s.minutes.worked)} h`}
                    {s.minutes && s.minutes.overtimeDay + s.minutes.overtimeNight > 0 &&
                      ` (${formatHours(s.minutes.overtimeDay + s.minutes.overtimeNight)} extra)`}
                  </span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {!s.clockOut && <Badge tone="error">Sin salida</Badge>}
                    {(s.corrections ?? 0) > 0 && <Badge>Corregido</Badge>}
                  </span>
                </span>
                {lock ? (
                  <span className="text-right text-[12px] text-gris" title={`Lote ${lock.name}`}>
                    En nómina {RUN_STATE[lock.state].label.toLowerCase()}
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={() => setEditing(s.id)}
                    className="font-semibold text-kru-700 hover:text-kru-800"
                  >
                    Corregir
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {periodLock ? (
        <p className="rounded-lg bg-hueso px-3.5 py-2.5 text-[13px] text-gris">
          Este período está en el lote {periodLock.name} ({RUN_STATE[periodLock.state].label.toLowerCase()}); sus turnos
          ya no se pueden corregir.
        </p>
      ) : (
        <Button variant="secondary" onClick={() => setEditing("new")} className="self-start">
          Agregar turno olvidado
        </Button>
      )}
      <p className="text-[12px] text-gris">Cada cambio pide un motivo y queda en el historial del turno.</p>
    </div>
  );
}
