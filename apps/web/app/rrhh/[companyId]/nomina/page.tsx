"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import { formatMoney, RUN_STATE } from "@/lib/money";
import { formatDay, todayInCaracas } from "@/lib/time";
import type { PayrollRun, Structure } from "@/lib/types";

const KINDS = [
  { value: "first_half", label: "1.ª quincena" },
  { value: "second_half", label: "2.ª quincena" },
  { value: "week", label: "Semana" },
] as const;

const fieldClass = "rounded-lg border border-borde-fuerte bg-white px-3.5 py-2.5 text-sm";

export default function NominaPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const company = useCurrentCompany(companyId);
  const groupId = company?.group.id;
  const [creating, setCreating] = useState(false);

  const runs = useQuery({
    queryKey: ["companies", companyId, "payroll-runs"],
    queryFn: () => api<{ runs: PayrollRun[] }>(`/companies/${companyId}/payroll-runs`).then((r) => r.runs),
  });
  const structures = useQuery({
    queryKey: ["groups", groupId, "structures"],
    queryFn: () => api<{ structures: Structure[] }>(`/groups/${groupId}/structures`).then((r) => r.structures),
    enabled: Boolean(groupId),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      api<{ run: PayrollRun }>(`/companies/${companyId}/payroll-runs`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: ({ run }) => {
      void queryClient.invalidateQueries({ queryKey: ["companies", companyId, "payroll-runs"] });
      router.push(`/rrhh/${companyId}/nomina/${run.id}`);
    },
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  }

  const activeStructures = structures.data?.filter((s) => s.active) ?? [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.025em]">Nómina</h1>
          <p className="mt-1 text-sm text-gris">
            Cada lote calcula los recibos de un período con las horas de Marcaje. Al validarlo, los
            turnos de ese período ya no se pueden corregir.
          </p>
        </div>
        <div className="flex gap-2">
          <Link
            href={`/rrhh/${companyId}/configuracion/estructuras`}
            className="inline-flex items-center rounded-lg border border-borde-fuerte bg-white px-4 py-2.5 text-sm font-semibold hover:border-kru-300"
          >
            Estructuras salariales
          </Link>
          <Button onClick={() => { create.reset(); setCreating(true); }}>Nuevo lote</Button>
        </div>
      </div>

      <Card flush>
        {runs.isError ? (
          <div className="p-4"><EmptyState>{errorMessage(runs.error)}</EmptyState></div>
        ) : !runs.data ? (
          <p className="p-4 text-sm text-gris">Cargando…</p>
        ) : runs.data.length === 0 ? (
          <div className="p-4"><EmptyState>Todavía no hay lotes de nómina.</EmptyState></div>
        ) : (
          <ul className="divide-y divide-borde">
            {runs.data.map((run) => (
              <li key={run.id}>
                <Link
                  href={`/rrhh/${companyId}/nomina/${run.id}`}
                  className="flex flex-wrap items-center gap-3 px-4 py-3 transition-colors hover:bg-hueso/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-semibold">{run.name}</span>
                    <span className="block text-[13px] text-gris first-letter:uppercase">
                      {formatDay(run.dateFrom)} → {formatDay(run.dateTo)} · {String(run.payslips)} recibo(s)
                    </span>
                  </span>
                  <span className="text-sm font-semibold tabular-nums">Bs. {formatMoney(run.net ?? 0)}</span>
                  <Badge tone={RUN_STATE[run.state].tone}>{RUN_STATE[run.state].label}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo lote de nómina">
        {activeStructures.length === 0 ? (
          <div className="flex flex-col gap-3 text-sm">
            <p>El grupo todavía no tiene estructuras salariales.</p>
            <Link href={`/rrhh/${companyId}/configuracion/estructuras`} className="font-semibold text-kru-700 hover:text-kru-800">
              Crear una estructura →
            </Link>
          </div>
        ) : (
          <form onSubmit={onCreate} className="flex flex-col gap-4">
            <label className="flex flex-col gap-1.5">
              <span className="rotulo text-gris">Estructura</span>
              <select name="structureId" className={fieldClass} required>
                {activeStructures.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </select>
            </label>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="rotulo text-gris">Período</span>
                <select name="kind" className={fieldClass} defaultValue="first_half">
                  {KINDS.map((k) => (
                    <option key={k.value} value={k.value}>{k.label}</option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="rotulo text-gris">Un día del período</span>
                <input type="date" name="date" defaultValue={todayInCaracas()} className={fieldClass} required />
              </label>
            </div>
            <p className="text-[13px] text-gris">
              Se calcula un recibo por cada colaborador con contrato en esta estructura durante el período.
            </p>
            {create.isError && (
              <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
                {errorMessage(create.error)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Calculando…" : "Calcular lote"}</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
