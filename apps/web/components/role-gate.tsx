"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { EmptyState } from "@/components/ui/card";
import { errorMessage, type Role } from "@/lib/api";
import { homeFor, useSession } from "@/lib/session";

/**
 * Muestra la sección solo a los roles que la usan y manda a los demás a su inicio.
 * Es navegación, no seguridad: la API sigue autorizando cada request.
 */
export function RoleGate({ roles, children }: { roles: Role[]; children: ReactNode }) {
  const router = useRouter();
  const session = useSession();
  const user = session.data;
  const allowed = user !== undefined && roles.includes(user.role);

  useEffect(() => {
    if (user && !allowed) router.replace(homeFor(user));
  }, [user, allowed, router]);

  if (allowed) return children;
  return (
    <main className="grid flex-1 place-items-center p-6">
      {session.isError ? (
        <EmptyState>{errorMessage(session.error)}</EmptyState>
      ) : (
        <p className="text-sm text-gris">Cargando…</p>
      )}
    </main>
  );
}
