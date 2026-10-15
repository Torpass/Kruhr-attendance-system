"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "./api";
import type { Company } from "./types";

const LAST_COMPANY_KEY = "marcaje:last-company";

export function useCompanies() {
  return useQuery({
    queryKey: ["companies"],
    queryFn: () => api<{ companies: Company[] }>("/companies").then((r) => r.companies),
    staleTime: 5 * 60_000,
  });
}

/** Última empresa elegida en este navegador (comodidad; la API decide el acceso). */
export function rememberCompany(id: string) {
  try {
    localStorage.setItem(LAST_COMPANY_KEY, id);
  } catch {
    // Navegación privada o almacenamiento bloqueado: no pasa nada.
  }
}

export function lastCompany(): string | null {
  try {
    return localStorage.getItem(LAST_COMPANY_KEY);
  } catch {
    return null;
  }
}

/** Empresa de la URL con su grupo (el catálogo de nómina y el equipo son del grupo). */
export function useCurrentCompany(companyId: string) {
  const { data: companies } = useCompanies();
  return companies?.find((company) => company.id === companyId);
}
