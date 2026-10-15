"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { Avatar, Card, EmptyState, Stat } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { caracasDate, formatDay, formatTime } from "@/lib/time";
import type { CompanyToday } from "@/lib/types";

function PersonRow({
  href,
  name,
  detail,
  badge,
}: {
  href: string;
  name: string;
  detail: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex items-center gap-3 rounded-xl border border-borde px-3.5 py-2.5 transition-colors hover:border-kru-300"
      >
        <Avatar name={name} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold">{name}</span>
          <span className="block text-[13px] text-gris tabular-nums">{detail}</span>
        </span>
        {badge}
      </Link>
    </li>
  );
}

function List({ title, count, children, empty }: { title: string; count: number; children: ReactNode; empty: string }) {
  return (
    <Card>
      <h2 className="flex items-center justify-between font-semibold">
        {title} <span className="text-sm font-medium text-gris tabular-nums">{count}</span>
      </h2>
      <div className="mt-3">{count === 0 ? <EmptyState>{empty}</EmptyState> : <ul className="flex flex-col gap-2">{children}</ul>}</div>
    </Card>
  );
}

export default function HoyPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const today = useQuery({
    queryKey: ["companies", companyId, "today"],
    queryFn: () => api<CompanyToday>(`/companies/${companyId}/today`),
    refetchInterval: 60_000,
  });

  if (today.isError) return <EmptyState>{errorMessage(today.error)}</EmptyState>;
  if (!today.data) return <p className="text-sm text-gris">Cargando…</p>;

  const { counts, inside, missingClockOut, notClockedIn, finished, date } = today.data;
  const employeeHref = (id: string) => `/rrhh/${companyId}/colaboradores/${id}`;

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.025em]">Hoy</h1>
        <p className="mt-1 text-sm first-letter:uppercase text-gris">{formatDay(date)} · se actualiza cada minuto</p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Dentro ahora" value={counts.inside} tone="marca" />
        <Stat label="No han marcado" value={counts.notClockedIn} />
        <Stat label="Sin salida" value={counts.missingClockOut} tone={counts.missingClockOut > 0 ? "alerta" : "neutral"} />
        <Stat label="Colaboradores activos" value={counts.active} />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <List title="Dentro" count={inside.length} empty="Nadie tiene un turno abierto.">
          {inside.map((entry) => (
            <PersonRow
              key={entry.shiftId}
              href={employeeHref(entry.employee.id)}
              name={entry.employee.name}
              detail={`Entró a las ${formatTime(entry.clockIn)}`}
              badge={<Badge tone="exito">Dentro</Badge>}
            />
          ))}
        </List>

        <List title="No ha marcado" count={notClockedIn.length} empty="Todos marcaron hoy.">
          {notClockedIn.map((employee) => (
            <PersonRow
              key={employee.id}
              href={employeeHref(employee.id)}
              name={employee.name}
              detail={`C.I. ${employee.cedula}`}
              badge={<Badge tone="error">No marcó</Badge>}
            />
          ))}
        </List>

        <List title="Sin salida" count={missingClockOut.length} empty="No hay turnos olvidados.">
          {missingClockOut.map((entry) => (
            <PersonRow
              key={entry.shiftId}
              href={employeeHref(entry.employee.id)}
              name={entry.employee.name}
              detail={`Entró el ${formatDay(caracasDate(entry.clockIn))} a las ${formatTime(entry.clockIn)}`}
              badge={<Badge tone="alerta">Corregir</Badge>}
            />
          ))}
        </List>
      </div>

      {finished.length > 0 && (
        <Card>
          <h2 className="font-semibold">Ya salieron hoy</h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {finished.map((entry) => (
              <li
                key={entry.shiftId}
                className="inline-flex items-center gap-2 rounded-full border border-borde bg-hueso/60 px-2.5 py-1 text-[12px] font-medium text-gris tabular-nums"
              >
                {entry.employee.name} · {formatTime(entry.clockIn)}–{entry.clockOut && formatTime(entry.clockOut)}
              </li>
            ))}
          </ul>
        </Card>
      )}
    </div>
  );
}
