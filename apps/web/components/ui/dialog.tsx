"use client";

import { useEffect, useRef, type ReactNode } from "react";

const SIZES = {
  md: "m-auto w-[min(32rem,calc(100%-2rem))] rounded-2xl",
  lg: "m-auto w-[min(48rem,calc(100%-2rem))] rounded-2xl",
  side: "my-0 mr-0 ml-auto h-dvh max-h-none w-[min(30rem,100%)] rounded-l-2xl",
} as const;

/** Modal nativo (<dialog>): foco, Escape y fondo inerte los resuelve el navegador. */
export function Dialog({
  open,
  onClose,
  title,
  size = "md",
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  /** `side` abre un panel a la derecha, a toda la altura (formularios largos). */
  size?: "md" | "lg" | "side";
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="dialog-title"
      className={`${SIZES[size]} border border-borde bg-white p-0 text-grafito shadow-kru-lg backdrop:bg-grafito/40`}
    >
      <div className="p-5 sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 id="dialog-title" className="text-lg font-semibold">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="grid h-8 w-8 place-items-center rounded-lg text-gris hover:bg-hueso hover:text-grafito"
          >
            ✕
          </button>
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </dialog>
  );
}
