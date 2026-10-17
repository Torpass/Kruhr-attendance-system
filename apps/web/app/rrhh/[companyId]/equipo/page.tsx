"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Avatar, Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useCompanies } from "@/lib/companies";
import { useSession } from "@/lib/session";
import type { StaffMember } from "@/lib/types";

const ROLE_LABEL = { superadmin: "Superusuario", admin: "Administrador", analyst: "Analista" } as const;

type Editing = { mode: "create" } | { mode: "edit"; member: StaffMember } | null;

/**
 * Equipo de gestión del grupo de la empresa actual. El admin da de alta y edita administradores y
 * analistas con las empresas que gestiona (no a un admin con empresas fuera de su alcance); el
 * superusuario, a todos. La API aplica las reglas.
 */
export default function EquipoPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const queryClient = useQueryClient();
  const { data: user } = useSession();
  const { data: companies } = useCompanies();
  const [editing, setEditing] = useState<Editing>(null);

  const group = companies?.find((c) => c.id === companyId)?.group;
  const groupCompanies = companies?.filter((c) => c.group.id === group?.id) ?? [];
  const companyName = (id: string) => groupCompanies.find((c) => c.id === id)?.name;
  const isSuperadmin = user?.role === "superadmin";
  const canChooseRole = isSuperadmin || user?.role === "admin";

  const staff = useQuery({
    queryKey: ["groups", group?.id, "staff"],
    queryFn: () => api<{ staff: StaffMember[] }>(`/groups/${group!.id}/staff`).then((r) => r.staff),
    enabled: Boolean(group),
  });

  const save = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      editing?.mode === "edit"
        ? api(`/groups/${group!.id}/staff/${editing.member.id}`, { method: "PATCH", body: JSON.stringify(body) })
        : api(`/groups/${group!.id}/staff`, { method: "POST", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["groups", group?.id, "staff"] });
    },
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const body: Record<string, unknown> = {
      name: form.get("name"),
      companyIds: form.getAll("companyIds"),
    };
    if (form.get("role")) body.role = form.get("role");
    else if (editing?.mode === "create") body.role = "analyst";
    if (form.get("password")) body.password = form.get("password");
    if (editing?.mode === "create") body.email = form.get("email");
    if (editing?.mode === "edit" && editing.member.id !== user?.id) {
      body.active = form.get("active") === "on";
    }
    save.mutate(body);
  }

  /** El admin edita analistas y admins cuyas empresas gestiona él también (la API lo exige). */
  const inMyScope = (member: StaffMember) => member.companyIds.every((id) => user?.companyIds.includes(id));
  const canEdit = (member: StaffMember) =>
    isSuperadmin ||
    member.id === user?.id ||
    (user?.role === "admin" && (member.role === "analyst" || (member.role === "admin" && inMyScope(member))));
  const member = editing?.mode === "edit" ? editing.member : null;
  const isSelf = member?.id === user?.id;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.025em]">Equipo</h1>
          <p className="mt-1 text-sm text-gris">
            Administradores y analistas de {group?.name ?? "la empresa"}. Cada uno ve solo las
            empresas que tiene asignadas.
          </p>
        </div>
        <Button onClick={() => { save.reset(); setEditing({ mode: "create" }); }} disabled={!group}>
          Nuevo usuario
        </Button>
      </div>

      <Card flush>
        {staff.isError ? (
          <div className="p-4"><EmptyState>{errorMessage(staff.error)}</EmptyState></div>
        ) : !staff.data ? (
          <p className="p-4 text-sm text-gris">Cargando…</p>
        ) : (
          <ul className="divide-y divide-borde">
            {staff.data.map((m) => (
              <li key={m.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                <Avatar name={m.name} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold">
                    {m.name} {m.id === user?.id && <span className="font-normal text-gris">(tú)</span>}
                  </span>
                  <span className="block truncate text-[13px] text-gris">{m.email}</span>
                  <span className="mt-1 flex flex-wrap gap-1">
                    {m.companyIds.map((id) => (
                      <span key={id} className="rounded-full border border-borde bg-hueso/60 px-2 py-0.5 text-[12px] text-gris">
                        {companyName(id) ?? "Otra empresa"}
                      </span>
                    ))}
                  </span>
                </span>
                <Badge tone={m.role === "admin" ? "marca" : "exito"}>{ROLE_LABEL[m.role]}</Badge>
                {!m.active && <Badge tone="error">Inactivo</Badge>}
                {canEdit(m) && (
                  <button
                    type="button"
                    onClick={() => { save.reset(); setEditing({ mode: "edit", member: m }); }}
                    className="text-sm font-semibold text-kru-700 hover:text-kru-800"
                  >
                    Editar
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        title={member ? `Editar a ${member.name}` : "Nuevo usuario"}
      >
        {editing && (
          <form key={member?.id ?? "new"} onSubmit={onSubmit} className="flex flex-col gap-4">
            <Input label="Nombre y apellido" name="name" defaultValue={member?.name} required minLength={2} />
            {!member && <Input label="Correo" name="email" type="email" required />}
            <Input
              label={member ? "Contraseña nueva (opcional)" : "Contraseña"}
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={10}
              required={!member}
            />
            {canChooseRole && !isSelf && (
              <label className="flex flex-col gap-1.5">
                <span className="rotulo text-gris">Rol</span>
                <select
                  name="role"
                  defaultValue={member?.role ?? "analyst"}
                  className="rounded-lg border border-borde-fuerte bg-white px-3.5 py-2.5 text-sm"
                >
                  <option value="analyst">Analista</option>
                  <option value="admin">Administrador</option>
                </select>
              </label>
            )}
            <fieldset className="flex flex-col gap-2">
              <legend className="rotulo mb-1 text-gris">Empresas</legend>
              {groupCompanies.map((company) => (
                <label key={company.id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    name="companyIds"
                    value={company.id}
                    defaultChecked={member ? member.companyIds.includes(company.id) : company.id === companyId}
                    className="h-4 w-4 accent-kru-600"
                  />
                  {company.name}
                </label>
              ))}
            </fieldset>
            {member && !isSelf && (
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="active" defaultChecked={member.active} className="h-4 w-4 accent-kru-600" />
                Activo (puede entrar)
              </label>
            )}
            {save.isError && (
              <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
                {errorMessage(save.error)}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button type="submit" disabled={save.isPending}>{save.isPending ? "Guardando…" : "Guardar"}</Button>
            </div>
          </form>
        )}
      </Dialog>
    </div>
  );
}
