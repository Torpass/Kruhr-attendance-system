"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { api, ApiError } from "@/lib/api";

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setPending(true);
    setError(null);
    try {
      await api("/auth/login", {
        method: "POST",
        body: JSON.stringify({
          email: form.get("email"),
          password: form.get("password"),
        }),
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

        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
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
