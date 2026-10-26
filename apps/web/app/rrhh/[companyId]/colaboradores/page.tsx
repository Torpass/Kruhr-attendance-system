"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import type { Employee } from "@/lib/types";

export default function ColaboradoresPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState("");

  const employees = useQuery({
    queryKey: ["companies", companyId, "employees"],
    queryFn: () =>
      api<{ employees: Employee[] }>(`/companies/${companyId}/employees`).then((r) => r.employees),
  });

  const create = useMutation({
    mutationFn: (body: Record<string, FormDataEntryValue>) =>
      api(`/companies/${companyId}/employees`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setCreating(false);
      void queryClient.invalidateQueries({ queryKey: ["companies", companyId] });
    },
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(Object.fromEntries(new FormData(event.currentTarget)));
  }

  const query = filter.trim().toLowerCase();
  const visible = (employees.data ?? []).filter(
    (e) => !query || e.name.toLowerCase().includes(query) || e.cedula.includes(query),
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.025em]">Colaboradores</h1>
          <p className="mt-1 text-sm text-gris">
            Entran a marcar con su cédula y su contraseña.
          </p>
        </div>
        <Button onClick={() => { create.reset(); setCreating(true); }}>Nuevo colaborador</Button>
      </div>

      <Card flush>
        <div className="border-b border-borde p-4">
          <label className="sr-only" htmlFor="filter">Buscar</label>
          <input
            id="filter"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Buscar por nombre o cédula"
            className="w-full rounded-lg border border-borde-fuerte px-3.5 py-2.5 text-sm outline-none focus:border-kru-500 focus:ring-4 focus:ring-kru-100"
          />
        </div>
        {employees.isPending ? (
          <p className="p-4 text-sm text-gris">Cargando…</p>
        ) : employees.isError ? (
          <div className="p-4"><EmptyState>{errorMessage(employees.error)}</EmptyState></div>
        ) : visible.length === 0 ? (
          <div className="p-4"><EmptyState>No hay colaboradores que coincidan.</EmptyState></div>
        ) : (
          <ul className="divide-y divide-borde">
            {visible.map((employee) => (
              <li key={employee.id}>
                <Link
                  href={`/rrhh/${companyId}/colaboradores/${employee.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-hueso/60"
                >
                  <Avatar name={employee.name} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-semibold">{employee.name}</span>
                    <span className="block text-[13px] text-gris tabular-nums">C.I. {employee.cedula}</span>
                  </span>
                  {!employee.active && <Badge tone="error">Inactivo</Badge>}
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog open={creating} onClose={() => setCreating(false)} title="Nuevo colaborador">
        <form onSubmit={onCreate} className="flex flex-col gap-4">
          <Input label="Nombre y apellido" name="name" autoComplete="off" required minLength={2} />
          <Input label="Cédula" name="cedula" inputMode="numeric" placeholder="12345678" required />
          <Input
            label="Contraseña inicial"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={10}
            title="Al menos 10 caracteres"
            required
          />
          <p className="-mt-2 text-[13px] text-gris">
            Al menos 10 caracteres. El colaborador puede cambiarla al entrar.
          </p>
          {create.isError && (
            <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
              {errorMessage(create.error)}
            </p>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreating(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Guardando…" : "Dar de alta"}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
