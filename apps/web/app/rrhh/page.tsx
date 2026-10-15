"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { EmptyState } from "@/components/ui/card";
import { lastCompany, useCompanies } from "@/lib/companies";

/** Abre la última empresa usada, o la primera de la sesión. */
export default function RrhhIndex() {
  const router = useRouter();
  const { data: companies } = useCompanies();

  useEffect(() => {
    if (!companies?.length) return;
    const remembered = lastCompany();
    const target = companies.find((c) => c.id === remembered) ?? companies[0];
    router.replace(`/rrhh/${target.id}/hoy`);
  }, [companies, router]);

  return (
    <main className="mx-auto grid w-full max-w-md flex-1 place-items-center p-6">
      {companies && companies.length === 0 ? (
        <EmptyState>No tienes empresas asignadas. Pide a un administrador que te asigne una.</EmptyState>
      ) : (
        <p className="text-sm text-gris">Cargando…</p>
      )}
    </main>
  );
}
