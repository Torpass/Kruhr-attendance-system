"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ContractsCard } from "@/components/contracts-card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import {
  addDays,
  caracasDate,
  formatDay,
  formatHours,
  formatTime,
  fromCaracasInput,
  toCaracasInput,
  todayInCaracas,
} from "@/lib/time";
import type { Correction, Employee, Shift } from "@/lib/types";

type Editing = { mode: "correct"; shift: Shift } | { mode: "create" } | null;

function ErrorBox({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
      {errorMessage(error)}
    </p>
  );
}

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

export default function EmployeePage() {
  const { companyId, employeeId } = useParams<{ companyId: string; employeeId: string }>();
  const queryClient = useQueryClient();
  const { data: user } = useSession();
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";

  const [to, setTo] = useState(todayInCaracas);
  const [from, setFrom] = useState(() => addDays(todayInCaracas(), -13));
  const [editing, setEditing] = useState<Editing>(null);
  const [resettingPin, setResettingPin] = useState(false);

  const employee = useQuery({
    queryKey: ["companies", companyId, "employees", employeeId],
    queryFn: () =>
      api<{ employee: Employee }>(`/companies/${companyId}/employees/${employeeId}`).then((r) => r.employee),
  });
  const shifts = useQuery({
    queryKey: ["companies", companyId, "shifts", employeeId, from, to],
    queryFn: () =>
      api<{ shifts: Shift[] }>(
        `/companies/${companyId}/shifts?from=${from}&to=${to}&employeeId=${employeeId}`,
      ).then((r) => r.shifts),
    enabled: from <= to,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["companies", companyId] });

  const save = useMutation({
    mutationFn: async (form: FormData) => {
      const clockIn = String(form.get("clockIn") ?? "");
      const clockOut = String(form.get("clockOut") ?? "");
      const reason = String(form.get("reason") ?? "");
      if (editing?.mode === "correct") {
        return api(`/companies/${companyId}/shifts/${editing.shift.id}`, {
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
      setEditing(null);
      void invalidate();
    },
  });

  const update = useMutation({
    mutationFn: (body: { active?: boolean; pin?: string }) =>
      api(`/companies/${companyId}/employees/${employeeId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setResettingPin(false);
      void invalidate();
    },
  });

  function openEditor(next: Editing) {
    save.reset();
    setEditing(next);
  }

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    save.mutate(new FormData(event.currentTarget));
  }

  if (employee.isError) return <EmptyState>{errorMessage(employee.error)}</EmptyState>;
  if (!employee.data) return <p className="text-sm text-gris">Cargando…</p>;
  const person = employee.data;
  const editingShift = editing?.mode === "correct" ? editing.shift : null;

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/rrhh/${companyId}/colaboradores`} className="text-sm font-semibold text-kru-700 hover:text-kru-800">
        ← Colaboradores
      </Link>

      <Card className="flex flex-wrap items-center gap-4">
        <Avatar name={person.name} />
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-bold tracking-[-0.02em]">{person.name}</h1>
          <p className="text-sm text-gris tabular-nums">C.I. {person.cedula}</p>
        </div>
        {person.active ? <Badge tone="exito">Activo</Badge> : <Badge tone="error">Inactivo</Badge>}
        {isAdmin && (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => { update.reset(); setResettingPin(true); }}>
              Restablecer PIN
            </Button>
            <Button
              variant="secondary"
              disabled={update.isPending}
              onClick={() => update.mutate({ active: !person.active })}
            >
              {person.active ? "Desactivar" : "Reactivar"}
            </Button>
          </div>
        )}
      </Card>

      <ContractsCard companyId={companyId} employeeId={employeeId} />

      <Card className="p-0 sm:p-0">
        <div className="flex flex-wrap items-end gap-3 border-b border-borde p-4">
          <h2 className="mr-auto font-semibold">Turnos</h2>
          <label className="flex flex-col gap-1">
            <span className="rotulo text-gris">Desde</span>
            <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)}
              className="rounded-lg border border-borde-fuerte px-3 py-2 text-sm" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="rotulo text-gris">Hasta</span>
            <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)}
              className="rounded-lg border border-borde-fuerte px-3 py-2 text-sm" />
          </label>
          <Button onClick={() => openEditor({ mode: "create" })}>Agregar turno</Button>
        </div>

        {shifts.isError ? (
          <div className="p-4"><EmptyState>{errorMessage(shifts.error)}</EmptyState></div>
        ) : !shifts.data ? (
          <p className="p-4 text-sm text-gris">Cargando…</p>
        ) : shifts.data.length === 0 ? (
          <div className="p-4"><EmptyState>No hay turnos en estas fechas.</EmptyState></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[40rem] text-sm">
              <thead>
                <tr className="rotulo text-left text-gris">
                  <th className="px-4 py-2.5 font-semibold">Día</th>
                  <th className="px-4 py-2.5 font-semibold">Entrada → salida</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Total</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Extra diurna</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Extra nocturna</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Nocturna ord.</th>
                  <th className="px-4 py-2.5" />
                </tr>
              </thead>
              <tbody className="divide-y divide-borde">
                {shifts.data.map((shift) => (
                  <tr key={shift.id}>
                    <td className="px-4 py-3 first-letter:uppercase">{formatDay(shift.date)}</td>
                    <td className="px-4 py-3 tabular-nums">
                      {formatTime(shift.clockIn)} → {shift.clockOut ? formatTime(shift.clockOut) : "…"}
                      <span className="ml-2 inline-flex gap-1 align-middle">
                        {!shift.clockOut && <Badge tone="alerta">Abierto</Badge>}
                        {(shift.corrections ?? 0) > 0 && <Badge>Corregido</Badge>}
                      </span>
                    </td>
                    {shift.minutes ? (
                      <>
                        <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatHours(shift.minutes.worked)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatHours(shift.minutes.overtimeDay)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatHours(shift.minutes.overtimeNight)}</td>
                        <td className="px-4 py-3 text-right tabular-nums">{formatHours(shift.minutes.nightOrdinary)}</td>
                      </>
                    ) : (
                      <td colSpan={4} className="px-4 py-3 text-right text-gris">en curso</td>
                    )}
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={() => openEditor({ mode: "correct", shift })}
                        className="text-sm font-semibold text-kru-700 hover:text-kru-800"
                      >
                        Corregir
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={editingShift ? "Corregir turno" : "Agregar turno"}
      >
        {editing && (
          <form key={editingShift?.id ?? "new"} onSubmit={onSave} className="flex flex-col gap-4">
            <p className="text-[13px] text-gris">Horas de Caracas. El motivo queda en el historial.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Entrada"
                name="clockIn"
                type="datetime-local"
                defaultValue={editingShift ? toCaracasInput(editingShift.clockIn) : undefined}
                required
              />
              <Input
                label="Salida"
                name="clockOut"
                type="datetime-local"
                defaultValue={editingShift?.clockOut ? toCaracasInput(editingShift.clockOut) : undefined}
                required={!editingShift || editingShift.clockOut !== null}
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
                className="rounded-lg border border-borde-fuerte px-3.5 py-2.5 text-sm outline-none focus:border-kru-500 focus:ring-4 focus:ring-kru-100"
              />
            </label>
            {save.isError && <ErrorBox error={save.error} />}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Guardando…" : "Guardar"}</Button>
            </div>
            {editingShift && <CorrectionHistory companyId={companyId} shiftId={editingShift.id} />}
          </form>
        )}
      </Dialog>

      <Dialog open={resettingPin} onClose={() => setResettingPin(false)} title="Restablecer PIN">
        <form
          onSubmit={(event) => {
            event.preventDefault();
            update.mutate({ pin: String(new FormData(event.currentTarget).get("pin")) });
          }}
          className="flex flex-col gap-4"
        >
          <Input label="PIN nuevo" name="pin" inputMode="numeric" pattern="\d{4,6}" title="De 4 a 6 dígitos" required />
          {update.isError && <ErrorBox error={update.error} />}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setResettingPin(false)}>Cancelar</Button>
            <Button type="submit" disabled={update.isPending}>Guardar</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
