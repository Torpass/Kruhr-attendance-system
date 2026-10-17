"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { caracasDate, formatDay, formatTime, fromCaracasInput, toCaracasInput } from "@/lib/time";
import type { Correction, Shift } from "@/lib/types";

function CorrectionHistory({ companyId, shiftId }: { companyId: string; shiftId: string }) {
  const history = useQuery({
    queryKey: ["companies", companyId, "corrections", shiftId],
    queryFn: () =>
      api<{ corrections: Correction[] }>(`/companies/${companyId}/shifts/${shiftId}/corrections`).then(
        (r) => r.corrections,
      ),
  });
  if (!history.data?.length) return null;
  const range = (s: { clockIn: string; clockOut: string | null }) =>
    `${formatTime(s.clockIn)}–${s.clockOut ? formatTime(s.clockOut) : "…"}`;
  return (
    <div className="mt-5 border-t border-borde pt-4">
      <p className="rotulo text-gris">Historial</p>
      <ul className="mt-2 flex flex-col gap-2 text-[13px]">
        {history.data.map((c) => (
          <li key={c.id} className="rounded-xl border border-borde bg-hueso/60 p-3">
            <p className="tabular-nums">
              {c.before ? range(c.before) : "Creado"} → <span className="font-semibold">{range(c.after)}</span>
            </p>
            <p className="mt-1 text-gris">
              “{c.reason}” · {c.correctedBy.name}, {formatDay(caracasDate(c.createdAt))}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Corrige un turno (`shift`) o agrega uno olvidado (`shift` null). El motivo es obligatorio y
 * queda en el historial; la API lo exige y bloquea los turnos de una nómina validada.
 * `defaultDate` propone el día de un turno nuevo (08:00–17:00).
 */
export function ShiftForm({
  companyId,
  employeeId,
  shift,
  defaultDate,
  onDone,
  onCancel,
}: {
  companyId: string;
  employeeId: string;
  shift: Shift | null;
  defaultDate?: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const queryClient = useQueryClient();

  const save = useMutation({
    mutationFn: (form: FormData) => {
      const clockIn = String(form.get("clockIn") ?? "");
      const clockOut = String(form.get("clockOut") ?? "");
      const reason = String(form.get("reason") ?? "");
      if (shift) {
        return api(`/companies/${companyId}/shifts/${shift.id}`, {
          method: "PATCH",
          body: JSON.stringify({
            clockIn: fromCaracasInput(clockIn),
            ...(clockOut && { clockOut: fromCaracasInput(clockOut) }),
            reason,
          }),
        });
      }
      return api(`/companies/${companyId}/shifts`, {
        method: "POST",
        body: JSON.stringify({
          employeeId,
          clockIn: fromCaracasInput(clockIn),
          clockOut: fromCaracasInput(clockOut),
          reason,
        }),
      });
    },
    onSuccess: () => {
      // Turnos, períodos y el día de hoy dependen del cambio.
      void queryClient.invalidateQueries({ queryKey: ["companies", companyId] });
      onDone();
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(new FormData(event.currentTarget));
  }

  return (
    <form key={shift?.id ?? "new"} onSubmit={onSubmit} className="flex flex-col gap-4">
      <p className="text-[13px] text-gris">Horas de Caracas. El motivo queda en el historial.</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <Input
          label="Entrada"
          name="clockIn"
          type="datetime-local"
          defaultValue={shift ? toCaracasInput(shift.clockIn) : defaultDate && `${defaultDate}T08:00`}
          required
        />
        <Input
          label="Salida"
          name="clockOut"
          type="datetime-local"
          defaultValue={
            shift ? (shift.clockOut ? toCaracasInput(shift.clockOut) : undefined) : defaultDate && `${defaultDate}T17:00`
          }
          required={!shift || shift.clockOut !== null}
        />
      </div>
      <label className="flex flex-col gap-1.5">
        <span className="rotulo text-gris">Motivo (obligatorio)</span>
        <textarea
          name="reason"
          required
          minLength={5}
          maxLength={500}
          rows={3}
          placeholder="Olvidó marcar la salida; confirmado con su supervisor."
          className="rounded-lg border border-borde-fuerte px-3.5 py-2.5 text-sm outline-none placeholder:text-gris-claro focus:border-kru-500 focus:ring-4 focus:ring-kru-100"
        />
      </label>
      {save.isError && (
        <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
          {errorMessage(save.error)}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
        <Button type="submit" disabled={save.isPending}>{save.isPending ? "Guardando…" : "Guardar"}</Button>
      </div>
      {shift && <CorrectionHistory companyId={companyId} shiftId={shift.id} />}
    </form>
  );
}
