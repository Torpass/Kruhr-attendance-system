import { formatMoney } from "@/lib/money";
import type { PayslipLine } from "@/lib/types";

/**
 * Cuerpo del recibo: Concepto | Cantidad | Asignaciones | Deducciones, y el neto.
 * Solo las líneas visibles; las positivas son asignaciones y las negativas deducciones.
 * En el teléfono cada línea se apila (sin scroll horizontal) y el neto nunca queda cortado.
 */
export function PayslipLines({
  lines,
  earnings,
  deductions,
  net,
}: {
  lines: PayslipLine[];
  earnings: number;
  deductions: number;
  net: number;
}) {
  const visible = lines.filter((line) => line.appearsOnPayslip);
  return (
    <div className="flex flex-col gap-3">
      <ul className="divide-y divide-borde text-sm sm:hidden">
        {visible.map((line) => (
          <li key={line.code} className="flex items-baseline justify-between gap-3 py-2">
            <span className="min-w-0">
              {line.name}
              <span className="block text-[12px] text-gris tabular-nums">Cantidad {formatMoney(line.quantity)}</span>
            </span>
            <span className={`shrink-0 font-medium tabular-nums ${line.total < 0 ? "text-error-texto" : ""}`}>
              {line.total < 0 ? "−" : ""}
              {formatMoney(Math.abs(line.total))}
            </span>
          </li>
        ))}
        <li className="flex justify-between py-2 text-[13px] text-gris">
          <span>Asignaciones</span>
          <span className="tabular-nums">{formatMoney(earnings)}</span>
        </li>
        <li className="flex justify-between py-2 text-[13px] text-gris">
          <span>Deducciones</span>
          <span className="tabular-nums">−{formatMoney(-deductions)}</span>
        </li>
      </ul>

      <table className="hidden w-full text-sm sm:table">
        <thead>
          <tr className="rotulo border-b border-borde text-left text-gris">
            <th className="py-2 pr-3 font-semibold">Concepto</th>
            <th className="py-2 pr-3 text-right font-semibold">Cantidad</th>
            <th className="py-2 pr-3 text-right font-semibold">Asignaciones</th>
            <th className="py-2 text-right font-semibold">Deducciones</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-borde">
          {visible.map((line) => (
            <tr key={line.code}>
              <td className="py-2 pr-3">{line.name}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(line.quantity)}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{line.total > 0 ? formatMoney(line.total) : ""}</td>
              <td className="py-2 text-right tabular-nums">{line.total < 0 ? formatMoney(-line.total) : ""}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t-2 border-borde">
          <tr className="font-semibold">
            <td className="py-2 pr-3">Totales</td>
            <td />
            <td className="py-2 pr-3 text-right tabular-nums">{formatMoney(earnings)}</td>
            <td className="py-2 text-right tabular-nums">{formatMoney(-deductions)}</td>
          </tr>
        </tfoot>
      </table>

      <div className="flex items-center justify-between gap-3 rounded-xl border border-kru-100 bg-kru-50 px-3.5 py-3">
        <span className="rotulo text-kru-800">Neto a pagar</span>
        <span className="text-xl font-bold tabular-nums">Bs. {formatMoney(net)}</span>
      </div>
    </div>
  );
}
