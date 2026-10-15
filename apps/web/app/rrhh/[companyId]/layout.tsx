"use client";

import Link from "next/link";
import { useParams, usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/ui/logo";
import { rememberCompany, useCompanies } from "@/lib/companies";
import { useLogout, useSession } from "@/lib/session";

const ROLE_LABEL = { superadmin: "Superusuario", admin: "Administrador", analyst: "Analista" } as const;

const SECTIONS = [
  { segment: "hoy", label: "Hoy", adminOnly: false },
  { segment: "colaboradores", label: "Colaboradores", adminOnly: false },
  { segment: "periodos", label: "Períodos", adminOnly: false },
  { segment: "equipo", label: "Equipo", adminOnly: true },
] as const;

export default function RrhhLayout({ children }: LayoutProps<"/rrhh/[companyId]">) {
  const { companyId } = useParams<{ companyId: string }>();
  const pathname = usePathname();
  const router = useRouter();
  const { data: user } = useSession();
  const { data: companies } = useCompanies();
  const logout = useLogout();

  useEffect(() => rememberCompany(companyId), [companyId]);

  const section = SECTIONS.find((s) => pathname.includes(`/${s.segment}`))?.segment ?? "hoy";
  const isAdmin = user?.role === "admin" || user?.role === "superadmin";
  const sections = SECTIONS.filter((s) => !s.adminOnly || isAdmin);

  return (
    <>
      <header className="sticky top-0 z-10 border-b border-borde bg-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-3 px-4 py-3">
          <Link href="/rrhh" aria-label="Inicio" className="order-1">
            <Logo />
          </Link>
          {/* Móvil: logo y "Salir" arriba, el selector ocupa su propia fila. */}
          <label className="order-3 flex w-full min-w-0 items-center gap-2 sm:order-2 sm:ml-4 sm:w-auto">
            <span className="rotulo hidden text-gris sm:inline">Empresa</span>
            <select
              value={companyId}
              onChange={(event) => router.push(`/rrhh/${event.target.value}/${section}`)}
              className="w-full min-w-0 rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-sm font-medium focus:border-kru-500 focus:outline-none focus:ring-4 focus:ring-kru-100 sm:w-auto sm:max-w-64"
            >
              {companies?.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </select>
          </label>
          <div className="order-2 ml-auto flex items-center gap-3 sm:order-3">
            {user?.kind === "staff" && (
              <span className="hidden text-right text-[13px] leading-tight md:block">
                <span className="block font-semibold">{user.name}</span>
                <span className="text-gris">{ROLE_LABEL[user.role]}</span>
              </span>
            )}
            {user?.role === "superadmin" && (
              <Link
                href="/admin"
                className="text-sm font-semibold text-kru-700 hover:text-kru-800"
              >
                Panel
              </Link>
            )}
            <Button variant="secondary" onClick={() => void logout()}>
              Salir
            </Button>
          </div>
        </div>
        <nav aria-label="Secciones" className="mx-auto max-w-6xl px-4">
          <ul className="-mb-px flex gap-1 overflow-x-auto">
            {sections.map((s) => (
              <li key={s.segment}>
                <Link
                  href={`/rrhh/${companyId}/${s.segment}`}
                  aria-current={section === s.segment ? "page" : undefined}
                  className={`block border-b-2 px-3 py-2.5 text-sm font-semibold transition-colors ${
                    section === s.segment
                      ? "border-kru-600 text-kru-800"
                      : "border-transparent text-gris hover:text-grafito"
                  }`}
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </header>
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6">{children}</main>
    </>
  );
}
