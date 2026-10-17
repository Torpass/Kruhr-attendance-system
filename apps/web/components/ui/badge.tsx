import type { ReactNode } from "react";

const tones = {
  marca: "bg-kru-100 text-kru-800",
  exito: "bg-exito-fondo text-exito-texto",
  alerta: "bg-alerta-fondo text-alerta-texto",
  error: "bg-error-fondo text-error-texto",
  neutro: "bg-hueso text-gris",
} as const;

export function Badge({
  tone = "marca",
  children,
}: {
  tone?: keyof typeof tones;
  children: ReactNode;
}) {
  return (
    <span className={`rotulo shrink-0 rounded-full px-2.5 py-1 ${tones[tone]}`}>
      {children}
    </span>
  );
}
