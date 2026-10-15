"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import { formatMoney } from "@/lib/money";
import { formatDay, todayInCaracas } from "@/lib/time";
import type { Contract, Structure } from "@/lib/types";

/** Contratos del colaborador: salario mensual y estructura vigentes entre dos fechas. */
export function ContractsCard({ companyId, employeeId }: { companyId: string; employeeId: string }) {
  const queryClient = useQueryClient();
  const company = useCurrentCompany(companyId);
  const url = `/companies/${companyId}/employees/${employeeId}/contracts`;

  const contracts = useQuery({
    queryKey: ["companies", companyId, "contracts", employeeId],
    queryFn: () => api<{ contracts: Contract[] }>(url).then((r) => r.contracts),
  });
  const structures = useQuery({
    queryKey: ["groups", company?.group.id, "structures"],
    queryFn: () => api<{ structures: Structure[] }>(`/groups/${company!.group.id}/structures`).then((r) => r.structures),
    enabled: Boolean(company),
  });
  const save = useMutation({
    mutationFn: ({ path = "", method, body }: { path?: string; method: string; body: unknown }) =>
      api(`${url}${path}`, { method, body: JSON.stringify(body) }),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["companies", companyId, "contracts", employeeId] }),
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    save.mutate({
      method: "POST",
      body: { structureId: form.get("structureId"), wage: Number(form.get("wage")), dateStart: form.get("dateStart") },
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
            <span className="flex-1">
              <b className="tabular-nums">Bs. {formatMoney(c.wage)}</b> mensual · {c.structure.name}
              <span className="block text-[13px] text-gris first-letter:uppercase">
                {formatDay(c.dateStart)} → {c.dateEnd ? formatDay(c.dateEnd) : "sin fin"}
              </span>
            </span>
            {c.id === current?.id && <Badge tone="exito">Vigente</Badge>}
            {!c.dateEnd && (
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
            )}
          </li>
        ))}
        {contracts.data?.length === 0 && (
          <li className="text-sm text-gris">Sin contrato: no entra en los lotes de nómina.</li>
        )}
      </ul>
      {structures.data && structures.data.length > 0 && !current && (
        <form onSubmit={onCreate} className="mt-4 grid gap-3 border-t border-borde pt-4 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5">
            <span className="rotulo text-gris">Estructura</span>
            <select name="structureId" className="rounded-lg border border-borde-fuerte bg-white px-3.5 py-2.5 text-sm">
              {structures.data.filter((s) => s.active).map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </label>
          <Input label="Salario mensual (Bs.)" name="wage" type="number" step="0.01" min="0.01" required />
          <Input label="Desde" name="dateStart" type="date" defaultValue={today} required />
          <div className="sm:col-span-3"><Button type="submit" disabled={save.isPending}>Crear contrato</Button></div>
        </form>
      )}
      {save.isError && (
        <p role="alert" className="mt-3 rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
          {errorMessage(save.error)}
        </p>
      )}
    </Card>
  );
}
