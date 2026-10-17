"use client";

import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Icon } from "@/components/ui/icons";
import { addDays, todayInCaracas } from "@/lib/time";

type Kind = "week" | "half" | "range";

const KINDS: { value: Kind; label: string }[] = [
  { value: "week", label: "Semana" },
  { value: "half", label: "Quincena" },
  { value: "range", label: "Rango" },
];

const fieldClass = "rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-sm";

const shortDay = new Intl.DateTimeFormat("es-VE", { timeZone: "UTC", day: "numeric", month: "short" });
const monthName = new Intl.DateTimeFormat("es-VE", { timeZone: "UTC", month: "long", year: "numeric" });
const asDate = (localDate: string) => new Date(`${localDate}T00:00:00Z`);

/** La quincena la decide el día: del 1 al 15 es la primera. */
const halfOf = (date: string) => (Number(date.slice(8)) <= 15 ? "first_half" : "second_half");

function periodTitle(kind: Kind, from: string, to: string) {
  const range = `${shortDay.format(asDate(from))} – ${shortDay.format(asDate(to))} ${from.slice(0, 4)}`;
  if (kind === "half") {
    const half = halfOf(from) === "first_half" ? "1.ª" : "2.ª";
    return { title: `${half} quincena de ${monthName.format(asDate(from))}`, range };
  }
  return { title: kind === "week" ? `Semana del ${range}` : range, range: null };
}

/**
 * Estado del selector de período. `params` es la consulta para la API (`kind` y `date`, o
 * `from` y `to`); el período exacto lo resuelve la API y se le pasa a `<PeriodPicker>`.
 */
export function usePeriodPicker() {
  const today = todayInCaracas();
  const [kind, setKind] = useState<Kind>("week");
  const [date, setDate] = useState(today);
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const apiKind = kind === "half" ? halfOf(date) : kind;
  const params = new URLSearchParams(kind === "range" ? { from, to } : { kind: apiKind, date }).toString();
  return { today, kind, setKind, date, setDate, from, setFrom, to, setTo, apiKind, params };
}

export type PeriodPickerState = ReturnType<typeof usePeriodPicker>;

/** Semana, quincena o rango, con flechas, "Hoy" y el período como título. */
export function PeriodPicker({ picker, period }: { picker: PeriodPickerState; period?: { from: string; to: string } }) {
  const { today, kind, setKind, date, setDate, from, setFrom, to, setTo } = picker;
  const heading = period && periodTitle(kind, period.from, period.to);
  const isCurrent = period && today >= period.from && today <= period.to;

  /** Período anterior o siguiente: el día justo antes del inicio o después del fin. */
  function step(direction: -1 | 1) {
    if (!period) return;
    setDate(direction < 0 ? addDays(period.from, -1) : addDays(period.to, 1));
  }

  return (
    <Card className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="radiogroup" aria-label="Tipo de período" className="grid grid-cols-3 gap-1 rounded-lg bg-hueso p-1">
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
                onChange={() => {
                  setKind(option.value);
                  if (option.value === "range" && period) {
                    setFrom(period.from);
                    setTo(period.to);
                  }
                }}
                className="sr-only"
              />
              {option.label}
            </label>
          ))}
        </div>
        {kind === "range" ? (
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="from">Desde</label>
            <input id="from" type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={fieldClass} />
            <span className="text-gris">→</span>
            <label className="sr-only" htmlFor="to">Hasta</label>
            <input id="to" type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={fieldClass} />
          </div>
        ) : (
          <label className="flex items-center gap-2 text-[13px] text-gris">
            Ir a una fecha
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={fieldClass} />
          </label>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-borde pt-4">
        {kind !== "range" && (
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={!period}
            aria-label="Período anterior"
            className="grid h-9 w-9 place-items-center rounded-lg border border-borde-fuerte text-gris hover:border-kru-300 hover:text-kru-700"
          >
            <Icon name="chevron" className="h-4 w-4 rotate-180" />
          </button>
        )}
        <div className="min-w-0 flex-1 px-1">
          <p className="text-base font-bold tracking-[-0.02em] first-letter:uppercase sm:text-lg">{heading?.title ?? "…"}</p>
          {heading?.range && <p className="text-[13px] text-gris">{heading.range}</p>}
        </div>
        {kind !== "range" && (
          <>
            {!isCurrent && (
              <button
                type="button"
                onClick={() => setDate(today)}
                className="rounded-lg px-3 py-2 text-sm font-semibold text-kru-700 hover:bg-kru-50"
              >
                Hoy
              </button>
            )}
            <button
              type="button"
              onClick={() => step(1)}
              disabled={!period}
              aria-label="Período siguiente"
              className="grid h-9 w-9 place-items-center rounded-lg border border-borde-fuerte text-gris hover:border-kru-300 hover:text-kru-700"
            >
              <Icon name="chevron" className="h-4 w-4" />
            </button>
          </>
        )}
      </div>
    </Card>
  );
}
