"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { api, errorMessage } from "@/lib/api";

export default function RegistroPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = Object.fromEntries(new FormData(event.currentTarget));
    if (!form.companyCode) delete form.companyCode;
    setPending(true);
    setError(null);
    try {
      await api("/auth/register", { method: "POST", body: JSON.stringify(form) });
      router.replace("/panel");
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-md rounded-2xl border border-borde bg-white p-6 shadow-kru-lg sm:p-8">
        <Logo />
        <h1 className="mt-6 text-[1.75rem] font-bold leading-[1.15] tracking-[-0.025em]">Registra tu empresa</h1>
        <p className="mt-2 text-sm text-gris">
          Crea la empresa y tu usuario de administrador. Después das de alta a tus colaboradores.
        </p>
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4">
          <Input label="Nombre de la empresa" name="companyName" autoComplete="organization" required minLength={2} />
          <Input
            label="Código de empresa (opcional)"
            name="companyCode"
            autoCapitalize="none"
            placeholder="se genera a partir del nombre"
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            title="Minúsculas, números y guiones"
          />
          <Input label="Tu nombre" name="name" autoComplete="name" required minLength={2} />
          <Input label="Correo" name="email" type="email" autoComplete="email" required />
          <Input label="Contraseña" name="password" type="password" autoComplete="new-password" required minLength={10} />
          {error && (
            <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
              {error}
            </p>
          )}
          <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
            {pending ? "Creando…" : "Crear empresa"}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-gris">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="font-semibold text-kru-700 hover:text-kru-800">
            Inicia sesión
          </Link>
        </p>
      </div>
    </main>
  );
}
