"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ScheduleForm } from "@/components/schedule-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import { DEFAULT_SCHEDULE, hoursLabel, WEEKDAYS } from "@/lib/schedules";
import type { ScheduleDay, WorkSchedule } from "@/lib/types";

type Editing = { mode: "create" } | { mode: "edit"; schedule: WorkSchedule } | null;

const DAY_LETTERS = ["L", "M", "X", "J", "V", "S", "D"];

/** Semana en 7 casillas: los días laborables marcados, con su jornada como título. */
function WeekStrip({ days }: { days: WorkSchedule["days"] }) {
  return (
    <ol className="flex gap-1" aria-label="Días laborables">
      {DAY_LETTERS.map((letter, i) => {
        const day = days?.[i];
        return (
          <li
            key={letter}
            title={day ? `${WEEKDAYS[i]}: ${day.start}–${day.end}` : `${WEEKDAYS[i]}: libre`}
            className={`grid h-7 w-7 place-items-center rounded-md text-[12px] font-semibold ${
              day ? "bg-kru-600 text-white" : "bg-hueso text-gris-claro"
            }`}
          >
            {letter}
            <span className="sr-only">{day ? ` ${day.start} a ${day.end}` : " libre"}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Jornada en una línea: "08:00–17:00", o "Varía según el día" si no es igual todos los días. */
function hoursLine(days: WorkSchedule["days"]) {
  const worked = (days ?? []).filter((d): d is ScheduleDay => Boolean(d));
  if (worked.length === 0) return null;
  const same = worked.every((d) => d.start === worked[0].start && d.end === worked[0].end);
  return same ? `${worked[0].start}–${worked[0].end}` : "Varía según el día";
}

function Tag({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-hueso px-2.5 py-1 text-[12px] font-medium text-gris">{children}</span>;
}

function ScheduleCard({ schedule, onOpen }: { schedule: WorkSchedule; onOpen: () => void }) {
  const hours = hoursLine(schedule.days);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex h-full flex-col gap-4 rounded-2xl border border-borde bg-white p-5 text-left transition hover:border-kru-300 hover:shadow-kru-md ${
        schedule.active ? "" : "opacity-70"
      }`}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="font-semibold">{schedule.name}</span>
        {!schedule.active && <Badge tone="error">Inactivo</Badge>}
      </span>

      {hours ? (
        <span className="flex flex-col gap-2">
          <WeekStrip days={schedule.days} />
          <span className="text-sm tabular-nums text-grafito">{hours}</span>
        </span>
      ) : (
        <span className="text-sm text-gris">Sin horario fijo · turnos rotativos</span>
      )}

      <span className="mt-auto flex flex-wrap gap-1.5">
        <Tag>
          {schedule.overtimeMode === "schedule"
            ? "Extra fuera de jornada"
            : `Extra después de ${hoursLabel(schedule.ordinaryMinutes)}`}
        </Tag>
        <Tag>{schedule.breakMinutes > 0 ? `Almuerzo ${schedule.breakMinutes} min` : "Sin almuerzo"}</Tag>
        <Tag>
          Nocturna {schedule.nightStart}–{schedule.nightEnd}
        </Tag>
      </span>
    </button>
  );
}

export default function HorariosPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const queryClient = useQueryClient();
  const company = useCurrentCompany(companyId);
  const groupId = company?.group.id;
  const [editing, setEditing] = useState<Editing>(null);

  const schedules = useQuery({
    queryKey: ["groups", groupId, "schedules"],
    queryFn: () => api<{ schedules: WorkSchedule[] }>(`/groups/${groupId}/schedules`).then((r) => r.schedules),
    enabled: Boolean(groupId),
  });

  function open(next: Editing) {
    setEditing(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0 max-w-2xl">
          <h1 className="text-2xl font-bold tracking-[-0.025em]">Horarios</h1>
          <p className="mt-1 text-sm text-gris">
            Jornada, descanso y cómo se cuentan las horas extra y nocturnas. Se asignan en el contrato de cada
            colaborador y se comparten entre las empresas de {company?.group.name ?? "el grupo"}.
          </p>
        </div>
        <Button onClick={() => open({ mode: "create" })} disabled={!groupId}>Nuevo horario</Button>
      </div>

      <p className="flex items-start gap-2 rounded-xl bg-hueso px-4 py-3 text-[13px] text-gris">
        <span aria-hidden className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full border border-gris-claro text-[10px] font-bold">i</span>
        <span>
          Si un contrato no tiene horario se aplica la <b className="font-semibold text-grafito">regla general</b>: extra después
          de {hoursLabel(DEFAULT_SCHEDULE.ordinaryMinutes)} por turno, sin almuerzo descontado, nocturna{" "}
          {DEFAULT_SCHEDULE.nightStart}–{DEFAULT_SCHEDULE.nightEnd} y alerta con más de{" "}
          {hoursLabel(DEFAULT_SCHEDULE.weeklyOvertimeAlertMinutes)} extra por semana.
        </span>
      </p>

      {schedules.isError ? (
        <EmptyState>{errorMessage(schedules.error)}</EmptyState>
      ) : !schedules.data ? (
        <p className="text-sm text-gris">Cargando…</p>
      ) : schedules.data.length === 0 ? (
        <button
          type="button"
          onClick={() => open({ mode: "create" })}
          className="rounded-2xl border border-dashed border-borde-fuerte bg-white px-6 py-10 text-center transition hover:border-kru-300"
        >
          <span className="block font-semibold">Crea tu primer horario</span>
          <span className="mt-1 block text-sm text-gris">Por ejemplo, de lunes a viernes de 08:00 a 17:00 con una hora de almuerzo.</span>
        </button>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[...schedules.data]
            .sort((x, y) => Number(y.active) - Number(x.active))
            .map((s) => (
              <li key={s.id}>
                <ScheduleCard schedule={s} onOpen={() => open({ mode: "edit", schedule: s })} />
              </li>
            ))}
        </ul>
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="side"
        title={editing?.mode === "edit" ? editing.schedule.name : "Nuevo horario"}
      >
        {editing && groupId && (
          <ScheduleForm
            key={editing.mode === "edit" ? editing.schedule.id : "new"}
            groupId={groupId}
            schedule={editing.mode === "edit" ? editing.schedule : null}
            onDone={() => {
              setEditing(null);
              void queryClient.invalidateQueries({ queryKey: ["groups", groupId, "schedules"] });
              // Cambiar un horario cambia las horas de turnos y períodos.
              void queryClient.invalidateQueries({ queryKey: ["companies"] });
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
