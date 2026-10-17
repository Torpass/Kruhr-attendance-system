"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import { SCHEDULE_LABEL } from "@/lib/payroll-rules";
import type { Structure } from "@/lib/types";

const fieldClass = "rounded-lg border border-borde-fuerte bg-white px-3.5 py-2.5 text-sm";

export default function EstructurasPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();
  const company = useCurrentCompany(companyId);
  const groupId = company?.group.id;
  const [creating, setCreating] = useState(false);

  const structures = useQuery({
    queryKey: ["groups", groupId, "structures"],
    queryFn: () =>
      api<{ structures: (Structure & { rules: number })[] }>(`/groups/${groupId}/structures`).then((r) => r.structures),
    enabled: Boolean(groupId),
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["groups", groupId] });

  const install = useMutation({
    mutationFn: () => api(`/groups/${groupId}/structures/sample`, { method: "POST" }),
    onSuccess: () => void invalidate(),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api<{ structure: Structure }>(`/groups/${groupId}/structures`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: ({ structure }) => {
      void invalidate();
      router.push(`/rrhh/${companyId}/configuracion/estructuras/${structure.id}`);
    },
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate({ ...Object.fromEntries(new FormData(event.currentTarget)), rules: [] });
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.025em]">Estructuras salariales</h1>
          <p className="mt-1 text-sm text-gris">
            La receta de cada recibo. Cada contrato usa una, y se comparten entre las empresas de{" "}
            {company?.group.name ?? "el grupo"}.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => install.mutate()} disabled={!groupId || install.isPending}>
            {install.isPending ? "Instalando…" : "Instalar de referencia"}
          </Button>
          <Button onClick={() => { create.reset(); setCreating(true); }} disabled={!groupId}>Nueva estructura</Button>
        </div>
      </div>

      {install.isError && (
        <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
          {errorMessage(install.error)}
        </p>
      )}

      <Card flush>
        {structures.isError ? (
          <div className="p-4"><EmptyState>{errorMessage(structures.error)}</EmptyState></div>
        ) : !structures.data ? (
          <p className="p-4 text-sm text-gris">Cargando…</p>
        ) : structures.data.length === 0 ? (
          <div className="p-4">
            <EmptyState>
              Todavía no hay estructuras. Instala la de referencia (Quincenal VE: salario, horas extra, bono nocturno,
              IVSS, RPE y FAOV) y ajústala.
            </EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-borde">
            {structures.data.map((s) => (
              <li key={s.id}>
                <Link
                  href={`/rrhh/${companyId}/configuracion/estructuras/${s.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hueso/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{s.name}</span>
                    <span className="block text-[13px] text-gris">
                      Pago {SCHEDULE_LABEL[s.schedulePay].toLowerCase()} · {s.rules} reglas
                    </span>
                  </span>
                  {!s.active && <Badge tone="error">Inactiva</Badge>}
                  <span aria-hidden className="text-gris-claro">›</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nueva estructura">
        <form onSubmit={onCreate} className="flex flex-col gap-4">
          <Input label="Nombre" name="name" placeholder="Semanal operarios" required />
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Código"
              name="code"
              placeholder="SEMANAL_OP"
              autoCapitalize="characters"
              pattern="[A-Za-z][A-Za-z0-9_]{0,29}"
              title="Letras, números y _ ; empieza con una letra"
              required
            />
            <label className="flex flex-col gap-1.5">
              <span className="rotulo text-gris">Pago</span>
              <select name="schedulePay" defaultValue="semi_monthly" className={fieldClass}>
                {Object.entries(SCHEDULE_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </select>
            </label>
          </div>
          <p className="text-[13px] text-gris">Se crea vacía; luego le agregas sus reglas.</p>
          {create.isError && (
            <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
              {errorMessage(create.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creando…" : "Crear estructura"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
