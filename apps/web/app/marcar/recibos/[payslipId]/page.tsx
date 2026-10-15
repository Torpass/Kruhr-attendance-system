"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { PayslipLines } from "@/components/payslip-lines";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { api, errorMessage } from "@/lib/api";
import { formatMoney } from "@/lib/money";
import { formatDay } from "@/lib/time";
import type { PayslipLine, RunState } from "@/lib/types";

type MyPayslipDetail = {
  id: string;
  companyName: string;
  employee: { name: string; cedula: string };
  run: { name: string; dateFrom: string; dateTo: string; state: RunState };
  wage: number;
  earnings: number;
  deductions: number;
  net: number;
  lines: PayslipLine[];
};

/** Recibo de pago imprimible. */
export default function ReciboPage() {
  const { payslipId } = useParams<{ payslipId: string }>();
  const slip = useQuery({
    queryKey: ["me", "payslips", payslipId],
    queryFn: () => api<{ payslip: MyPayslipDetail }>(`/me/payslips/${payslipId}`).then((r) => r.payslip),
  });

  if (slip.isError) return <EmptyState>{errorMessage(slip.error)}</EmptyState>;
  if (!slip.data) return <p className="text-sm text-gris">Cargando…</p>;
  const data = slip.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between print:hidden">
        <Link href="/marcar/recibos" className="text-sm font-semibold text-kru-700 hover:text-kru-800">
          ← Mis recibos
        </Link>
        <Button variant="secondary" onClick={() => window.print()}>Imprimir</Button>
      </div>
      <Card className="print:border-0 print:p-0">
        <p className="rotulo text-gris">Recibo de pago</p>
        <h1 className="mt-1 text-xl font-bold tracking-[-0.02em]">{data.companyName}</h1>
        <dl className="mt-4 grid grid-cols-2 gap-3 text-sm">
          <div>
            <dt className="rotulo text-gris">Colaborador</dt>
            <dd className="font-medium">{data.employee.name}</dd>
          </div>
          <div>
            <dt className="rotulo text-gris">Cédula</dt>
            <dd className="font-medium tabular-nums">{data.employee.cedula}</dd>
          </div>
          <div>
            <dt className="rotulo text-gris">Período</dt>
            <dd className="font-medium first-letter:uppercase">{formatDay(data.run.dateFrom)} → {formatDay(data.run.dateTo)}</dd>
          </div>
          <div>
            <dt className="rotulo text-gris">Salario mensual</dt>
            <dd className="font-medium tabular-nums">Bs. {formatMoney(data.wage)}</dd>
          </div>
        </dl>
        <div className="mt-5">
          <PayslipLines lines={data.lines} earnings={data.earnings} deductions={data.deductions} net={data.net} />
        </div>
      </Card>
    </div>
  );
}
