"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import type { InputType } from "@/lib/types";

/** Conceptos que RRHH carga a mano en cada recibo (bonos, descuentos…). Las reglas los usan por código. */
export default function ConceptosPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const queryClient = useQueryClient();
  const groupId = useCurrentCompany(companyId)?.group.id;
  const [creating, setCreating] = useState(false);

  const inputTypes = useQuery({
    queryKey: ["groups", groupId, "input-types"],
    queryFn: () => api<{ inputTypes: InputType[] }>(`/groups/${groupId}/input-types`).then((r) => r.inputTypes),
    enabled: Boolean(groupId),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      api(`/groups/${groupId}/input-types`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ["groups", groupId, "input-types"] });
    },
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.025em]">Conceptos manuales</h1>
          <p className="mt-1 text-sm text-gris">
            Montos que RRHH carga en cada recibo, como bonos o descuentos. Una regla los usa por su código.
          </p>
        </div>
        <Button onClick={() => { create.reset(); setCreating(true); }} disabled={!groupId}>Nuevo concepto</Button>
      </div>

      <Card flush>
        {inputTypes.isError ? (
          <div className="p-4"><EmptyState>{errorMessage(inputTypes.error)}</EmptyState></div>
        ) : !inputTypes.data ? (
          <p className="p-4 text-sm text-gris">Cargando…</p>
        ) : inputTypes.data.length === 0 ? (
          <div className="p-4"><EmptyState>Todavía no hay conceptos manuales.</EmptyState></div>
        ) : (
          <ul className="divide-y divide-borde">
            {inputTypes.data.map((type) => (
              <li key={type.id} className="flex items-center gap-3 px-4 py-3">
                <span className="min-w-0 flex-1 truncate text-sm font-semibold">{type.name}</span>
                <span className="font-mono text-[12px] text-gris-claro">{type.code}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo concepto">
        <form onSubmit={onCreate} className="flex flex-col gap-4">
          <Input label="Nombre" name="name" placeholder="Bono de transporte" required />
          <Input
            label="Código"
            name="code"
            placeholder="BONO_TRANSPORTE"
            autoCapitalize="characters"
            pattern="[A-Za-z][A-Za-z0-9_]{0,29}"
            title="Letras, números y _ ; empieza con una letra"
            required
          />
          <p className="text-[13px] text-gris">
            Para que el monto llegue al recibo, agrega en la estructura una regla de tipo concepto manual con este código.
          </p>
          {create.isError && (
            <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
              {errorMessage(create.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>Cancelar</Button>
            <Button type="submit" disabled={create.isPending}>{create.isPending ? "Guardando…" : "Crear concepto"}</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
