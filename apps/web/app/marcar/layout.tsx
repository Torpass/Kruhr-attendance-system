"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { useLogout, useSession } from "@/lib/session";

export default function MarcarLayout({ children }: LayoutProps<"/marcar">) {
  const { data: user } = useSession();
  const logout = useLogout();

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-borde bg-white">
        <div className="mx-auto flex max-w-md items-center justify-between gap-3 px-4 py-3">
          <Link href="/marcar" aria-label="Inicio">
            <Logo />
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/marcar/contrasena" className="text-sm font-semibold text-kru-700 hover:text-kru-800">
              Contraseña
            </Link>
            <Button variant="secondary" onClick={() => void logout()}>
              Salir
            </Button>
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-md flex-1 px-4 py-6">
        {user?.kind === "employee" && (
          <p className="mb-4 text-sm text-gris">
            <span className="font-semibold text-grafito">{user.name}</span> · {user.companyName}
          </p>
        )}
        {children}
      </main>
    </>
  );
}
