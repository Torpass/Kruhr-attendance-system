"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { WEEKDAYS } from "@/lib/schedules";
import { clockTime12, formatHours, formatTime12 } from "@/lib/time";
import type { MyToday } from "@/lib/types";

/** Reloj en 12 horas: "1:50:17" y "PM" por separado. */
const clockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Caracas",
  hour: "numeric",
  minute: "2-digit",
  second: "2-digit",
  hour12: true,
});
function clockParts(now: Date) {
  const parts = clockFormatter.formatToParts(now);
  const time = parts
    .filter((p) => p.type === "hour" || p.type === "minute" || p.type === "second" || p.value === ":")
    .map((p) => p.value)
    .join("");
  const period = parts.find((p) => p.type === "dayPeriod")?.value ?? "";
  return { time, period };
}
const dateFormatter = new Intl.DateTimeFormat("es-VE", {
  timeZone: "America/Caracas",
  weekday: "long",
  day: "numeric",
  month: "long",
});

// Reloj como fuente externa: un tick por segundo, sin setState dentro de un effect.
const subscribeToClock = (onTick: () => void) => {
  const timer = setInterval(onTick, 1000);
  return () => clearInterval(timer);
};
const currentSecond = () => Math.floor(Date.now() / 1000);

/** Hora de Caracas en vivo. La hora del marcaje la pone el servidor, no este reloj. */
function LiveClock() {
  const second = useSyncExternalStore(subscribeToClock, currentSecond, () => null);
  const now = second === null ? null : new Date(second * 1000);
  const clock = now ? clockParts(now) : null;
  return (
    <div className="text-center">
      <p className="text-[3.25rem] font-extrabold leading-none tracking-[-0.03em] tabular-nums">
        {clock ? clock.time : "--:--:--"}
        {clock && <span className="ml-2 align-top text-xl font-bold tracking-normal text-gris">{clock.period}</span>}
      </p>
      <p className="mt-2 text-sm first-letter:uppercase text-gris">{now ? dateFormatter.format(now) : " "}</p>
    </div>
  );
}

/** Su jornada de hoy según el horario del contrato. */
function TodaySchedule({ schedule }: { schedule: MyToday["schedule"] | undefined }) {
  if (!schedule) return null;
  return (
    <div className="mx-auto mt-4 w-fit rounded-xl bg-kru-50 px-4 py-2 text-center">
      {schedule.today ? (
        <>
          <p className="rotulo text-kru-700">Tu horario hoy</p>
          <p className="mt-0.5 font-semibold tabular-nums">
            {clockTime12(schedule.today.start)} – {clockTime12(schedule.today.end)}
          </p>
        </>
      ) : schedule.week ? (
        <p className="text-sm font-semibold text-kru-800">Hoy es tu día libre</p>
      ) : (
        <p className="text-sm text-gris">Sin horario fijo</p>
      )}
    </div>
  );
}

/** Su semana: entrada y salida de cada día, con hoy destacado. */
function MyWeek({ week, date }: { week: NonNullable<NonNullable<MyToday["schedule"]>["week"]>; date: string }) {
  const todayIndex = (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7;
  return (
    <Card>
      <h2 className="font-semibold">Mi horario</h2>
      <ul className="mt-3 flex flex-col gap-1">
        {WEEKDAYS.map((label, i) => {
          const day = week[i];
          const isToday = i === todayIndex;
          return (
            <li
              key={label}
              className={`flex items-center justify-between rounded-lg px-3 py-2 text-sm ${
                isToday ? "bg-kru-50 font-semibold text-kru-800" : ""
              }`}
            >
              <span>
                {label}
                {isToday && <span className="ml-2 text-[12px] font-medium">(hoy)</span>}
              </span>
              <span className={`tabular-nums ${day ? "" : "text-gris-claro"}`}>
                {day ? `${clockTime12(day.start)} – ${clockTime12(day.end)}` : "Libre"}
              </span>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}

export default function MarcarPage() {
  const queryClient = useQueryClient();
  const today = useQuery({
    queryKey: ["me", "today"],
    queryFn: () => api<MyToday>("/me/today"),
    refetchInterval: 60_000,
  });
  const punch = useMutation({
    mutationFn: (action: "clock-in" | "clock-out") =>
      api(`/me/${action}`, { method: "POST" }),
    onSettled: () => queryClient.invalidateQueries({ queryKey: ["me"] }),
  });

  const open = today.data?.openShift ?? null;
  const stale = today.data?.openShiftIsStale ?? false;
  const action = open ? "clock-out" : "clock-in";

  return (
    <div className="flex flex-col gap-4">
      <Card className="shadow-kru-md">
        <LiveClock />

        <TodaySchedule schedule={today.data?.schedule} />

        <div className="mt-5 flex items-center justify-center gap-2" aria-live="polite">
          {today.isPending ? (
            <Badge>Cargando</Badge>
          ) : stale ? (
            <Badge tone="alerta">Turno sin salida</Badge>
          ) : open ? (
            <>
              <span className="h-1.5 w-1.5 rounded-full bg-exito" aria-hidden />
              <span className="text-sm font-medium">
                Dentro desde las <span className="tabular-nums">{formatTime12(open.clockIn)}</span>
              </span>
            </>
          ) : (
            <span className="text-sm font-medium text-gris">Fuera de turno</span>
          )}
        </div>

        {stale ? (
          <p className="mt-4 rounded-lg bg-alerta-fondo px-3.5 py-2.5 text-sm text-alerta-texto">
            Tu turno anterior quedó sin salida. Pide a RRHH que lo corrija para poder marcar de
            nuevo.
          </p>
        ) : (
          <Button
            size="lg"
            className="mt-6 w-full shadow-kru"
            disabled={today.isPending || punch.isPending}
            onClick={() => punch.mutate(action)}
          >
            {punch.isPending ? "Marcando…" : open ? "Marcar salida" : "Marcar entrada"}
          </Button>
        )}

        {punch.isError && (
          <p role="alert" className="mt-3 rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
            {errorMessage(punch.error)}
          </p>
        )}
      </Card>

      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">Hoy</h2>
          <span className="flex gap-3">
            <Link href="/marcar/recibos" className="text-sm font-semibold text-kru-700 hover:text-kru-800">
              Mis recibos
            </Link>
            <Link href="/marcar/historial" className="text-sm font-semibold text-kru-700 hover:text-kru-800">
              Historial
            </Link>
          </span>
        </div>
        <div className="mt-3">
          {today.data && today.data.shifts.length > 0 ? (
            <ul className="flex flex-col gap-2">
              {today.data.shifts.map((shift) => (
                <li
                  key={shift.id}
                  className="flex items-center justify-between rounded-xl border border-borde px-3.5 py-2.5 text-sm"
                >
                  <span className="tabular-nums">
                    {formatTime12(shift.clockIn)} → {shift.clockOut ? formatTime12(shift.clockOut) : "…"}
                  </span>
                  <span className="font-medium tabular-nums">
                    {shift.minutes ? `${formatHours(shift.minutes.worked)} h` : "en curso"}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>Todavía no has marcado hoy.</EmptyState>
          )}
        </div>
      </Card>

      {today.data?.schedule?.week && <MyWeek week={today.data.schedule.week} date={today.data.date} />}
    </div>
  );
}
