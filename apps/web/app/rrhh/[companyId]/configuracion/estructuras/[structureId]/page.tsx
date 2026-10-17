"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, EmptyState } from "@/components/ui/card";
import { Dialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";
import { useCurrentCompany } from "@/lib/companies";
import {
  AMOUNT_LABEL,
  describeRule,
  emptyRule,
  HOURS_LABEL,
  KIND_LABEL,
  QUANTITY_LABEL,
  ruleKind,
  SCHEDULE_LABEL,
  type RuleKind,
} from "@/lib/payroll-rules";
import type { InputType, PayrollParameter, SalaryRule, Structure } from "@/lib/types";

const fieldClass =
  "w-full rounded-lg border border-borde-fuerte bg-white px-3 py-2.5 text-sm outline-none focus:border-kru-500 focus:ring-4 focus:ring-kru-100";

/** Índice de la regla en edición, o "new" para una nueva. */
type Editing = number | "new" | null;

export default function EstructuraPage() {
  const { companyId, structureId } = useParams<{ companyId: string; structureId: string }>();
  const queryClient = useQueryClient();
  const groupId = useCurrentCompany(companyId)?.group.id;
  const [editing, setEditing] = useState<Editing>(null);

  const structure = useQuery({
    queryKey: ["groups", groupId, "structures", structureId],
    queryFn: () => api<{ structure: Structure }>(`/groups/${groupId}/structures/${structureId}`).then((r) => r.structure),
    enabled: Boolean(groupId),
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

  // La API reemplaza el juego completo de reglas y lo valida con el mismo motor que calcula.
  const update = useMutation({
    mutationFn: (body: Partial<Pick<Structure, "active" | "rules">>) =>
      api(`/groups/${groupId}/structures/${structureId}`, { method: "PATCH", body: JSON.stringify(body) }),
    onSuccess: () => {
      setEditing(null);
      void queryClient.invalidateQueries({ queryKey: ["groups", groupId, "structures"] });
    },
  });

  const data = structure.data;
  const rules = data?.rules ?? [];
  const names = Object.fromEntries([
    ...(parameters.data ?? []).map((p) => [p.code, p.name]),
    ...(inputTypes.data ?? []).map((t) => [t.code, t.name]),
  ]);

  function open(next: Editing) {
    update.reset();
    setEditing(next);
  }

  const back = (
    <Link href={`/rrhh/${companyId}/configuracion/estructuras`} className="text-sm font-semibold text-kru-700 hover:text-kru-800">
      ← Estructuras
    </Link>
  );

  if (structure.isError) return <div className="flex flex-col gap-4">{back}<EmptyState>{errorMessage(structure.error)}</EmptyState></div>;
  if (!data) return <div className="flex flex-col gap-4">{back}<p className="text-sm text-gris">Cargando…</p></div>;

  const groups = (["earning", "deduction", "total"] as RuleKind[])
    .map((kind) => ({
      kind,
      rules: rules
        .map((rule, index) => ({ rule, index }))
        .filter(({ rule }) => ruleKind(rule) === kind)
        .sort((a, b) => a.rule.sequence - b.rule.sequence),
    }))
    .filter((g) => g.rules.length > 0);

  return (
    <div className="flex flex-col gap-4">
      {back}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-[-0.025em]">
            {data.name} {!data.active && <Badge tone="error">Inactiva</Badge>}
          </h1>
          <p className="mt-1 text-sm text-gris">
            Pago {SCHEDULE_LABEL[data.schedulePay].toLowerCase()} · {rules.length} reglas · cada línea vale monto × cantidad
            × tasa
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="secondary"
            disabled={update.isPending}
            onClick={() => update.mutate({ active: !data.active })}
          >
            {data.active ? "Desactivar" : "Reactivar"}
          </Button>
          <Button onClick={() => open("new")}>Agregar regla</Button>
        </div>
      </div>

      {update.isError && editing === null && (
        <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
          {errorMessage(update.error)}
        </p>
      )}

      {groups.length === 0 ? (
        <EmptyState>Esta estructura todavía no tiene reglas. Agrega la primera, por ejemplo el salario base.</EmptyState>
      ) : (
        groups.map((group) => (
          <Card key={group.kind} flush>
            <h2 className="rotulo border-b border-borde px-4 py-2.5 text-gris">{KIND_LABEL[group.kind]}</h2>
            <ul className="divide-y divide-borde">
              {group.rules.map(({ rule, index }) => {
                const { formula, notes } = describeRule(rule, names);
                return (
                  <li key={rule.code}>
                    <button
                      type="button"
                      onClick={() => open(index)}
                      className="flex w-full items-start gap-3 px-4 py-3 text-left transition-colors hover:bg-hueso/60"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-semibold">{rule.name}</span>
                        <span className="block text-[13px] text-gris">{formula}</span>
                        {notes.length > 0 && (
                          <span className="mt-0.5 block text-[12px] text-gris-claro">{notes.join(" · ")}</span>
                        )}
                      </span>
                      <span className="font-mono text-[12px] text-gris-claro">{rule.code}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>
        ))
      )}

      <Dialog
        open={editing !== null}
        onClose={() => setEditing(null)}
        size="side"
        title={editing === "new" ? "Nueva regla" : editing !== null ? (rules[editing]?.name ?? "Regla") : ""}
      >
        {editing !== null && (
          <RuleForm
            key={editing}
            initial={editing === "new" ? emptyRule(Math.max(0, ...rules.map((r) => r.sequence)) + 10) : rules[editing]}
            others={rules.filter((_, i) => i !== editing)}
            parameters={parameters.data ?? []}
            inputTypes={inputTypes.data ?? []}
            names={names}
            error={update.isError ? errorMessage(update.error) : null}
            saving={update.isPending}
            onCancel={() => setEditing(null)}
            onSave={(rule) =>
              update.mutate({
                rules: editing === "new" ? [...rules, rule] : rules.map((r, i) => (i === editing ? rule : r)),
              })
            }
            onRemove={
              editing === "new"
                ? undefined
                : () => update.mutate({ rules: rules.filter((_, i) => i !== editing) })
            }
          />
        )}
      </Dialog>
    </div>
  );
}

function RuleForm({
  initial,
  others,
  parameters,
  inputTypes,
  names,
  error,
  saving,
  onCancel,
  onSave,
  onRemove,
}: {
  initial: SalaryRule;
  others: SalaryRule[];
  parameters: PayrollParameter[];
  inputTypes: InputType[];
  names: Record<string, string>;
  error: string | null;
  saving: boolean;
  onCancel: () => void;
  onSave: (rule: SalaryRule) => void;
  onRemove?: () => void;
}) {
  const [rule, setRule] = useState(initial);
  const set = (changes: Partial<SalaryRule>) => setRule((current) => ({ ...current, ...changes }));
  const deduction = rule.rate < 0;
  const { formula, notes } = describeRule(rule, names);

  function setAmountType(amountType: SalaryRule["amountType"]) {
    set({
      amountType,
      amountFix: amountType === "fixed" ? (rule.amountFix ?? 0) : null,
      baseCodes: amountType === "percentage_of" ? (rule.baseCodes ?? []) : null,
    });
  }

  function setQuantitySource(quantitySource: SalaryRule["quantitySource"]) {
    set({
      quantitySource,
      quantityCode:
        quantitySource === "worked_hours" ? "OT_DAY" : quantitySource === "input" ? (inputTypes[0]?.code ?? null) : null,
    });
  }

  function toggleBase(code: string, checked: boolean) {
    const current = rule.baseCodes ?? [];
    set({ baseCodes: checked ? [...current, code] : current.filter((c) => c !== code) });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSave({ ...rule, code: rule.code.trim().toUpperCase(), name: rule.name.trim() });
  }

  // Solo se pueden sumar reglas que se calculan antes (secuencia menor).
  const earlier = others.filter((r) => r.sequence < rule.sequence).sort((a, b) => a.sequence - b.sequence);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="grid gap-3 sm:grid-cols-[1fr_9rem]">
        <Input label="Nombre" value={rule.name} onChange={(e) => set({ name: e.target.value })} required />
        <Input
          label="Código"
          value={rule.code}
          onChange={(e) => set({ code: e.target.value.toUpperCase() })}
          placeholder="HED"
          pattern="[A-Z][A-Z0-9_]{0,29}"
          title="Mayúsculas, números y _ ; empieza con una letra"
          className="font-mono"
          required
        />
      </div>

      <fieldset>
        <legend className="rotulo mb-1.5 text-gris">Tipo</legend>
        <div className="grid grid-cols-2 gap-1 rounded-lg bg-hueso p-1">
          {[
            { value: false, label: "Suma (devengo)" },
            { value: true, label: "Resta (deducción)" },
          ].map((option) => (
            <label
              key={option.label}
              className={`cursor-pointer rounded-md px-3 py-1.5 text-center text-sm font-semibold transition-colors has-focus-visible:ring-2 has-focus-visible:ring-kru-300 ${
                deduction === option.value ? "bg-white text-grafito shadow-kru" : "text-gris hover:text-grafito"
              }`}
            >
              <input
                type="radio"
                name="kind"
                className="sr-only"
                checked={deduction === option.value}
                onChange={() => set({ rate: option.value ? -Math.abs(rule.rate) : Math.abs(rule.rate) })}
              />
              {option.label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-3">
        <legend className="rotulo mb-1.5 text-gris">Se calcula como</legend>

        <label className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">Monto</span>
          <select className={fieldClass} value={rule.amountType} onChange={(e) => setAmountType(e.target.value as SalaryRule["amountType"])}>
            {Object.entries(AMOUNT_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
        </label>
        {rule.amountType === "fixed" && (
          <Input
            label="Monto fijo (Bs.)"
            type="number"
            step="0.01"
            value={rule.amountFix ?? 0}
            onChange={(e) => set({ amountFix: Number(e.target.value) })}
          />
        )}
        {rule.amountType === "percentage_of" && (
          <div className="rounded-xl border border-borde p-3">
            <p className="mb-2 text-[13px] text-gris">Reglas que suma (solo las que se calculan antes):</p>
            {earlier.length === 0 ? (
              <p className="text-[13px] text-gris-claro">No hay reglas anteriores. Sube la secuencia en opciones avanzadas.</p>
            ) : (
              <div className="grid gap-1.5 sm:grid-cols-2">
                {earlier.map((r) => (
                  <label key={r.code} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      className="h-4 w-4 accent-kru-600"
                      checked={rule.baseCodes?.includes(r.code) ?? false}
                      onChange={(e) => toggleBase(r.code, e.target.checked)}
                    />
                    <span className="truncate">{r.name}</span>
                    <span className="font-mono text-[11px] text-gris-claro">{r.code}</span>
                  </label>
                ))}
              </div>
            )}
          </div>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_7rem]">
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Cantidad</span>
            <select className={fieldClass} value={rule.quantitySource} onChange={(e) => setQuantitySource(e.target.value as SalaryRule["quantitySource"])}>
              {Object.entries(QUANTITY_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Tasa %</span>
            <input
              type="number"
              step="0.01"
              min={0}
              className={fieldClass}
              value={Math.abs(rule.rate)}
              onChange={(e) => set({ rate: (deduction ? -1 : 1) * Math.abs(Number(e.target.value)) })}
            />
          </label>
        </div>
        {rule.quantitySource === "worked_hours" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">¿Qué horas?</span>
            <select className={fieldClass} value={rule.quantityCode ?? ""} onChange={(e) => set({ quantityCode: e.target.value })}>
              {Object.entries(HOURS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
        )}
        {rule.quantitySource === "input" && (
          <label className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium">Concepto manual</span>
            <select className={fieldClass} value={rule.quantityCode ?? ""} onChange={(e) => set({ quantityCode: e.target.value || null })} required>
              <option value="" disabled>Elige un concepto</option>
              {inputTypes.map((t) => <option key={t.code} value={t.code}>{t.name} ({t.code})</option>)}
            </select>
          </label>
        )}
      </fieldset>

      <div className="rounded-xl bg-kru-50 px-3.5 py-3 text-sm">
        <p className="rotulo text-kru-700">Resultado</p>
        <p className="mt-1 font-semibold text-grafito">
          {deduction ? "− " : "+ "}
          {formula || "—"}
        </p>
        {notes.length > 0 && <p className="mt-0.5 text-[13px] text-gris">{notes.join(" · ")}</p>}
      </div>

      <details className="group rounded-xl border border-borde">
        <summary className="flex cursor-pointer list-none items-center justify-between px-3.5 py-2.5 text-sm font-semibold [&::-webkit-details-marker]:hidden">
          Opciones avanzadas
          <span aria-hidden className="text-gris transition-transform group-open:rotate-90">›</span>
        </summary>
        <div className="flex flex-col gap-3 border-t border-borde p-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input
              label="Secuencia"
              type="number"
              min={0}
              value={rule.sequence}
              onChange={(e) => set({ sequence: Number(e.target.value) })}
            />
            <label className="flex flex-col gap-1.5">
              <span className="rotulo text-gris">Tope</span>
              <select className={fieldClass} value={rule.amountCapParam ?? ""} onChange={(e) => set({ amountCapParam: e.target.value || null })}>
                <option value="">Sin tope</option>
                {parameters.map((p) => <option key={p.code} value={p.code}>{p.name}</option>)}
              </select>
            </label>
          </div>
          <p className="text-[12px] text-gris">La secuencia es el orden de cálculo: una regla solo puede sumar reglas con secuencia menor.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-kru-600" checked={rule.appearsOnPayslip}
              onChange={(e) => set({ appearsOnPayslip: e.target.checked })} />
            Mostrar en el recibo
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-kru-600" checked={rule.condition === "nonzero_quantity"}
              onChange={(e) => set({ condition: e.target.checked ? "nonzero_quantity" : "always" })} />
            Omitir la línea si la cantidad es 0
          </label>
        </div>
      </details>

      {error && (
        <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">{error}</p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-borde pt-4">
        {onRemove ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => window.confirm(`¿Quitar la regla ${initial.name}?`) && onRemove()}
            className="text-sm font-semibold text-error-texto hover:underline"
          >
            Quitar regla
          </button>
        ) : <span />}
        <div className="flex gap-2">
          <Button type="button" variant="secondary" onClick={onCancel}>Cancelar</Button>
          <Button type="submit" disabled={saving}>{saving ? "Guardando…" : "Guardar"}</Button>
        </div>
      </div>
    </form>
  );
}
