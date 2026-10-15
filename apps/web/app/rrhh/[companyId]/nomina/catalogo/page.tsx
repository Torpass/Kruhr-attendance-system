"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import { formatMoney } from "@/lib/money";
import { formatDay, todayInCaracas } from "@/lib/time";
import type { InputType, PayrollParameter, SalaryRule, Structure } from "@/lib/types";

const QUANTITY_LABEL: Record<SalaryRule["quantitySource"], string> = {
  one: "1",
  worked_hours: "Horas",
  input: "Entrada",
  period_days: "Días del período",
  mondays: "Lunes del período",
};
const AMOUNT_LABEL: Record<SalaryRule["amountType"], string> = {
  fixed: "Fijo",
  monthly_wage: "Salario mensual",
  weekly_wage: "Salario semanal",
  daily_wage: "Salario diario",
  hourly_wage: "Salario por hora",
  percentage_of: "Suma de reglas",
};
const SCHEDULE_LABEL = { weekly: "Semanal", semi_monthly: "Quincenal", monthly: "Mensual" } as const;

const cell = "w-full rounded-md border border-borde-fuerte bg-white px-2 py-1.5 text-[13px]";

function ErrorBox({ error }: { error: unknown }) {
  return (
    <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
      {errorMessage(error)}
    </p>
  );
}

/** Editor de reglas: se guarda el juego completo y la API lo valida con el mismo motor que calcula. */
function RulesEditor({ groupId, structure, onSaved }: { groupId: string; structure: Structure; onSaved: () => void }) {
  const [rules, setRules] = useState<SalaryRule[]>(structure.rules ?? []);
  const save = useMutation({
    mutationFn: () =>
      api(`/groups/${groupId}/structures/${structure.id}`, { method: "PATCH", body: JSON.stringify({ rules }) }),
    onSuccess: onSaved,
  });

  const update = (index: number, changes: Partial<SalaryRule>) =>
    setRules((current) => current.map((rule, i) => (i === index ? { ...rule, ...changes } : rule)));

  function addRule() {
    const sequence = Math.max(0, ...rules.map((r) => r.sequence)) + 10;
    setRules([
      ...rules,
      {
        code: "",
        name: "",
        sequence,
        appearsOnPayslip: true,
        condition: "always",
        quantitySource: "one",
        quantityCode: null,
        amountType: "fixed",
        amountFix: 0,
        baseCodes: null,
        amountCapParam: null,
        rate: 100,
      },
    ]);
  }

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[13px] text-gris">
        Cada línea vale <b>monto × cantidad × tasa / 100</b>. Una regla puede sumar reglas de secuencia menor por su
        código. Las tasas negativas son deducciones.
      </p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[64rem] text-[13px]">
          <thead>
            <tr className="rotulo text-left text-gris">
              <th className="p-1.5">Sec.</th>
              <th className="p-1.5">Código</th>
              <th className="p-1.5">Nombre</th>
              <th className="p-1.5">Cantidad</th>
              <th className="p-1.5">Monto</th>
              <th className="p-1.5">Tope</th>
              <th className="p-1.5">Tasa %</th>
              <th className="p-1.5">Visible</th>
              <th className="p-1.5" />
            </tr>
          </thead>
          <tbody className="align-top">
            {rules.map((rule, i) => (
              <tr key={i} className="border-t border-borde">
                <td className="w-16 p-1.5">
                  <input type="number" aria-label="Secuencia" className={cell} value={rule.sequence}
                    onChange={(e) => update(i, { sequence: Number(e.target.value) })} />
                </td>
                <td className="w-24 p-1.5">
                  <input aria-label="Código" className={`${cell} uppercase`} value={rule.code}
                    onChange={(e) => update(i, { code: e.target.value.toUpperCase() })} />
                </td>
                <td className="w-44 p-1.5">
                  <input aria-label="Nombre" className={cell} value={rule.name}
                    onChange={(e) => update(i, { name: e.target.value })} />
                </td>
                <td className="w-44 p-1.5">
                  <select aria-label="Cantidad" className={cell} value={rule.quantitySource}
                    onChange={(e) => update(i, {
                      quantitySource: e.target.value as SalaryRule["quantitySource"],
                      quantityCode: e.target.value === "worked_hours" ? "OT_DAY" : null,
                    })}>
                    {Object.entries(QUANTITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  {rule.quantitySource === "worked_hours" && (
                    <select aria-label="Horas" className={`${cell} mt-1`} value={rule.quantityCode ?? ""}
                      onChange={(e) => update(i, { quantityCode: e.target.value })}>
                      <option value="WORK">Ordinarias</option>
                      <option value="NIGHT">Nocturnas ord.</option>
                      <option value="OT_DAY">Extra diurnas</option>
                      <option value="OT_NIGHT">Extra nocturnas</option>
                    </select>
                  )}
                  {rule.quantitySource === "input" && (
                    <input aria-label="Código de entrada" placeholder="BONO" className={`${cell} mt-1 uppercase`}
                      value={rule.quantityCode ?? ""} onChange={(e) => update(i, { quantityCode: e.target.value.toUpperCase() || null })} />
                  )}
                  <label className="mt-1 flex items-center gap-1 text-[12px] text-gris">
                    <input type="checkbox" checked={rule.condition === "nonzero_quantity"}
                      onChange={(e) => update(i, { condition: e.target.checked ? "nonzero_quantity" : "always" })} />
                    Omitir si es 0
                  </label>
                </td>
                <td className="w-48 p-1.5">
                  <select aria-label="Monto" className={cell} value={rule.amountType}
                    onChange={(e) => {
                      const amountType = e.target.value as SalaryRule["amountType"];
                      update(i, {
                        amountType,
                        amountFix: amountType === "fixed" ? (rule.amountFix ?? 0) : null,
                        baseCodes: amountType === "percentage_of" ? (rule.baseCodes ?? []) : null,
                      });
                    }}>
                    {Object.entries(AMOUNT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                  </select>
                  {rule.amountType === "fixed" && (
                    <input type="number" step="0.01" aria-label="Monto fijo" className={`${cell} mt-1`} value={rule.amountFix ?? 0}
                      onChange={(e) => update(i, { amountFix: Number(e.target.value) })} />
                  )}
                  {rule.amountType === "percentage_of" && (
                    <input aria-label="Reglas que suma" placeholder="BASIC, HED" className={`${cell} mt-1 uppercase`}
                      value={(rule.baseCodes ?? []).join(", ")}
                      onChange={(e) => update(i, {
                        baseCodes: e.target.value.toUpperCase().split(",").map((c) => c.trim()).filter(Boolean),
                      })} />
                  )}
                </td>
                <td className="w-36 p-1.5">
                  <input aria-label="Parámetro de tope" placeholder="—" className={`${cell} uppercase`} value={rule.amountCapParam ?? ""}
                    onChange={(e) => update(i, { amountCapParam: e.target.value.toUpperCase() || null })} />
                </td>
                <td className="w-20 p-1.5">
                  <input type="number" step="0.01" aria-label="Tasa" className={cell} value={rule.rate}
                    onChange={(e) => update(i, { rate: Number(e.target.value) })} />
                </td>
                <td className="p-1.5 text-center">
                  <input type="checkbox" aria-label="Visible en el recibo" checked={rule.appearsOnPayslip}
                    onChange={(e) => update(i, { appearsOnPayslip: e.target.checked })} />
                </td>
                <td className="p-1.5">
                  <button type="button" aria-label={`Quitar ${rule.code}`} className="text-gris hover:text-error-texto"
                    onClick={() => setRules(rules.filter((_, j) => j !== i))}>✕</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {save.isError && <ErrorBox error={save.error} />}
      {save.isSuccess && <p className="text-sm text-exito-texto">Reglas guardadas.</p>}
      <div className="flex justify-between gap-2">
        <Button variant="secondary" onClick={addRule}>Agregar regla</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isPending ? "Guardando…" : "Guardar reglas"}</Button>
      </div>
    </div>
  );
}

export default function CatalogoPage() {
  const { companyId } = useParams<{ companyId: string }>();
  const queryClient = useQueryClient();
  const company = useCurrentCompany(companyId);
  const groupId = company?.group.id;
  const [selected, setSelected] = useState<string | null>(null);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["groups", groupId] });
  const structures = useQuery({
    queryKey: ["groups", groupId, "structures"],
    queryFn: () => api<{ structures: (Structure & { rules: number })[] }>(`/groups/${groupId}/structures`).then((r) => r.structures),
    enabled: Boolean(groupId),
  });
  const structure = useQuery({
    queryKey: ["groups", groupId, "structures", selected],
    queryFn: () => api<{ structure: Structure }>(`/groups/${groupId}/structures/${selected}`).then((r) => r.structure),
    enabled: Boolean(groupId && selected),
  });
  const parameters = useQuery({
    queryKey: ["groups", groupId, "parameters"],
    queryFn: () => api<{ parameters: PayrollParameter[] }>(`/groups/${groupId}/parameters`).then((r) => r.parameters),
    enabled: Boolean(groupId),
  });
  const inputTypes = useQuery({
    queryKey: ["groups", groupId, "input-types"],
    queryFn: () => api<{ inputTypes: InputType[] }>(`/groups/${groupId}/input-types`).then((r) => r.inputTypes),
    enabled: Boolean(groupId),
  });

  const post = useMutation({
    mutationFn: ({ path, body, method = "POST" }: { path: string; body?: unknown; method?: string }) =>
      api(`/groups/${groupId}/${path}`, { method, body: body ? JSON.stringify(body) : undefined }),
    onSuccess: () => void invalidate(),
  });

  function submit(path: string, method = "POST", numeric: string[] = []) {
    return (event: FormEvent<HTMLFormElement>) => {
      event.preventDefault();
      const form = event.currentTarget;
      const body: Record<string, unknown> = Object.fromEntries(new FormData(form));
      for (const key of numeric) body[key] = Number(body[key]);
      post.mutate({ path, body, method }, { onSuccess: () => form.reset() });
    };
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href={`/rrhh/${companyId}/nomina`} className="text-sm font-semibold text-kru-700 hover:text-kru-800">
        ← Nómina
      </Link>
      <div>
        <h1 className="text-2xl font-bold tracking-[-0.025em]">Estructuras y parámetros</h1>
        <p className="mt-1 text-sm text-gris">Se comparten entre todas las empresas de {company?.group.name ?? "el grupo"}.</p>
      </div>
      {post.isError && <ErrorBox error={post.error} />}

      <Card>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-semibold">Estructuras salariales</h2>
          <Button variant="secondary" disabled={post.isPending} onClick={() => post.mutate({ path: "structures/sample" })}>
            Instalar estructura de referencia
          </Button>
        </div>
        <div className="mt-3">
          {!structures.data?.length ? (
            <EmptyState>
              No hay estructuras. Instala la de referencia (Quincenal VE: salario, horas extra, bono nocturno, IVSS, RPE y
              FAOV) y ajústala.
            </EmptyState>
          ) : (
            <ul className="flex flex-col gap-2">
              {structures.data.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(selected === s.id ? null : s.id)}
                    aria-expanded={selected === s.id}
                    className="flex w-full items-center gap-3 rounded-xl border border-borde px-3.5 py-2.5 text-left hover:border-kru-300"
                  >
                    <span className="flex-1 text-sm font-semibold">{s.name}</span>
                    <span className="text-[13px] text-gris">{SCHEDULE_LABEL[s.schedulePay]} · {s.rules} reglas</span>
                    {!s.active && <Badge tone="error">Inactiva</Badge>}
                  </button>
                  {selected === s.id && structure.data && groupId && (
                    <div className="mt-2 rounded-xl border border-borde p-3">
                      <RulesEditor key={structure.data.id} groupId={groupId} structure={structure.data} onSaved={() => void invalidate()} />
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="font-semibold">Parámetros</h2>
          <p className="mt-1 text-[13px] text-gris">Rige el valor más reciente hasta el cierre de cada período.</p>
          <ul className="mt-3 flex flex-col gap-2">
            {parameters.data?.map((param) => (
              <li key={param.id} className="rounded-xl border border-borde p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span><b>{param.code}</b> · {param.name}</span>
                </div>
                <ul className="mt-1 text-[13px] text-gris tabular-nums">
                  {param.values.map((v) => (
                    <li key={v.dateFrom}>Desde {formatDay(v.dateFrom)}: {formatMoney(v.value)}</li>
                  ))}
                </ul>
                <form onSubmit={submit(`parameters/${param.id}/values`, "PUT", ["value"])} className="mt-2 flex flex-wrap items-end gap-2">
                  <input type="date" name="dateFrom" defaultValue={todayInCaracas()} required aria-label="Desde"
                    className="rounded-md border border-borde-fuerte px-2 py-1.5 text-[13px]" />
                  <input type="number" step="0.01" name="value" required aria-label="Valor" placeholder="Valor"
                    className="w-28 rounded-md border border-borde-fuerte px-2 py-1.5 text-[13px]" />
                  <Button variant="secondary" type="submit">Nuevo valor</Button>
                </form>
              </li>
            ))}
          </ul>
          <form onSubmit={submit("parameters", "POST", ["value"])} className="mt-4 grid gap-2 border-t border-borde pt-4 sm:grid-cols-2">
            <Input label="Código" name="code" placeholder="SALARIO_MINIMO" required />
            <Input label="Nombre" name="name" required />
            <Input label="Valor" name="value" type="number" step="0.01" required />
            <Input label="Desde" name="dateFrom" type="date" defaultValue={todayInCaracas()} required />
            <div className="sm:col-span-2"><Button type="submit">Crear parámetro</Button></div>
          </form>
        </Card>

        <Card>
          <h2 className="font-semibold">Entradas manuales</h2>
          <p className="mt-1 text-[13px] text-gris">Valores que RRHH carga en cada recibo (bonos, descuentos…). Las reglas las usan por código.</p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {inputTypes.data?.map((type) => (
              <li key={type.id} className="rounded-full border border-borde bg-hueso/60 px-2.5 py-1 text-[12px] text-gris">
                <b className="text-grafito">{type.code}</b> · {type.name}
              </li>
            ))}
          </ul>
          <form onSubmit={submit("input-types")} className="mt-4 grid gap-2 border-t border-borde pt-4 sm:grid-cols-2">
            <Input label="Código" name="code" placeholder="BONO" required />
            <Input label="Nombre" name="name" required />
            <div className="sm:col-span-2"><Button type="submit">Crear entrada</Button></div>
          </form>
        </Card>
      </div>
    </div>
  );
}
