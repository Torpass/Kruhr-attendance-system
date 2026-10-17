"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { DownloadPdf } from "@/components/download-pdf";
import { Badge } from "@/components/ui/badge";
import { Card, EmptyState } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { formatMoney, RUN_STATE } from "@/lib/money";
import { formatDay } from "@/lib/time";
import type { RunState } from "@/lib/types";

type EmployeePayslip = {
  id: string;
  net: number;
  run: { id: string; name: string; dateFrom: string; dateTo: string; state: RunState };
};

/** Recibos de pago del colaborador (lotes calculados, validados o pagados); el PDF, si está pagado. */
export function EmployeePayslipsCard({ companyId, employeeId }: { companyId: string; employeeId: string }) {
  const payslips = useQuery({
    queryKey: ["companies", companyId, "employees", employeeId, "payslips"],
    queryFn: () =>
      api<{ payslips: EmployeePayslip[] }>(`/companies/${companyId}/employees/${employeeId}/payslips`).then(
        (r) => r.payslips,
      ),
  });

  return (
    <Card flush>
      <div className="border-b border-borde p-4">
        <h2 className="font-semibold">Recibos de pago</h2>
        <p className="mt-0.5 text-[13px] text-gris">El PDF se puede descargar cuando el lote está pagado.</p>
      </div>
      {payslips.isError ? (
        <div className="p-4"><EmptyState>{errorMessage(payslips.error)}</EmptyState></div>
      ) : !payslips.data ? (
        <p className="p-4 text-sm text-gris">Cargando…</p>
      ) : payslips.data.length === 0 ? (
        <div className="p-4"><EmptyState>Todavía no tiene recibos de pago.</EmptyState></div>
      ) : (
        <ul className="divide-y divide-borde">
          {payslips.data.map((slip) => (
            <li key={slip.id} className="flex flex-wrap items-center gap-3 px-4 py-3 text-sm">
              <Link href={`/rrhh/${companyId}/nomina/${slip.run.id}`} className="min-w-0 flex-1 group">
                <span className="block font-semibold first-letter:uppercase group-hover:text-kru-700">
                  {formatDay(slip.run.dateFrom)} → {formatDay(slip.run.dateTo)}
                </span>
                <span className="block truncate text-[13px] text-gris">{slip.run.name}</span>
              </Link>
              <span className="font-semibold tabular-nums">Bs. {formatMoney(slip.net)}</span>
              <Badge tone={RUN_STATE[slip.run.state].tone}>{RUN_STATE[slip.run.state].label}</Badge>
              {slip.run.state === "paid" && (
                <DownloadPdf href={`/api/companies/${companyId}/payslips/${slip.id}/pdf`}>PDF</DownloadPdf>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
