"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Logo } from "@/components/ui/logo";
import { api, errorMessage, type SessionUser } from "@/lib/api";

type Mode = "employee" | "staff";
type Company = { id: string; name: string };
type EmployeeLoginResponse = { user: SessionUser } | { companies: Company[] };

const TABS: { mode: Mode; label: string }[] = [
  { mode: "employee", label: "Colaborador" },
  { mode: "staff", label: "Gestión" },
];

export default function LoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<Mode>("employee");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  // Colaborador con varias empresas: guarda cédula y contraseña mientras elige dónde marcar.
  const [choice, setChoice] = useState<{
    cedula: string;
    password: string;
    companies: Company[];
  } | null>(null);

  function changeMode(next: Mode) {
    setMode(next);
    setChoice(null);
    setError(null);
  }

  async function run(action: () => Promise<void>) {
    setPending(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
      setPending(false);
    }
  }

  function loginEmployee(cedula: string, password: string, companyId?: string) {
    return run(async () => {
      const result = await api<EmployeeLoginResponse>("/auth/employee/login", {
        method: "POST",
        body: JSON.stringify({ cedula, password, companyId }),
      });
      if ("companies" in result) {
        setChoice({ cedula, password, companies: result.companies });
        setPending(false);
        return;
      }
      router.replace("/panel");
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (mode === "employee") {
      void loginEmployee(String(form.get("cedula")), String(form.get("password")));
      return;
    }
    void run(async () => {
      await api("/auth/staff/login", {
        method: "POST",
        body: JSON.stringify({ email: form.get("email"), password: form.get("password") }),
      });
      router.replace("/panel");
    });
  }

  const errorBox = error && (
    <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
      {error}
    </p>
  );

  return (
    <main className="flex flex-1 items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm rounded-2xl border border-borde bg-white p-6 shadow-kru-lg sm:p-8">
        <Logo />

        {choice ? (
          <section aria-labelledby="choose-company" className="mt-6">
            <h1
              id="choose-company"
              className="text-[1.75rem] font-bold leading-[1.15] tracking-[-0.025em]"
            >
              ¿Dónde vas a marcar?
            </h1>
            <p className="mt-2 text-sm text-gris">
              Trabajas en varias empresas. Elige en cuál registras tu jornada.
            </p>
            <ul className="mt-6 flex flex-col gap-2">
              {choice.companies.map((company) => (
                <li key={company.id}>
                  <Button
                    variant="secondary"
                    size="lg"
                    disabled={pending}
                    className="w-full justify-start"
                    onClick={() => void loginEmployee(choice.cedula, choice.password, company.id)}
                  >
                    {company.name}
                  </Button>
                </li>
              ))}
            </ul>
            {errorBox && <div className="mt-4">{errorBox}</div>}
            <button
              type="button"
              onClick={() => changeMode("employee")}
              className="mt-4 text-sm font-semibold text-kru-700 hover:text-kru-800"
            >
              Usar otra cédula
            </button>
          </section>
        ) : (
          <>
            <h1 className="mt-6 text-[1.75rem] font-bold leading-[1.15] tracking-[-0.025em]">
              Inicia sesión
            </h1>
            <p className="mt-2 text-sm text-gris">Entra para marcar o gestionar a tu equipo.</p>

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
                <Input
                  label="Cédula"
                  name="cedula"
                  inputMode="numeric"
                  autoComplete="username"
                  placeholder="12345678"
                  required
                />
              ) : (
                <Input label="Correo" name="email" type="email" autoComplete="username" required />
              )}
              <Input
                label="Contraseña"
                name="password"
                type="password"
                autoComplete="current-password"
                required
              />
              {mode === "employee" && (
                <p className="-mt-2 text-[13px] text-gris">
                  ¿La olvidaste? Pide a RRHH que te asigne una nueva.
                </p>
              )}
              {errorBox}
              <Button type="submit" size="lg" disabled={pending} className="mt-2 w-full">
                {pending ? "Entrando…" : "Entrar"}
              </Button>
            </form>
            <p className="mt-6 text-center text-sm text-gris">
              ¿Tu empresa aún no usa KruHr?{" "}
              <Link href="/registro" className="font-semibold text-kru-700 hover:text-kru-800">
                Regístrala
              </Link>
            </p>
          </>
        )}
      </div>
    </main>
  );
}
