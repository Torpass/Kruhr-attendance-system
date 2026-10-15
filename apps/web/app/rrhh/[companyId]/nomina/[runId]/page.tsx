"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { PayslipLines } from "@/components/payslip-lines";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState, Stat } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import { formatMoney, RUN_STATE } from "@/lib/money";
import { formatDay, formatHours } from "@/lib/time";
import type { InputType, PayrollRun, PayslipDetail, PayslipSummary } from "@/lib/types";

type Action = "recompute" | "validate" | "pay" | "cancel";

const ACTIONS: Record<PayrollRun["state"], { action: Action; label: string; primary?: boolean; confirm?: string }[]> = {
  computed: [
    { action: "recompute", label: "Recalcular" },
    { action: "cancel", label: "Anular", confirm: "¿Anular este lote?" },
    {
      action: "validate",
      label: "Validar",
      primary: true,
      confirm: "Al validar, los turnos de este período ya no se pueden corregir. ¿Continuar?",
    },
  ],
  validated: [
    { action: "cancel", label: "Anular", confirm: "¿Anular este lote validado? Se desbloquean las correcciones." },
    { action: "pay", label: "Marcar como pagado", primary: true },
  ],
  paid: [],
  cancelled: [],
};

const HOUR_LABELS: Record<string, string> = {
  WORK: "Ordinarias",
  NIGHT: "Nocturnas ord.",
  OT_DAY: "Extra diurnas",
  OT_NIGHT: "Extra nocturnas",
};

function PayslipDialog({
  companyId,
  payslipId,
  editable,
  inputTypes,
  onClose,
}: {
  companyId: string;
  payslipId: string;
  editable: boolean;
  inputTypes: InputType[];
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const slip = useQuery({
    queryKey: ["companies", companyId, "payslips", payslipId],
    queryFn: () => api<{ payslip: PayslipDetail }>(`/companies/${companyId}/payslips/${payslipId}`).then((r) => r.payslip),
  });
  const save = useMutation({
    mutationFn: (inputs: Record<string, number>) =>
      api(`/companies/${companyId}/payslips/${payslipId}/inputs`, { method: "PUT", body: JSON.stringify({ inputs }) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["companies", companyId] }),
  });

  function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const inputs = Object.fromEntries(
      inputTypes.map((type) => [type.code, Number(form.get(type.code) || 0)]),
    );
    save.mutate(inputs);
  }

  const data = slip.data;
  return (
    <Dialog open size="lg" onClose={onClose} title={data ? `Recibo de ${data.employee.name}` : "Recibo"}>
      {!data ? (
        <p className="text-sm text-gris">Cargando…</p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-[13px] text-gris tabular-nums">
            C.I. {data.employee.cedula} · Salario mensual Bs. {formatMoney(data.wage)}
          </p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {Object.entries(HOUR_LABELS).map(([code, label]) => (
              <div key={code} className="rounded-xl border border-borde bg-hueso/60 p-2.5">
                <p className="rotulo text-gris">{label}</p>
                <p className="mt-1 font-semibold tabular-nums">{formatHours(data.workedMinutes[code] ?? 0)} h</p>
              </div>
            ))}
          </div>
          <PayslipLines lines={data.lines} earnings={data.earnings} deductions={data.deductions} net={data.net} />
          {inputTypes.length > 0 && (
            <form key={JSON.stringify(data.inputs)} onSubmit={onSave} className="flex flex-col gap-3 border-t border-borde pt-4">
              <p className="rotulo text-gris">Entradas manuales</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {inputTypes.map((type) => (
                  <label key={type.code} className="flex flex-col gap-1.5">
                    <span className="text-[13px] text-gris">{type.name} ({type.code})</span>
                    <input
                      type="number"
                      step="0.01"
                      name={type.code}
                      defaultValue={data.inputs[type.code] ?? ""}
                      disabled={!editable}
                      className="rounded-lg border border-borde-fuerte px-3.5 py-2 text-sm tabular-nums disabled:bg-hueso"
                    />
                  </label>
                ))}
              </div>
              {save.isError && (
                <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
                  {errorMessage(save.error)}
                </p>
              )}
              {editable && (
                <div className="flex justify-end">
                  <Button type="submit" disabled={save.isPending}>{save.isPending ? "Recalculando…" : "Guardar y recalcular"}</Button>
                </div>
              )}
            </form>
          )}
        </div>
      )}
    </Dialog>
  );
}

export default function RunPage() {
  const { companyId, runId } = useParams<{ companyId: string; runId: string }>();
  const queryClient = useQueryClient();
  const company = useCurrentCompany(companyId);
  const [open, setOpen] = useState<string | null>(null);

  const run = useQuery({
    queryKey: ["companies", companyId, "payroll-runs", runId],
    queryFn: () => api<{ run: PayrollRun & { payslips: PayslipSummary[] } }>(`/companies/${companyId}/payroll-runs/${runId}`).then((r) => r.run),
  });
  const inputTypes = useQuery({
    queryKey: ["groups", company?.group.id, "input-types"],
    queryFn: () => api<{ inputTypes: InputType[] }>(`/groups/${company!.group.id}/input-types`).then((r) => r.inputTypes),
    enabled: Boolean(company),
  });
  const act = useMutation({
    mutationFn: (action: Action) => api(`/companies/${companyId}/payroll-runs/${runId}/${action}`, { method: "POST" }),
    onSettled: () => void queryClient.invalidateQueries({ queryKey: ["companies", companyId] }),
  });

  if (run.isError) return <EmptyState>{errorMessage(run.error)}</EmptyState>;
  if (!run.data) return <p className="text-sm text-gris">Cargando…</p>;
  const data = run.data;
  const sum = (key: "earnings" | "deductions" | "net") => data.payslips.reduce((total, s) => total + s[key], 0);

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/rrhh/${companyId}/nomina`} className="text-sm font-semibold text-kru-700 hover:text-kru-800">
        ← Nómina
      </Link>

      <Card className="flex flex-wrap items-center gap-3">
        <div className="mr-auto">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-bold tracking-[-0.02em]">{data.name}</h1>
            <Badge tone={RUN_STATE[data.state].tone}>{RUN_STATE[data.state].label}</Badge>
          </div>
          <p className="mt-1 text-sm text-gris first-letter:uppercase">
            {formatDay(data.dateFrom)} → {formatDay(data.dateTo)} · {data.structure.name}
          </p>
        </div>
        {ACTIONS[data.state].map(({ action, label, primary, confirm }) => (
          <Button
            key={action}
            variant={primary ? "primary" : "secondary"}
            disabled={act.isPending}
            onClick={() => {
              if (!confirm || window.confirm(confirm)) act.mutate(action);
            }}
          >
            {label}
          </Button>
        ))}
      </Card>
      {act.isError && (
        <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
          {errorMessage(act.error)}
        </p>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Recibos" value={data.payslips.length} />
        <Stat label="Asignaciones" value={formatMoney(sum("earnings"))} />
        <Stat label="Deducciones" value={formatMoney(-sum("deductions"))} />
        <Stat label="Neto a pagar" value={formatMoney(sum("net"))} tone="marca" />
      </div>

      <Card className="p-0 sm:p-0">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[36rem] text-sm">
            <thead>
              <tr className="rotulo text-left text-gris">
                <th className="px-4 py-2.5 font-semibold">Colaborador</th>
                <th className="px-4 py-2.5 text-right font-semibold">Asignaciones</th>
                <th className="px-4 py-2.5 text-right font-semibold">Deducciones</th>
                <th className="px-4 py-2.5 text-right font-semibold">Neto</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-borde">
              {data.payslips.map((slip) => (
                <tr key={slip.id}>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      onClick={() => setOpen(slip.id)}
                      className="text-left font-semibold hover:text-kru-700"
                    >
                      {slip.employee.name}
                    </button>
                    <span className="block text-[13px] text-gris tabular-nums">C.I. {slip.employee.cedula}</span>
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(slip.earnings)}</td>
                  <td className="px-4 py-3 text-right tabular-nums">{formatMoney(-slip.deductions)}</td>
                  <td className="px-4 py-3 text-right font-semibold tabular-nums">{formatMoney(slip.net)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {open && (
        <PayslipDialog
          companyId={companyId}
          payslipId={open}
          editable={data.state === "computed"}
          inputTypes={inputTypes.data ?? []}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
