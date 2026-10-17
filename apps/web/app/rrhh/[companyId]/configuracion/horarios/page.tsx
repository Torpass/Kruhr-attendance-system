"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import { DEFAULT_SCHEDULE, describeSchedule, WEEKDAYS } from "@/lib/schedules";
import type { ScheduleDay, WorkSchedule } from "@/lib/types";

type Draft = Omit<WorkSchedule, "id">;
type Editing = { mode: "create" } | { mode: "edit"; schedule: WorkSchedule } | null;

const fieldClass =
  "w-full rounded-lg border border-borde-fuerte bg-white px-3 py-2.5 text-sm outline-none focus:border-kru-500 focus:ring-4 focus:ring-kru-100";
const OFFICE: ScheduleDay = { start: "08:00", end: "17:00" };

function Summary({ policy }: { policy: Omit<Draft, "code" | "name" | "active"> }) {
  const d = describeSchedule(policy);
  return (
    <ul className="flex flex-col gap-0.5 text-[13px] text-gris">
      {d.week && <li className="font-medium text-grafito">{d.week}</li>}
      <li>{d.overtime}</li>
      <li>{d.rest}</li>
      <li>
        {d.night} · {d.alert}
      </li>
    </ul>
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
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.025em]">Horarios</h1>
          <p className="mt-1 text-sm text-gris">
            Jornada, descanso y cómo se cuentan las horas extra y nocturnas. Se asignan en el contrato de cada
            colaborador y se comparten entre las empresas de {company?.group.name ?? "el grupo"}.
          </p>
        </div>
        <Button onClick={() => open({ mode: "create" })} disabled={!groupId}>Nuevo horario</Button>
      </div>

      <Card flush>
        <div className="flex items-start gap-3 border-b border-borde px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Regla general</span>
            <span className="mb-1 block text-[13px] text-gris">Para contratos sin horario. No se puede editar.</span>
            <Summary policy={DEFAULT_SCHEDULE} />
          </span>
          <Badge>Por defecto</Badge>
        </div>
        {schedules.isError ? (
          <div className="p-4"><EmptyState>{errorMessage(schedules.error)}</EmptyState></div>
        ) : !schedules.data ? (
          <p className="p-4 text-sm text-gris">Cargando…</p>
        ) : schedules.data.length === 0 ? (
          <div className="p-4">
            <EmptyState>Todavía no hay horarios. Crea uno para la jornada de tu empresa, por ejemplo de lunes a viernes de 08:00 a 17:00.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-borde">
            {schedules.data.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => open({ mode: "edit", schedule: s })}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hueso/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-semibold">{s.name}</span>
                      <span className="font-mono text-[12px] text-gris-claro">{s.code}</span>
                    </span>
                    <Summary policy={s} />
                  </span>
                  {!s.active && <Badge tone="error">Inactivo</Badge>}
                  <span aria-hidden className="text-gris-claro">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

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

function ScheduleForm({
  groupId,
  schedule,
  onDone,
  onCancel,
}: {
  groupId: string;
  schedule: WorkSchedule | null;
  onDone: () => void;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => {
    if (!schedule) return { ...DEFAULT_SCHEDULE, code: "", name: "", active: true };
    const { code, name, active, overtimeMode, ordinaryMinutes, days, breakMinutes, breakAfterMinutes } = schedule;
    const { nightStart, nightEnd, weeklyOvertimeAlertMinutes } = schedule;
    return { code, name, active, overtimeMode, ordinaryMinutes, days, breakMinutes, breakAfterMinutes, nightStart, nightEnd, weeklyOvertimeAlertMinutes };
  });
  const set = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }));
  const days = draft.days ?? Array<ScheduleDay | null>(7).fill(null);

  const save = useMutation({
    mutationFn: () => {
      const { code, ...rest } = draft;
      return schedule
        ? api(`/groups/${groupId}/schedules/${schedule.id}`, { method: "PATCH", body: JSON.stringify(rest) })
        : api(`/groups/${groupId}/schedules`, { method: "POST", body: JSON.stringify({ code, ...rest }) });
    },
    onSuccess: onDone,
  });

  function setMode(overtimeMode: Draft["overtimeMode"]) {
    // Al pasar a jornada, propone L–V de 08:00 a 17:00 si todavía no hay días.
    set({
      overtimeMode,
      days: overtimeMode === "schedule" && !draft.days ? [OFFICE, OFFICE, OFFICE, OFFICE, OFFICE, null, null] : draft.days,
    });
  }

  function setDay(index: number, day: ScheduleDay | null) {
    set({ days: days.map((d, i) => (i === index ? day : d)) });
  }

  function copyMonday() {
    const monday = days[0];
    if (monday) set({ days: days.map((d) => (d ? { ...monday } : d)) });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
  const toMinutes = (value: string) => Math.round(Number(value) * 60);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_10rem]">
        <Input label="Nombre" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Oficina L–V" required />
        <Input
          label="Código"
          value={draft.code}
          onChange={(e) => set({ code: e.target.value.toUpperCase() })}
          placeholder="OFICINA"
          pattern="[A-Z][A-Z0-9_]{0,29}"
          title="Mayúsculas, números y _ ; empieza con una letra"
          className="font-mono"
          disabled={Boolean(schedule)}
          required
        />
      </div>

      <fieldset>
        <legend className="rotulo mb-1.5 text-gris">¿Cuándo empieza la hora extra?</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-hueso p-1">
          {[
            { value: "duration" as const, label: "Pasadas N horas" },
            { value: "schedule" as const, label: "Fuera de la jornada" },
          ].map((option) => (
            <label
              key={option.value}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-semibold transition-colors has-focus-visible:ring-2 has-focus-visible:ring-kru-300 ${
                draft.overtimeMode === option.value ? "bg-white text-grafito shadow-kru" : "text-gris hover:text-grafito"
              }`}
            >
              <input
                type="radio"
                name="overtimeMode"
                className="sr-only"
                checked={draft.overtimeMode === option.value}
                onChange={() => setMode(option.value)}
              />
              {option.label}
            </label>
          ))}
        </div>
        <p className="mt-1.5 text-[12px] text-gris">
          {draft.overtimeMode === "duration"
            ? "Cada turno tiene sus horas ordinarias; lo que pase de ahí es extra, sin importar la hora de entrada."
            : "Es ordinario lo que cae dentro de la jornada del día. Antes de la entrada, después de la salida o en un día libre es extra."}
        </p>
      </fieldset>

      {draft.overtimeMode === "duration" ? (
        <Input
          label="Horas ordinarias por turno"
          type="number"
          step="0.25"
          min="0.25"
          max="24"
          value={hours(draft.ordinaryMinutes)}
          onChange={(e) => set({ ordinaryMinutes: toMinutes(e.target.value) })}
          required
        />
      ) : (
        <fieldset className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <legend className="rotulo text-gris">Jornada por día</legend>
            <button type="button" onClick={copyMonday} disabled={!days[0]} className="text-[13px] font-semibold text-kru-700 hover:text-kru-800 disabled:text-gris-claro">
              Copiar el lunes a los días laborables
            </button>
          </div>
          <ul className="divide-y divide-borde rounded-xl border border-borde">
            {WEEKDAYS.map((label, i) => {
              const day = days[i];
              return (
                <li key={label} className="flex flex-wrap items-center gap-3 px-3 py-2">
                  <label className="flex w-28 items-center gap-2 text-sm font-medium">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-kru-600"
                      checked={Boolean(day)}
                      onChange={(e) => setDay(i, e.target.checked ? (days.find(Boolean) ?? OFFICE) : null)}
                    />
                    {label}
                  </label>
                  {day ? (
                    <span className="flex items-center gap-2 text-sm">
                      <input type="time" aria-label={`Entrada del ${label}`} value={day.start} required
                        onChange={(e) => setDay(i, { ...day, start: e.target.value })} className={`${fieldClass} w-auto py-1.5`} />
                      <span className="text-gris">a</span>
                      <input type="time" aria-label={`Salida del ${label}`} value={day.end} required
                        onChange={(e) => setDay(i, { ...day, end: e.target.value })} className={`${fieldClass} w-auto py-1.5`} />
                      {day.end <= day.start && <span className="text-[12px] text-gris">(+1 día)</span>}
                    </span>
                  ) : (
                    <span className="text-[13px] text-gris-claro">Libre: lo trabajado es extra</span>
                  )}
                </li>
              );
            })}
          </ul>
        </fieldset>
      )}

      <fieldset className="grid gap-3 sm:grid-cols-2">
        <legend className="rotulo mb-1.5 text-gris">Descanso no pagado</legend>
        <Input
          label="Minutos"
          type="number"
          min="0"
          max="1440"
          value={draft.breakMinutes}
          onChange={(e) => set({ breakMinutes: Number(e.target.value) })}
        />
        <Input
          label="En turnos de más de (h)"
          type="number"
          step="0.25"
          min="0"
          max="24"
          value={hours(draft.breakAfterMinutes)}
          onChange={(e) => set({ breakAfterMinutes: toMinutes(e.target.value) })}
        />
        <p className="text-[12px] text-gris sm:col-span-2">
          Se descuenta de las horas ordinarias; no hace falta marcar la salida a almorzar.
        </p>
      </fieldset>

      <fieldset className="grid gap-3 sm:grid-cols-3">
        <legend className="rotulo mb-1.5 text-gris">Horas nocturnas y alerta</legend>
        <Input label="Nocturna desde" type="time" value={draft.nightStart} onChange={(e) => set({ nightStart: e.target.value })} required />
        <Input label="Hasta" type="time" value={draft.nightEnd} onChange={(e) => set({ nightEnd: e.target.value })} required />
        <Input
          label="Alerta extra/semana (h)"
          type="number"
          step="0.5"
          min="0"
          max="168"
          value={hours(draft.weeklyOvertimeAlertMinutes)}
          onChange={(e) => set({ weeklyOvertimeAlertMinutes: toMinutes(e.target.value) })}
        />
      </fieldset>

      {schedule && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" className="h-4 w-4 accent-kru-600" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
          Activo (se puede asignar en contratos nuevos)
        </label>
      )}

      <div className="rounded-xl bg-kru-50 px-3.5 py-3">
        <p className="rotulo mb-1 text-kru-700">Así se calcula</p>
        <Summary policy={{ ...draft, days }} />
      </div>

      {schedule && (
        <p className="text-[12px] text-gris">
          Los cambios aplican también a los turnos ya marcados de quienes tienen este horario. Los recibos de un lote no
          cambian hasta recalcularlo.
        </p>
      )}

      {save.isError && (
        <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">{errorMessage(save.error)}</p>
      )}

      <div className="flex justify-end gap-2 border-t border-borde pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "Guardando…" : schedule ? "Guardar" : "Crear horario"}</Button>
      </div>
    </form>
  );
}
