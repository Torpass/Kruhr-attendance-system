"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/lib/session";

/** Entrada después del login: el colaborador va a marcar y la gestión a RRHH. */
export default function PanelPage() {
  const router = useRouter();
  const { data: user } = useSession();

  useEffect(() => {
    if (user) router.replace(user.kind === "employee" ? "/marcar" : "/rrhh");
  }, [user, router]);

  return (
    <main className="grid flex-1 place-items-center p-6">
      <p className="text-sm text-gris">Cargando…</p>
    </main>
  );
}
