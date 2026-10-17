"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import { formatMoney } from "@/lib/money";
import { formatDay, todayInCaracas } from "@/lib/time";
import type { PayrollParameter } from "@/lib/types";

type Editing = { mode: "create" } | { mode: "value"; param: PayrollParameter } | null;

/** El valor que rige hoy: el más reciente con fecha de inicio pasada (la API los ordena del más nuevo). */
function current(param: PayrollParameter, today: string) {
  return param.values.find((v) => v.dateFrom <= today);
}

export default function ParametrosPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const queryClient = useQueryClient();
  const groupId = useCurrentCompany(companyId)?.group.id;
  const [editing, setEditing] = useState<Editing>(null);
  const today = todayInCaracas();

  const parameters = useQuery({
    queryKey: ["groups", groupId, "parameters"],
    queryFn: () => api<{ parameters: PayrollParameter[] }>(`/groups/${groupId}/parameters`).then((r) => r.parameters),
    enabled: Boolean(groupId),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing?.mode === "value"
        ? api(`/groups/${groupId}/parameters/${editing.param.id}/values`, { method: "PUT", body: JSON.stringify(body) })
        : api(`/groups/${groupId}/parameters`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["groups", groupId, "parameters"] });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body: Record<string, unknown> = Object.fromEntries(new FormData(event.currentTarget));
    body.value = Number(body.value);
    save.mutate(body);
  }

  function open(next: Editing) {
    save.reset();
    setEditing(next);
  }

  const shown = editing?.mode === "value" ? editing.param : null;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.025em]">Parámetros legales</h1>
          <p className="mt-1 text-sm text-gris">
            Valores que cambian por ley, como el salario mínimo. Cada período usa el vigente a su cierre.
          </p>
        </div>
        <Button onClick={() => open({ mode: "create" })} disabled={!groupId}>Nuevo parámetro</Button>
      </div>

      <Card flush>
        {parameters.isError ? (
          <div className="p-4"><EmptyState>{errorMessage(parameters.error)}</EmptyState></div>
        ) : !parameters.data ? (
          <p className="p-4 text-sm text-gris">Cargando…</p>
        ) : parameters.data.length === 0 ? (
          <div className="p-4"><EmptyState>Todavía no hay parámetros. Créalos aquí o instala la estructura de referencia.</EmptyState></div>
        ) : (
          <>
            <div className="rotulo hidden grid-cols-[1fr_8rem_9rem_1rem] gap-4 border-b border-borde px-4 py-2.5 text-gris sm:grid">
              <span>Parámetro</span>
              <span className="text-right">Vigente</span>
              <span>Desde</span>
            </div>
            <ul className="divide-y divide-borde">
              {parameters.data.map((p) => {
                const value = current(p, today);
                const scheduled = p.values.find((v) => v.dateFrom > today);
                return (
                  <li key={p.id}>
                    <button
                      type="button"
                      onClick={() => open({ mode: "value", param: p })}
                      className="grid w-full grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 px-4 py-3 text-left transition-colors hover:bg-hueso/60 sm:grid-cols-[1fr_8rem_9rem_1rem]"
                    >
                      <span className="min-w-0">
                        <span className="block truncate text-sm font-semibold">{p.name}</span>
                        <span className="block font-mono text-[12px] text-gris-claro">{p.code}</span>
                      </span>
                      <span className="text-right text-sm font-semibold tabular-nums">
                        {value ? formatMoney(value.value) : "—"}
                      </span>
                      <span className="text-[13px] text-gris first-letter:uppercase">
                        {value ? formatDay(value.dateFrom) : "Sin valor vigente"}
                        {scheduled && <span className="block text-kru-700">Cambia el {formatDay(scheduled.dateFrom)}</span>}
                      </span>
                      <span aria-hidden className="hidden text-gris-claro sm:block">›</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </>
        )}
      </Card>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={shown ? shown.name : "Nuevo parámetro"}
      >
        {editing && (
          <form key={shown?.id ?? "new"} onSubmit={onSubmit} className="flex flex-col gap-4">
            {shown ? (
              <>
                <p className="-mt-3 font-mono text-[12px] text-gris-claro">{shown.code}</p>
                <div>
                  <p className="rotulo mb-1 text-gris">Historial</p>
                  <ul className="divide-y divide-borde rounded-xl border border-borde text-sm">
                    {shown.values.map((v) => {
                      const isCurrent = v === current(shown, today);
                      return (
                        <li key={v.dateFrom} className="flex items-center gap-3 px-3.5 py-2.5">
                          <span className="flex-1 text-gris first-letter:uppercase">{formatDay(v.dateFrom)}</span>
                          <span className="font-semibold tabular-nums">{formatMoney(v.value)}</span>
                          {isCurrent && <Badge>Vigente</Badge>}
                          {v.dateFrom > today && <Badge tone="alerta">Programado</Badge>}
                        </li>
                      );
                    })}
                  </ul>
                </div>
                <p className="rotulo -mb-2 text-gris">Registrar nuevo valor</p>
              </>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <Input label="Nombre" name="name" placeholder="Salario mínimo mensual" required />
                <Input
                  label="Código"
                  name="code"
                  placeholder="SALARIO_MINIMO"
                  autoCapitalize="characters"
                  pattern="[A-Za-z][A-Za-z0-9_]{0,29}"
                  title="Letras, números y _ ; empieza con una letra"
                  required
                />
              </div>
            )}
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Desde" name="dateFrom" type="date" defaultValue={today} required />
              <Input label="Valor" name="value" type="number" step="0.01" inputMode="decimal" required />
            </div>
            {save.isError && (
              <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
                {errorMessage(save.error)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Guardando…" : shown ? "Guardar valor" : "Crear parámetro"}
              </Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
