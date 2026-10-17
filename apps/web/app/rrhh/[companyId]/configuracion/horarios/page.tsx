"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useParams } from "next/navigation";
import { useState } from "react";
import { ScheduleForm } from "@/components/schedule-form";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import { DEFAULT_SCHEDULE, describeSchedule } from "@/lib/schedules";
import type { WorkSchedule } from "@/lib/types";

type Editing = { mode: "create" } | { mode: "edit"; schedule: WorkSchedule } | null;

function Summary({ policy }: { policy: Omit<WorkSchedule, "id" | "code" | "name" | "active"> }) {
  const d = describeSchedule(policy);
  return (
    <ul className="flex flex-col gap-0.5 text-[13px] text-gris">
      {d.week && <li className="font-medium text-grafito">{d.week}</li>}
      <li>{d.overtime}</li>
      <li>{d.rest}</li>
      <li>
        {d.night} · {d.alert}
      </li>
    </ul>
  );
}

export default function HorariosPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const queryClient = useQueryClient();
  const company = useCurrentCompany(companyId);
  const groupId = company?.group.id;
  const [editing, setEditing] = useState<Editing>(null);

  const schedules = useQuery({
    queryKey: ["groups", groupId, "schedules"],
    queryFn: () => api<{ schedules: WorkSchedule[] }>(`/groups/${groupId}/schedules`).then((r) => r.schedules),
    enabled: Boolean(groupId),
  });

  function open(next: Editing) {
    setEditing(next);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-[-0.025em]">Horarios</h1>
          <p className="mt-1 text-sm text-gris">
            Jornada, descanso y cómo se cuentan las horas extra y nocturnas. Se asignan en el contrato de cada
            colaborador y se comparten entre las empresas de {company?.group.name ?? "el grupo"}.
          </p>
        </div>
        <Button onClick={() => open({ mode: "create" })} disabled={!groupId}>Nuevo horario</Button>
      </div>

      <Card flush>
        <div className="flex items-start gap-3 border-b border-borde px-4 py-3">
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-semibold">Regla general</span>
            <span className="mb-1 block text-[13px] text-gris">Para contratos sin horario. No se puede editar.</span>
            <Summary policy={DEFAULT_SCHEDULE} />
          </span>
          <Badge>Por defecto</Badge>
        </div>
        {schedules.isError ? (
          <div className="p-4"><EmptyState>{errorMessage(schedules.error)}</EmptyState></div>
        ) : !schedules.data ? (
          <p className="p-4 text-sm text-gris">Cargando…</p>
        ) : schedules.data.length === 0 ? (
          <div className="p-4">
            <EmptyState>Todavía no hay horarios. Crea uno para la jornada de tu empresa, por ejemplo de lunes a viernes de 08:00 a 17:00.</EmptyState>
          </div>
        ) : (
          <ul className="divide-y divide-borde">
            {schedules.data.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => open({ mode: "edit", schedule: s })}
                  className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hueso/60"
                >
                  <span className="min-w-0 flex-1">
                    <span className="mb-1 flex items-center gap-2">
                      <span className="text-sm font-semibold">{s.name}</span>
                      <span className="font-mono text-[12px] text-gris-claro">{s.code}</span>
                    </span>
                    <Summary policy={s} />
                  </span>
                  {!s.active && <Badge tone="error">Inactivo</Badge>}
                  <span aria-hidden className="text-gris-claro">›</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="side"
        title={editing?.mode === "edit" ? editing.schedule.name : "Nuevo horario"}
      >
        {editing && groupId && (
          <ScheduleForm
            key={editing.mode === "edit" ? editing.schedule.id : "new"}
            groupId={groupId}
            schedule={editing.mode === "edit" ? editing.schedule : null}
            onDone={() => {
              setEditing(null);
              void queryClient.invalidateQueries({ queryKey: ["groups", groupId, "schedules"] });
              // Cambiar un horario cambia las horas de turnos y períodos.
              void queryClient.invalidateQueries({ queryKey: ["companies"] });
            }}
            onCancel={() => setEditing(null)}
          />
        )}
      </Dialog>
    </div>
  );
}
