"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { api } from "@/lib/api";
import { addDays, formatDay, formatHours, formatTime, todayInCaracas } from "@/lib/time";
import type { Shift } from "@/lib/types";

const DAYS = 30;

export default function HistorialPage() {
  const to = todayInCaracas();
  const from = addDays(to, -(DAYS - 1));
  const history = useQuery({
    queryKey: ["me", "shifts", from, to],
    queryFn: () => api<{ shifts: Shift[] }>(`/me/shifts?from=${from}&to=${to}`),
  });

  const shifts = history.data?.shifts ?? [];
  const total = shifts.reduce((sum, shift) => sum + (shift.minutes?.worked ?? 0), 0);
  const overtime = shifts.reduce(
    (sum, shift) => sum + (shift.minutes ? shift.minutes.overtimeDay + shift.minutes.overtimeNight : 0),
    0,
  );

  return (
    <div className="flex flex-col gap-4">
      <Link href="/marcar" className="text-sm font-semibold text-kru-700 hover:text-kru-800">
        ← Volver
      </Link>
      <Card>
        <h1 className="text-xl font-bold tracking-[-0.02em]">Mis marcajes</h1>
        <p className="mt-1 text-sm text-gris">Últimos {DAYS} días.</p>
        <div className="mt-4 grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-kru-100 bg-kru-50 p-3.5">
            <p className="rotulo text-kru-800">Trabajadas</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{formatHours(total)} h</p>
          </div>
          <div className="rounded-xl border border-borde p-3.5">
            <p className="rotulo text-gris">Horas extra</p>
            <p className="mt-2 text-2xl font-bold tabular-nums">{formatHours(overtime)} h</p>
          </div>
        </div>

        <div className="mt-4">
          {history.isPending ? (
            <p className="text-sm text-gris">Cargando…</p>
          ) : shifts.length === 0 ? (
            <EmptyState>No hay marcajes en este período.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {shifts.map((shift) => (
                <li key={shift.id} className="rounded-xl border border-borde px-3.5 py-2.5 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="font-medium first-letter:uppercase">{formatDay(shift.date)}</span>
                    {shift.minutes ? (
                      <span className="font-semibold tabular-nums">{formatHours(shift.minutes.worked)} h</span>
                    ) : (
                      <Badge tone="alerta">Abierto</Badge>
                    )}
                  </div>
                  <p className="mt-1 text-gris tabular-nums">
                    {formatTime(shift.clockIn)} → {shift.clockOut ? formatTime(shift.clockOut) : "…"}
                    {shift.minutes && shift.minutes.overtimeDay + shift.minutes.overtimeNight > 0 && (
                      <> · {formatHours(shift.minutes.overtimeDay + shift.minutes.overtimeNight)} h extra</>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
