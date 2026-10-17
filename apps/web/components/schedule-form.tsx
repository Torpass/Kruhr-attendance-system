"use client";

import { computeShift, minutesOfDay, type WorkPolicy } from "@marcaje/core";
import { useMutation } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { DEFAULT_SCHEDULE, WEEKDAYS } from "@/lib/schedules";
import { formatHours } from "@/lib/time";
import type { ScheduleDay, WorkSchedule } from "@/lib/types";

type Draft = Omit<WorkSchedule, "id">;
type Week = (ScheduleDay | null)[];

const OFFICE: ScheduleDay = { start: "08:00", end: "17:00" };
const PRESETS: { label: string; days: Week | null }[] = [
  { label: "L–V 08–17", days: [OFFICE, OFFICE, OFFICE, OFFICE, OFFICE, null, null] },
  { label: "L–V y sábado medio día", days: [OFFICE, OFFICE, OFFICE, OFFICE, OFFICE, { start: "08:00", end: "12:00" }, null] },
  { label: "Turno nocturno", days: Array.from({ length: 7 }, (_, i) => (i < 5 ? { start: "22:00", end: "06:00" } : null)) },
  { label: "Sin horario fijo", days: null },
];

/** "Oficina L–V" → "OFICINA_L_V" (mismo formato que valida la API). */
function codeFrom(name: string) {
  const code = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 30);
  return /^[A-Z]/.test(code) ? code : `H_${code}`.slice(0, 30);
}

/** Hora en 24 h escrita a mano: "8" → "08:00", "1730" → "17:30". `null` si no es válida. */
function normalizeTime(value: string): string | null {
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;
  const [h, m] = digits.length <= 2 ? [digits, "00"] : [digits.slice(0, -2), digits.slice(-2)];
  const hours = Number(h);
  const minutes = Number(m);
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Campo de hora siempre en 24 h (el `<input type="time">` toma el formato del sistema). */
function TimeField({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const [text, setText] = useState(value);
  const [shown, setShown] = useState(value);
  if (shown !== value) {
    // Cambió desde afuera (una plantilla): se muestra el valor nuevo.
    setShown(value);
    setText(value);
  }
  return (
    <input
      aria-label={label}
      value={text}
      inputMode="numeric"
      placeholder="08:00"
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const normalized = normalizeTime(text);
        if (normalized) onChange(normalized);
        setText(normalized ?? value);
      }}
      className="w-[4.5rem] rounded-lg border border-borde-fuerte bg-white px-2 py-1.5 text-center font-mono text-sm tabular-nums outline-none focus:border-kru-500 focus:ring-4 focus:ring-kru-100"
    />
  );
}

/** Franja de un día: jornada (morado) sobre 24 h, con la noche sombreada. */
function DayBar({ day, nightStart, nightEnd }: { day: ScheduleDay | null; nightStart: string; nightEnd: string }) {
  const pct = (time: string) => (minutesOfDay(time) / 1440) * 100;
  const spans = (from: string, to: string) =>
    pct(to) > pct(from) ? [[pct(from), pct(to)]] : [[pct(from), 100], [0, pct(to)]];
  return (
    <div className="relative h-3 overflow-hidden rounded bg-hueso">
      {spans(nightStart, nightEnd).map(([a, b]) => (
        <div key={`n${a}`} className="absolute inset-y-0 bg-grafito/10" style={{ left: `${a}%`, width: `${b - a}%` }} />
      ))}
      {day &&
        spans(day.start, day.end).map(([a, b]) => (
          <div key={`d${a}`} className="absolute inset-y-0 rounded bg-kru-500" style={{ left: `${a}%`, width: `${b - a}%` }} />
        ))}
    </div>
  );
}

const REFERENCE_MONDAY = "2026-10-05";

/** Instante de una hora de Caracas (UTC−4) en el día `weekday` de una semana de referencia. */
function instant(weekday: number, time: string, plusDays = 0) {
  const day = 5 + weekday + plusDays;
  return new Date(`${REFERENCE_MONDAY.slice(0, 8)}${String(day).padStart(2, "0")}T${time}:00-04:00`);
}

/** `time` corrido `hours` horas, dentro del día: shiftTime("08:00", -1) → "07:00". */
function shiftTime(time: string, hours: number) {
  const minutes = (((minutesOfDay(time) + hours * 60) % 1440) + 1440) % 1440;
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

/**
 * Turno de ejemplo calculado con el mismo motor que la API. Propone llegar 1 h antes y salir
 * 3 h después de la jornada del primer día laborable, para que se vea la extra.
 */
function Example({ policy }: { policy: WorkPolicy }) {
  const firstWorkday = Math.max(0, policy.days?.findIndex(Boolean) ?? 0);
  const firstDay = policy.days?.[firstWorkday] ?? { start: "08:00", end: "17:00" };
  const [weekday, setWeekday] = useState(firstWorkday);
  const [start, setStart] = useState(() => shiftTime(firstDay.start, -1));
  const [end, setEnd] = useState(() => shiftTime(firstDay.end, 3));
  const scheduled = policy.days?.[weekday];

  const clockIn = instant(weekday, start);
  const clockOut = instant(weekday, end, end <= start ? 1 : 0);
  const result = computeShift({ clockIn, clockOut }, policy);
  const extra = result.overtimeDay + result.overtimeNight;

  return (
    <div className="rounded-xl bg-kru-50 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="rotulo text-kru-700">Ejemplo</span>
        <select
          aria-label="Día del ejemplo"
          value={weekday}
          onChange={(e) => setWeekday(Number(e.target.value))}
          className="rounded-lg border border-borde-fuerte bg-white px-2 py-1.5 text-sm"
        >
          {WEEKDAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}
        </select>
        <span>de</span>
        <TimeField label="Entrada del ejemplo" value={start} onChange={setStart} />
        <span>a</span>
        <TimeField label="Salida del ejemplo" value={end} onChange={setEnd} />
        {end <= start && <span className="text-[12px] text-gris">(+1 día)</span>}
      </div>
      <p className="mt-2 text-[13px] text-gris">
        {policy.overtimeMode === "schedule"
          ? scheduled
            ? `Su jornada ese día: ${scheduled.start}–${scheduled.end}.`
            : "Ese día es libre: todo lo trabajado es extra."
          : `Ordinarias: las primeras ${formatHours(policy.ordinaryMinutes)} h del turno.`}
        {result.worked < (clockOut.getTime() - clockIn.getTime()) / 60_000 && " Se descuenta el almuerzo."}
      </p>
      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
        {[
          ["Pagadas", result.worked],
          ["Ordinarias", result.worked - extra],
          ["Extra diurna", result.overtimeDay],
          ["Extra nocturna", result.overtimeNight],
        ].map(([label, minutes]) => (
          <div key={label}>
            <dt className="text-[12px] text-gris">{label}</dt>
            <dd className="font-semibold tabular-nums">{formatHours(minutes as number)}</dd>
          </div>
        ))}
      </dl>
      {result.nightOrdinary > 0 && (
        <p className="mt-1 text-[12px] text-gris">Incluye {formatHours(result.nightOrdinary)} h nocturnas ordinarias (bono nocturno).</p>
      )}
    </div>
  );
}

function Step({ number, title, hint, children }: { number: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <span className="grid h-5 w-5 place-items-center rounded-full bg-kru-100 text-[11px] text-kru-800">{number}</span>
        {title}
      </h3>
      {hint && <p className="-mt-1 text-[13px] text-gris">{hint}</p>}
      {children}
    </section>
  );
}

/** Editor de un horario en tres preguntas; lo legal (nocturna y alerta) queda plegado. */
export function ScheduleForm({
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
    if (!schedule) {
      return { ...DEFAULT_SCHEDULE, overtimeMode: "schedule", days: PRESETS[0].days, breakMinutes: 60, code: "", name: "", active: true };
    }
    const { code, name, active, overtimeMode, ordinaryMinutes, days, breakMinutes, breakAfterMinutes } = schedule;
    const { nightStart, nightEnd, weeklyOvertimeAlertMinutes } = schedule;
    return { code, name, active, overtimeMode, ordinaryMinutes, days, breakMinutes, breakAfterMinutes, nightStart, nightEnd, weeklyOvertimeAlertMinutes };
  });
  const [lunch, setLunch] = useState(draft.breakMinutes || 60);
  const set = (changes: Partial<Draft>) => setDraft((current) => ({ ...current, ...changes }));

  // Sin días laborables no hay jornada: la extra solo puede contarse por duración.
  const fixed = Boolean(draft.days?.some(Boolean));
  const days: Week = draft.days ?? Array<ScheduleDay | null>(7).fill(null);
  const code = schedule ? draft.code : codeFrom(draft.name || "Horario");
  const policy: WorkPolicy = {
    overtimeMode: fixed ? draft.overtimeMode : "duration",
    ordinaryMinutes: draft.ordinaryMinutes,
    days: fixed ? draft.days : null,
    breakMinutes: draft.breakMinutes,
    breakAfterMinutes: draft.breakAfterMinutes,
    nightStart: draft.nightStart,
    nightEnd: draft.nightEnd,
    weeklyOvertimeAlertMinutes: draft.weeklyOvertimeAlertMinutes,
  };

  const save = useMutation({
    mutationFn: () => {
      const body = { ...policy, name: draft.name, active: draft.active };
      return schedule
        ? api(`/groups/${groupId}/schedules/${schedule.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api(`/groups/${groupId}/schedules`, { method: "POST", body: JSON.stringify({ ...body, code }) });
    },
    onSuccess: onDone,
  });

  function applyPreset(presetDays: Week | null) {
    set({ days: presetDays, overtimeMode: presetDays ? draft.overtimeMode : "duration" });
  }

  function setDay(index: number, day: ScheduleDay | null) {
    set({ days: days.map((d, i) => (i === index ? day : d)) });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate();
  }

  const hours = (minutes: number) => Math.round((minutes / 60) * 100) / 100;
  const activePreset = PRESETS.find((p) => JSON.stringify(p.days) === JSON.stringify(fixed ? draft.days : null));

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-6">
      <div>
        <Input label="Nombre" value={draft.name} onChange={(e) => set({ name: e.target.value })} placeholder="Oficina L–V" required />
        <p className="mt-1 text-[12px] text-gris">
          Código: <span className="font-mono">{code}</span>
          {!schedule && " · se genera del nombre"}
        </p>
      </div>

      <Step number={1} title="¿Cuándo trabaja?">
        <div className="flex flex-wrap gap-1.5">
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              type="button"
              onClick={() => applyPreset(preset.days)}
              aria-pressed={activePreset === preset}
              className={`rounded-lg border px-2.5 py-1 text-[13px] font-medium transition-colors ${
                activePreset === preset ? "border-kru-300 bg-kru-100 text-kru-800" : "border-borde text-gris hover:border-kru-300"
              }`}
            >
              {preset.label}
            </button>
          ))}
        </div>
        {fixed ? (
          <ul className="flex flex-col gap-1.5">
            <li aria-hidden className="hidden justify-between text-[11px] text-gris-claro sm:ml-[17.25rem] sm:flex">
              <span>00</span><span>06</span><span>12</span><span>18</span><span>24</span>
            </li>
            {WEEKDAYS.map((label, i) => {
              const day = days[i];
              return (
                <li key={label} className="grid grid-cols-[6.5rem_1fr] items-center gap-2 sm:grid-cols-[6.5rem_9.75rem_1fr]">
                  <label className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-kru-600"
                      checked={Boolean(day)}
                      onChange={(e) => setDay(i, e.target.checked ? (days.find(Boolean) ?? OFFICE) : null)}
                    />
                    {label}
                  </label>
                  {day ? (
                    <span className="flex items-center gap-1 text-[13px]">
                      <TimeField label={`Entrada del ${label}`} value={day.start} onChange={(start) => setDay(i, { ...day, start })} />
                      <TimeField label={`Salida del ${label}`} value={day.end} onChange={(end) => setDay(i, { ...day, end })} />
                    </span>
                  ) : (
                    <span className="text-[13px] text-gris-claro">Libre</span>
                  )}
                  <span className="hidden sm:block">
                    <DayBar day={day} nightStart={draft.nightStart} nightEnd={draft.nightEnd} />
                  </span>
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="rounded-lg bg-hueso px-3 py-2 text-[13px] text-gris">
            Sin horario fijo: no hay hora de entrada; la extra se cuenta por duración del turno.
          </p>
        )}
      </Step>

      <Step number={2} title="¿Qué cuenta como hora extra?">
        {fixed && (
          <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${draft.overtimeMode === "schedule" ? "border-kru-500 ring-2 ring-kru-100" : "border-borde"}`}>
            <input type="radio" name="overtimeMode" className="mt-1 accent-kru-600" checked={draft.overtimeMode === "schedule"} onChange={() => set({ overtimeMode: "schedule" })} />
            <span>
              <span className="block font-semibold">Lo que trabaje fuera de su jornada</span>
              <span className="block text-[13px] text-gris">Antes de su entrada, después de su salida o en sus días libres.</span>
            </span>
          </label>
        )}
        <label className={`flex cursor-pointer gap-3 rounded-xl border p-3 text-sm ${!fixed || draft.overtimeMode === "duration" ? "border-kru-500 ring-2 ring-kru-100" : "border-borde"}`}>
          <input type="radio" name="overtimeMode" className="mt-1 accent-kru-600" checked={!fixed || draft.overtimeMode === "duration"} onChange={() => set({ overtimeMode: "duration" })} />
          <span className="flex-1">
            <span className="flex flex-wrap items-center gap-1.5 font-semibold">
              Lo que pase de
              <input
                type="number"
                aria-label="Horas ordinarias por turno"
                step="0.25"
                min="0.25"
                max="24"
                value={hours(draft.ordinaryMinutes)}
                onChange={(e) => set({ ordinaryMinutes: Math.round(Number(e.target.value) * 60), overtimeMode: "duration" })}
                className="w-16 rounded-lg border border-borde-fuerte px-2 py-1 text-center text-sm font-normal"
              />
              horas por turno
            </span>
            <span className="block text-[13px] text-gris">A cualquier hora del día. Para turnos rotativos.</span>
          </span>
        </label>
      </Step>

      <Step number={3} title="Almuerzo">
        <label className="flex flex-wrap items-center gap-1.5 text-sm">
          <input
            type="checkbox"
            className="h-4 w-4 accent-kru-600"
            checked={draft.breakMinutes > 0}
            onChange={(e) => set({ breakMinutes: e.target.checked ? lunch : 0 })}
          />
          Descontar
          <input
            type="number"
            aria-label="Minutos de almuerzo"
            min="1"
            max="240"
            value={draft.breakMinutes || lunch}
            disabled={draft.breakMinutes === 0}
            onChange={(e) => {
              setLunch(Number(e.target.value));
              set({ breakMinutes: Number(e.target.value) });
            }}
            className="w-16 rounded-lg border border-borde-fuerte px-2 py-1 text-center disabled:bg-hueso"
          />
          min sin pago cuando trabaja más de
          <input
            type="number"
            aria-label="Horas a partir de las que se descuenta"
            step="0.5"
            min="0"
            max="24"
            value={hours(draft.breakAfterMinutes)}
            disabled={draft.breakMinutes === 0}
            onChange={(e) => set({ breakAfterMinutes: Math.round(Number(e.target.value) * 60) })}
            className="w-14 rounded-lg border border-borde-fuerte px-2 py-1 text-center disabled:bg-hueso"
          />
          h
        </label>
        <p className="text-[12px] text-gris">No hace falta que marque la salida a almorzar.</p>
      </Step>

      <details className="group rounded-xl border border-borde">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3.5 py-2.5 text-sm [&::-webkit-details-marker]:hidden">
          <span>
            <span className="font-semibold">Ajustes legales</span>
            <span className="text-gris">
              {" "}· nocturna {draft.nightStart}–{draft.nightEnd} · alerta {hours(draft.weeklyOvertimeAlertMinutes)} h extra/semana
            </span>
          </span>
          <span aria-hidden className="text-gris transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-borde p-3.5 text-sm">
          <label className="flex flex-wrap items-center gap-1.5">
            Las horas son nocturnas de
            <TimeField label="Inicio de la noche" value={draft.nightStart} onChange={(nightStart) => set({ nightStart })} />
            a
            <TimeField label="Fin de la noche" value={draft.nightEnd} onChange={(nightEnd) => set({ nightEnd })} />
          </label>
          <label className="flex flex-wrap items-center gap-1.5">
            Avisar a RRHH con más de
            <input
              type="number"
              aria-label="Horas extra por semana para la alerta"
              step="0.5"
              min="0"
              max="168"
              value={hours(draft.weeklyOvertimeAlertMinutes)}
              onChange={(e) => set({ weeklyOvertimeAlertMinutes: Math.round(Number(e.target.value) * 60) })}
              className="w-16 rounded-lg border border-borde-fuerte px-2 py-1 text-center"
            />
            h extra en una semana
          </label>
          <p className="text-[12px] text-gris">Por defecto, los de la LOTTT: nocturna de 19:00 a 05:00 y alerta con más de 10 h.</p>
        </div>
      </details>

      <Example key={JSON.stringify(policy.days)} policy={policy} />

      {schedule && (
        <div className="flex flex-col gap-2 text-[13px]">
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-kru-600" checked={draft.active} onChange={(e) => set({ active: e.target.checked })} />
            Activo (se puede asignar en contratos nuevos)
          </label>
          <p className="text-gris">
            Los cambios aplican también a los turnos ya marcados de quienes tienen este horario. Los recibos de un lote no
            cambian hasta recalcularlo.
          </p>
        </div>
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
