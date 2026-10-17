"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useSession } from "@/lib/session";
import type { AdminGroup } from "@/lib/types";

type Creating = { mode: "group" } | { mode: "company"; group: AdminGroup } | null;

function formBody(form: HTMLFormElement) {
  const entries = Object.entries(Object.fromEntries(new FormData(form)));
  // Los campos opcionales vacíos no se envían (el código sale del nombre).
  return Object.fromEntries(entries.filter(([, value]) => value !== ""));
}

/** Panel del superusuario: grupos (empresas padre), sus empresas y acceso a su RRHH y equipo. */
export default function AdminPage() {
  const queryClient = useQueryClient();
  const { data: user } = useSession();
  const [creating, setCreating] = useState<Creating>(null);

  const groups = useQuery({
    queryKey: ["admin", "groups"],
    queryFn: () => api<{ groups: AdminGroup[] }>("/admin/groups").then((r) => r.groups),
    enabled: user?.role === "superadmin",
  });

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin"] }),
      queryClient.invalidateQueries({ queryKey: ["companies"] }),
    ]);

  const create = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      creating?.mode === "company"
        ? api(`/admin/groups/${creating.group.id}/companies`, { method: "POST", body: JSON.stringify(body) })
        : api("/admin/groups", { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setCreating(null);
      void invalidate();
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      api(`/admin/companies/${id}`, { method: "PATCH", body: JSON.stringify({ active }) }),
    onSuccess: () => void invalidate(),
  });

  function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    create.mutate(formBody(event.currentTarget));
  }

  return (
    <>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-[-0.025em]">Empresas</h1>
            <p className="mt-1 text-sm text-gris">
              Cada grupo es una empresa padre con sus sub-empresas. Desde Equipo das de alta a sus
              administradores.
            </p>
          </div>
          <Button onClick={() => { create.reset(); setCreating({ mode: "group" }); }}>Nuevo grupo</Button>
        </div>

        {groups.isError ? (
          <EmptyState>{errorMessage(groups.error)}</EmptyState>
        ) : !groups.data ? (
          <p className="text-sm text-gris">Cargando…</p>
        ) : groups.data.length === 0 ? (
          <EmptyState>Todavía no hay empresas.</EmptyState>
        ) : (
          groups.data.map((group) => (
            <Card key={group.id} className="p-0 sm:p-0">
              <div className="flex flex-wrap items-center gap-3 border-b border-borde p-4">
                <div className="mr-auto">
                  <h2 className="font-semibold">{group.name}</h2>
                  <p className="text-[13px] text-gris">{group.companies.length} empresa(s)</p>
                </div>
                <Button variant="secondary" onClick={() => { create.reset(); setCreating({ mode: "company", group }); }}>
                  Agregar empresa
                </Button>
              </div>
              <ul className="divide-y divide-borde">
                {group.companies.map((company) => (
                  <li key={company.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold">{company.name}</span>
                      <span className="block text-[13px] text-gris">
                        {company.slug}
                        {company.rif && ` · RIF ${company.rif}`}
                      </span>
                    </span>
                    {!company.active && <Badge tone="error">Inactiva</Badge>}
                    <Link href={`/rrhh/${company.id}`} className="font-semibold text-kru-700 hover:text-kru-800">
                      Abrir
                    </Link>
                    <Link href={`/rrhh/${company.id}/equipo`} className="font-semibold text-kru-700 hover:text-kru-800">
                      Equipo
                    </Link>
                    <button
                      type="button"
                      disabled={toggle.isPending}
                      onClick={() => toggle.mutate({ id: company.id, active: !company.active })}
                      className="font-semibold text-gris hover:text-grafito"
                    >
                      {company.active ? "Desactivar" : "Reactivar"}
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ))
        )}
        {toggle.isError && (
          <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
            {errorMessage(toggle.error)}
          </p>
        )}
      </div>

      <Dialog
        open={creating !== null}
        onClose={() => setCreating(null)}
        title={creating?.mode === "company" ? `Nueva empresa en ${creating.group.name}` : "Nuevo grupo"}
      >
        {creating && (
          <form key={creating.mode} onSubmit={onCreate} className="flex flex-col gap-4">
            {creating.mode === "group" && (
              <p className="text-[13px] text-gris">Se crea con una primera empresa del mismo nombre.</p>
            )}
            <Input label="Nombre" name="name" required minLength={2} />
            <Input
              label="Código (opcional)"
              name="code"
              autoCapitalize="none"
              placeholder="se genera a partir del nombre"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              title="Minúsculas, números y guiones"
            />
            {creating.mode === "company" && (
              <Input label="RIF (opcional)" name="rif" placeholder="J-12345678-9" />
            )}
            {create.isError && (
              <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
                {errorMessage(create.error)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setCreating(null)}>Cancelar</Button>
              <Button type="submit" disabled={create.isPending}>{create.isPending ? "Creando…" : "Crear"}</Button>
            </div>
          </form>
        )}
      </Dialog>
    </>
  );
}
