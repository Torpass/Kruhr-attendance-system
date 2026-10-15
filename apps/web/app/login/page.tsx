"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { api, ApiError } from "@/lib/api";

type Mode = "employee" | "staff";

const TABS: { mode: Mode; label: string }[] = [
  { mode: "employee", label: "Colaborador" },
  { mode: "staff", label: "Gestión" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("employee");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function changeMode(next: Mode) {
    setMode(next);
    setError(null);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    setPending(true);
    setError(null);
    try {
      await api(mode === "staff" ? "/auth/staff/login" : "/auth/employee/login", {
        method: "POST",
        body: JSON.stringify(form),
      });
      router.replace("/panel");
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? "Demasiados intentos. Espera un minuto."
          : err instanceof ApiError
            ? err.message
            : "No pudimos conectar con el servidor.",
      );
      setPending(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-borde bg-white p-6 shadow-kru-lg sm:p-8">
        <Logo />
        <h1 className="mt-6 text-[1.75rem] font-bold leading-[1.15] tracking-[-0.025em]">
          Inicia sesión
        </h1>
        <p className="mt-2 text-sm text-gris">
          Entra para marcar o gestionar a tu equipo.
        </p>

        <div
          role="tablist"
          aria-label="Tipo de acceso"
          className="mt-6 grid grid-cols-2 gap-1 rounded-lg bg-hueso p-1"
        >
          {TABS.map((tab) => (
            <button
              key={tab.mode}
              type="button"
              role="tab"
              id={`tab-${tab.mode}`}
              aria-selected={mode === tab.mode}
              aria-controls="login-form"
              onClick={() => changeMode(tab.mode)}
              className={`rounded-md px-3 py-2 text-sm font-semibold transition-colors ${
                mode === tab.mode
                  ? "bg-white text-grafito shadow-kru"
                  : "text-gris hover:text-grafito"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <form
          key={mode}
          id="login-form"
          role="tabpanel"
          aria-labelledby={`tab-${mode}`}
          onSubmit={onSubmit}
          className="mt-5 flex flex-col gap-4"
        >
          {mode === "employee" ? (
            <>
              <Input
                label="Código de empresa"
                name="company"
                autoComplete="organization"
                autoCapitalize="none"
                placeholder="empresa-a-norte"
                required
              />
              <Input
                label="Cédula"
                name="cedula"
                inputMode="numeric"
                autoComplete="username"
                placeholder="12345678"
                required
              />
              <Input
                label="PIN"
                name="pin"
                type="password"
                inputMode="numeric"
                autoComplete="current-password"
                pattern="\d{4,6}"
                title="De 4 a 6 dígitos"
                required
              />
            </>
          ) : (
            <>
              <Input
                label="Correo"
                name="email"
                type="email"
                autoComplete="username"
                required
              />
              <Input
                label="Contraseña"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
            </>
          )}
          {error && (
            <p
              role="alert"
              className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto"
            >
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
            {pending ? "Entrando…" : "Entrar"}
          </Button>
        </form>
      </div>
    </main>
  );
}
