import { DEFAULT_POLICY } from "@marcaje/core";
import type { WorkSchedule } from "./types";

export const WEEKDAYS = ["Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado", "Domingo"];

/** Política sin horario asignado: la regla del enunciado, la misma del motor. */
export const DEFAULT_SCHEDULE: Omit<WorkSchedule, "id" | "code" | "name" | "active"> = DEFAULT_POLICY;

/** 450 → "7,5 h"; 480 → "8 h". */
export const hoursLabel = (minutes: number) =>
  `${(minutes / 60).toLocaleString("es-VE", { maximumFractionDigits: 2 })} h`;
