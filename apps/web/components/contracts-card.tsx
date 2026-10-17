"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import { formatMoney } from "@/lib/money";
import { addDays, formatDay, todayInCaracas } from "@/lib/time";
import type { Contract, Structure, WorkSchedule } from "@/lib/types";

const selectClass = "rounded-lg border border-borde-fuerte bg-white px-3.5 py-2.5 text-sm";
const GENERAL_RULE = "Regla general (8 h, nocturna 19:00–05:00)";

function ScheduleSelect({ schedules, defaultValue }: { schedules: WorkSchedule[]; defaultValue?: string }) {
  return (
    <label className="flex flex-col gap-1.5">
      <span className="rotulo text-gris">Horario</span>
      <select name="scheduleId" defaultValue={defaultValue ?? ""} className={selectClass}>
        <option value="">{GENERAL_RULE}</option>
        {schedules.filter((s) => s.active).map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
    </label>
  );
}

/** Contratos del colaborador: salario mensual, estructura y horario vigentes entre dos fechas. */
export function ContractsCard({ companyId, employeeId }: { companyId: string; employeeId: string }) {
  const queryClient = useQueryClient();
  const company = useCurrentCompany(companyId);
  const groupId = company?.group.id;
  const url = `/companies/${companyId}/employees/${employeeId}/contracts`;
  const [changing, setChanging] = useState<Contract | null>(null);

  const contracts = useQuery({
    queryKey: ["companies", companyId, "contracts", employeeId],
    queryFn: () => api<{ contracts: Contract[] }>(url).then((r) => r.contracts),
  });
  const structures = useQuery({
    queryKey: ["groups", groupId, "structures"],
    queryFn: () => api<{ structures: Structure[] }>(`/groups/${groupId}/structures`).then((r) => r.structures),
    enabled: Boolean(groupId),
  });
  const schedules = useQuery({
    queryKey: ["groups", groupId, "schedules"],
    queryFn: () => api<{ schedules: WorkSchedule[] }>(`/groups/${groupId}/schedules`).then((r) => r.schedules),
    enabled: Boolean(groupId),
  });

  // El horario cambia el cálculo de turnos y períodos: se refresca todo lo de la empresa.
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["companies", companyId] });

  const save = useMutation({
    mutationFn: ({ path = "", method, body }: { path?: string; method: string; body: unknown }) =>
      api(`${url}${path}`, { method, body: JSON.stringify(body) }),
    onSuccess: () => void refresh(),
  });

  /**
   * Cambiar de horario: la API cierra el contrato el día anterior y abre uno igual desde la fecha,
   * en una transacción. Los días anteriores se siguen calculando con el horario que tenían.
   */
  const changeSchedule = useMutation({
    mutationFn: ({ contract, scheduleId, from }: { contract: Contract; scheduleId: string | null; from: string }) =>
      api(`${url}/${contract.id}/schedule`, { method: "POST", body: JSON.stringify({ scheduleId, dateFrom: from }) }),
    onSuccess: () => {
      setChanging(null);
      void refresh();
    },
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      method: "POST",
      body: {
        structureId: form.get("structureId"),
        scheduleId: form.get("scheduleId") || null,
        wage: Number(form.get("wage")),
        dateStart: form.get("dateStart"),
      },
    });
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!changing) return;
    const form = new FormData(event.currentTarget);
    changeSchedule.mutate({
      contract: changing,
      scheduleId: String(form.get("scheduleId")) || null,
      from: String(form.get("from")),
    });
  }

  const today = todayInCaracas();
  const current = contracts.data?.find((c) => c.dateStart <= today && (!c.dateEnd || c.dateEnd >= today));

  return (
    <Card>
      <h2 className="font-semibold">Contrato</h2>
      <ul className="mt-3 flex flex-col gap-2">
        {contracts.data?.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-borde px-3.5 py-2.5 text-sm">
            <span className="min-w-0 flex-1">
              <b className="tabular-nums">Bs. {formatMoney(c.wage)}</b> mensual · {c.structure.name}
              <span className="block text-[13px] text-gris">
                Horario: {c.schedule?.name ?? GENERAL_RULE}
              </span>
              <span className="block text-[13px] text-gris first-letter:uppercase">
                {formatDay(c.dateStart)} → {c.dateEnd ? formatDay(c.dateEnd) : "sin fin"}
              </span>
            </span>
            {c.id === current?.id && <Badge tone="exito">Vigente</Badge>}
            {!c.dateEnd && (
              <>
                <Button
                  variant="secondary"
                  disabled={!schedules.data}
                  onClick={() => {
                    changeSchedule.reset();
                    setChanging(c);
                  }}
                >
                  Cambiar horario
                </Button>
                <Button
                  variant="secondary"
                  disabled={save.isPending}
                  onClick={() => {
                    const dateEnd = window.prompt("Fecha de fin (AAAA-MM-DD)", today);
                    if (dateEnd) save.mutate({ path: `/${c.id}`, method: "PATCH", body: { dateEnd } });
                  }}
                >
                  Cerrar
                </Button>
              </>
            )}
          </li>
        ))}
        {contracts.data?.length === 0 && (
          <li className="text-sm text-gris">Sin contrato: no entra en los lotes de nómina.</li>
        )}
      </ul>
      {structures.data && structures.data.length > 0 && !current && (
        <form onSubmit={onCreate} className="mt-4 grid gap-3 border-t border-borde pt-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5">
            <span className="rotulo text-gris">Estructura</span>
            <select name="structureId" className={selectClass}>
              {structures.data.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <ScheduleSelect schedules={schedules.data ?? []} />
          <Input label="Salario mensual (Bs.)" name="wage" type="number" step="0.01" min="0.01" required />
          <Input label="Desde" name="dateStart" type="date" defaultValue={today} required />
          <div className="sm:col-span-2"><Button type="submit" disabled={save.isPending}>Crear contrato</Button></div>
        </form>
      )}
      {save.isError && (
        <p role="alert" className="mt-3 rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
          {errorMessage(save.error)}
        </p>
      )}

      <Dialog open={changing !== null} onClose={() => setChanging(null)} title="Cambiar horario">
        {changing && (
          <form onSubmit={onChange} className="flex flex-col gap-4">
            <p className="text-[13px] text-gris">
              El contrato actual se cierra el día anterior y se abre uno igual (estructura y salario) con el horario nuevo.
              Los días anteriores se siguen calculando con el horario que tenían.
            </p>
            <ScheduleSelect schedules={schedules.data ?? []} defaultValue={changing.schedule?.id} />
            <Input
              label="Desde"
              name="from"
              type="date"
              min={addDays(changing.dateStart, 1)}
              defaultValue={today > changing.dateStart ? today : addDays(changing.dateStart, 1)}
              required
            />
            {changeSchedule.isError && (
              <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
                {errorMessage(changeSchedule.error)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setChanging(null)}>Cancelar</Button>
              <Button type="submit" disabled={changeSchedule.isPending}>
                {changeSchedule.isPending ? "Guardando…" : "Cambiar horario"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </Card>
  );
}
