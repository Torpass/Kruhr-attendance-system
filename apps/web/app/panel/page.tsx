"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { api, ApiError, type SessionUser } from "@/lib/api";

type Health = { status: string; db: "up" | "down" };

const ROLE_LABEL: Record<SessionUser["role"], string> = {
  superadmin: "Superusuario",
  admin: "Administrador",
  analyst: "Analista",
  employee: "Colaborador",
};

export default function PanelPage() {
  const router = useRouter();
  const [user, setUser] = useState<SessionUser | null>(null);
  const [health, setHealth] = useState<Health | null>(null);

  useEffect(() => {
    api<{ user: SessionUser }>("/auth/me")
      .then(({ user }) => setUser(user))
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) router.replace("/login");
      });
    api<Health>("/health")
      .then(setHealth)
      .catch(() => setHealth({ status: "error", db: "down" }));
  }, [router]);

  async function logout() {
    await api("/auth/logout", { method: "POST" });
    router.replace("/login");
  }

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-borde bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Logo />
          <Button variant="secondary" onClick={logout}>
            Cerrar sesión
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl px-4 py-8">
        <section className="rounded-2xl border border-borde bg-white p-5 shadow-kru-md sm:p-6">
          <p className="rotulo text-gris">Sesión</p>
          {user ? (
            <div className="mt-3 flex items-center gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-kru-100 text-sm font-semibold text-kru-800">
                {user.name.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0">
                <p className="font-semibold">{user.name}</p>
                <p className="truncate text-[13px] text-gris">
                  {user.kind === "staff"
                    ? user.email
                    : `C.I. ${user.cedula} · ${user.companyName}`}
                </p>
              </div>
              <span className="ml-auto">
                <Badge>{ROLE_LABEL[user.role]}</Badge>
              </span>
            </div>
          ) : (
            <p className="mt-3 text-sm text-gris">Cargando…</p>
          )}
        </section>

        <section className="mt-4 grid gap-3 sm:grid-cols-2">
          <StatusCard label="API · NestJS" ok={health !== null} pending={!health} />
          <StatusCard
            label="Base de datos · Supabase"
            ok={health?.db === "up"}
            pending={!health}
          />
        </section>
      </main>
    </>
  );
}

function StatusCard({
  label,
  ok,
  pending,
}: {
  label: string;
  ok: boolean;
  pending: boolean;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-borde bg-white p-3.5">
      <p className="rotulo text-gris">{label}</p>
      {pending ? (
        <Badge tone="alerta">Verificando</Badge>
      ) : ok ? (
        <Badge tone="exito">Conectado</Badge>
      ) : (
        <Badge tone="error">Sin conexión</Badge>
      )}
    </div>
  );
}
