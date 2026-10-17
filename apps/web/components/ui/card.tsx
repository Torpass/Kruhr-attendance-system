import type { HTMLAttributes, ReactNode } from "react";

/** `flush` quita el padding para listas que llegan al borde (un className `p-0` no le gana a `p-4`). */
export function Card({ className = "", flush = false, ...props }: HTMLAttributes<HTMLElement> & { flush?: boolean }) {
  return (
    <section
      className={`rounded-2xl border border-borde bg-white ${flush ? "" : "p-4 sm:p-6"} ${className}`}
      {...props}
    />
  );
}

/** Cifra grande con su rótulo (KPI). */
export function Stat({
  label,
  value,
  tone = "neutral",
  hint,
}: {
  label: string;
  value: ReactNode;
  tone?: "neutral" | "marca" | "alerta";
  /** Contexto corto bajo la cifra (p. ej. "de 12 activos"). */
  hint?: ReactNode;
}) {
  const tones = {
    neutral: "border-borde bg-white",
    marca: "border-kru-100 bg-kru-50",
    alerta: "border-alerta-fondo bg-alerta-fondo/40",
  } as const;
  return (
    <div className={`rounded-xl border p-3.5 ${tones[tone]}`}>
      <p className="rotulo text-gris">{label}</p>
      <p className="mt-2 text-[1.75rem] font-bold leading-none tracking-[-0.02em] tabular-nums">
        {value}
      </p>
      {hint && <p className="mt-1.5 text-[13px] text-gris">{hint}</p>}
    </div>
  );
}

export function Avatar({ name }: { name: string }) {
  const initials = name
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word[0])
    .join("")
    .toUpperCase();
  return (
    <span
      aria-hidden
      className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-kru-100 text-[13px] font-semibold text-kru-800"
    >
      {initials}
    </span>
  );
}

export function EmptyState({ children }: { children: ReactNode }) {
  return <p className="rounded-xl border border-dashed border-borde px-4 py-6 text-center text-sm text-gris">{children}</p>;
}
