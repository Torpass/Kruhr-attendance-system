"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { formatMoney, RUN_STATE } from "@/lib/money";
import { formatDay } from "@/lib/time";
import type { RunState } from "@/lib/types";

type MyPayslip = {
  id: string;
  net: number;
  run: { name: string; dateFrom: string; dateTo: string; state: RunState };
};

export default function RecibosPage() {
  const payslips = useQuery({
    queryKey: ["me", "payslips"],
    queryFn: () => api<{ payslips: MyPayslip[] }>("/me/payslips").then((r) => r.payslips),
  });

  return (
    <div className="flex flex-col gap-4">
      <Link href="/marcar" className="text-sm font-semibold text-kru-700 hover:text-kru-800">
        ← Volver
      </Link>
      <Card>
        <h1 className="text-xl font-bold tracking-[-0.02em]">Mis recibos</h1>
        <p className="mt-1 text-sm text-gris">
          Aparecen cuando RRHH valida la nómina. Cuando está pagada, puedes descargar el recibo en PDF.
        </p>
        <div className="mt-4">
          {payslips.isError ? (
            <EmptyState>{errorMessage(payslips.error)}</EmptyState>
          ) : !payslips.data ? (
            <p className="text-sm text-gris">Cargando…</p>
          ) : payslips.data.length === 0 ? (
            <EmptyState>Todavía no tienes recibos.</EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {payslips.data.map((slip) => (
                <li key={slip.id}>
                  <Link
                    href={`/marcar/recibos/${slip.id}`}
                    className="flex items-center gap-3 rounded-xl border border-borde px-3.5 py-3 transition-colors hover:border-kru-300"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold first-letter:uppercase">
                        {formatDay(slip.run.dateFrom)} → {formatDay(slip.run.dateTo)}
                      </span>
                      <span className="block text-[13px] text-gris tabular-nums">
                        Neto Bs. {formatMoney(slip.net)}
                        {slip.run.state === "paid" && " · PDF disponible"}
                      </span>
                    </span>
                    <Badge tone={RUN_STATE[slip.run.state].tone}>{RUN_STATE[slip.run.state].label}</Badge>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>
    </div>
  );
}
