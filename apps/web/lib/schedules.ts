import { DEFAULT_POLICY } from "@marcaje/core";
import type { WorkSchedule } from "./types";

export const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];
const SHORT = ["L", "M", "X", "J", "V", "S", "D"];

/** Política sin horario asignado: la regla del enunciado, la misma del motor. */
export const DEFAULT_SCHEDULE: Omit<WorkSchedule, "id" | "code" | "name" | "active"> = DEFAULT_POLICY;

/** 450 → "7,5 h"; 480 → "8 h". */
export const hoursLabel = (minutes: number) =>
  `${(minutes / 60).toLocaleString("es-VE", { maximumFractionDigits: 2 })} h`;

/** Días con la misma jornada, agrupados: "L–V 08:00–17:00 · S 08:00–12:00". */
function weekLabel(days: WorkSchedule["days"]) {
  if (!days) return "";
  const parts: string[] = [];
  let i = 0;
  while (i < 7) {
    const day = days[i];
    let j = i;
    while (j + 1 < 7 && day && days[j + 1]?.start === day.start && days[j + 1]?.end === day.end) j++;
    if (day) parts.push(`${SHORT[i]}${j > i ? `–${SHORT[j]}` : ""} ${day.start}–${day.end}`);
    i = j + 1;
  }
  return parts.join(" · ") || "Sin días laborables";
}

/** Cómo calcula un horario, en frases cortas. */
export function describeSchedule(s: Omit<WorkSchedule, "id" | "code" | "name" | "active">) {
  return {
    week: s.overtimeMode === "schedule" ? weekLabel(s.days) : null,
    overtime:
      s.overtimeMode === "schedule"
        ? "Extra: lo trabajado fuera de la jornada o en días libres"
        : `Extra: lo que pasa de ${hoursLabel(s.ordinaryMinutes)} por turno`,
    rest:
      s.breakMinutes > 0
        ? `Descanso no pagado: ${s.breakMinutes} min en turnos de más de ${hoursLabel(s.breakAfterMinutes)}`
        : "Sin descanso descontado",
    night: `Nocturna: ${s.nightStart}–${s.nightEnd}`,
    alert: `Alerta: más de ${hoursLabel(s.weeklyOvertimeAlertMinutes)} extra por semana`,
  };
}
