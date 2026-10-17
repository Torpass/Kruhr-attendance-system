"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { Icon, type IconName } from "@/components/ui/icons";
import { Logo } from "@/components/ui/logo";
import { lastCompany, useCompanies } from "@/lib/companies";
import { useLogout, useSession } from "@/lib/session";

const ROLE_LABEL = { superadmin: "Superusuario", admin: "Administrador", analyst: "Analista" } as const;

type Item = { href: string; label: string; icon: IconName };
type Group = { title: string; items: Item[] };

/**
 * Estructura de la gestión: el panel (KPIs) arriba y cada operación en su grupo. Los ítems
 * que el rol no puede usar no se muestran; la API decide el acceso de todas formas.
 */
function navigation(companyId: string | undefined, role: string | undefined): Group[] {
  const isAdmin = role === "admin" || role === "superadmin";
  const base = `/rrhh/${companyId}`;
  const groups: Group[] = [];

  if (companyId) {
    groups.push(
      {
        title: "Operación",
        items: [
          { href: `${base}/hoy`, label: "Asistencia de hoy", icon: "clock" },
          { href: `${base}/periodos`, label: "Períodos", icon: "calendar" },
          { href: `${base}/nomina`, label: "Lotes de nómina", icon: "wallet" },
        ],
      },
      {
        title: "Personas",
        items: [
          { href: `${base}/colaboradores`, label: "Colaboradores", icon: "users" },
          ...(isAdmin ? [{ href: `${base}/equipo`, label: "Equipo", icon: "shield" } as Item] : []),
        ],
      },
    );
  }

  const settings: Item[] = [];
  if (companyId) {
    settings.push(
      { href: `${base}/configuracion/estructuras`, label: "Estructuras salariales", icon: "list" },
      { href: `${base}/configuracion/horarios`, label: "Horarios", icon: "hourglass" },
      { href: `${base}/configuracion/parametros`, label: "Parámetros legales", icon: "sliders" },
      { href: `${base}/configuracion/conceptos`, label: "Conceptos manuales", icon: "edit" },
    );
  }
  if (role === "superadmin") settings.push({ href: "/admin", label: "Empresas", icon: "building" });
  if (settings.length) groups.push({ title: "Configuración", items: settings });

  return groups;
}

/** El ítem activo es el de href más largo que contiene la ruta (catálogo gana a nómina). */
function activeHref(pathname: string, hrefs: string[]) {
  return hrefs
    .filter((href) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.length - a.length)[0];
}

function NavLink({ item, active, onNavigate }: { item: Item; active: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={item.href}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
        active ? "bg-kru-100 text-kru-800" : "text-gris hover:bg-hueso hover:text-grafito"
      }`}
    >
      <Icon name={item.icon} className={`h-5 w-5 shrink-0 ${active ? "text-kru-700" : ""}`} />
      {item.label}
    </Link>
  );
}

/** Layout de gestión con barra lateral. `companyId` es la empresa abierta (la de la URL). */
export function AppShell({ companyId, children }: { companyId?: string; children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { data: user } = useSession();
  const { data: companies } = useCompanies();
  const logout = useLogout();
  const [open, setOpen] = useState(false);

  // Fuera de una empresa (p. ej. /admin) la navegación apunta a la última usada.
  const current =
    companyId ??
    companies?.find((c) => c.id === lastCompany())?.id ??
    companies?.[0]?.id;
  const groups = navigation(current, user?.role);
  const dashboard: Item | null = current ? { href: `/rrhh/${current}`, label: "Panel", icon: "panel" } : null;
  const hrefs = [dashboard, ...groups.flatMap((g) => g.items)].filter(Boolean).map((i) => i!.href);
  const active = activeHref(pathname, hrefs);
  const close = () => setOpen(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  function switchCompany(id: string) {
    // Conserva la sección al cambiar de empresa; desde /admin abre su panel.
    router.push(companyId ? pathname.replace(`/rrhh/${companyId}`, `/rrhh/${id}`) : `/rrhh/${id}`);
    close();
  }

  const sidebar = (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between px-5 py-4">
        <Link href={dashboard?.href ?? "/rrhh"} onClick={close} aria-label="Inicio">
          <Logo />
        </Link>
        <button
          type="button"
          onClick={close}
          aria-label="Cerrar menú"
          className="grid h-9 w-9 place-items-center rounded-lg text-gris hover:bg-hueso lg:hidden"
        >
          <Icon name="close" />
        </button>
      </div>

      {companies && companies.length > 0 && (
        <label className="mx-4 mb-2 flex flex-col gap-1.5">
          <span className="rotulo px-1 text-gris">Empresa</span>
          <select
            value={companyId ?? ""}
            onChange={(event) => switchCompany(event.target.value)}
            className="w-full rounded-lg border border-borde-fuerte bg-white px-3 py-2 text-sm font-medium focus:border-kru-500 focus:outline-none focus:ring-4 focus:ring-kru-100"
          >
            {!companyId && <option value="" disabled>Elige una empresa</option>}
            {companies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </select>
        </label>
      )}

      <nav aria-label="Secciones" className="flex-1 overflow-y-auto px-3 py-2">
        {dashboard && <NavLink item={dashboard} active={active === dashboard.href} onNavigate={close} />}
        {groups.map((group) => (
          <details key={group.title} open className="group mt-4">
            <summary className="rotulo flex cursor-pointer list-none items-center justify-between rounded-lg px-3 py-1.5 text-gris-claro hover:text-gris [&::-webkit-details-marker]:hidden">
              {group.title}
              <Icon name="chevron" className="h-4 w-4 transition-transform group-open:rotate-90" />
            </summary>
            <ul className="mt-1 flex flex-col gap-0.5">
              {group.items.map((item) => (
                <li key={item.href}>
                  <NavLink item={item} active={active === item.href} onNavigate={close} />
                </li>
              ))}
            </ul>
          </details>
        ))}
      </nav>

      {user?.kind === "staff" && (
        <div className="flex items-center gap-3 border-t border-borde px-5 py-4">
          <span className="min-w-0 flex-1 text-[13px] leading-tight">
            <span className="block truncate font-semibold">{user.name}</span>
            <span className="text-gris">{ROLE_LABEL[user.role]}</span>
          </span>
          <button
            type="button"
            onClick={() => void logout()}
            aria-label="Salir"
            title="Salir"
            className="grid h-9 w-9 place-items-center rounded-lg text-gris hover:bg-hueso hover:text-grafito"
          >
            <Icon name="logout" />
          </button>
        </div>
      )}
    </div>
  );

  return (
    <div className="flex min-h-full flex-1">
      {/* Escritorio: barra fija. Móvil: cajón que se abre desde la barra superior. */}
      <aside className="fixed inset-y-0 left-0 z-20 hidden w-64 border-r border-borde bg-white lg:block">{sidebar}</aside>

      {open && (
        <div className="fixed inset-0 z-30 lg:hidden">
          <button type="button" aria-label="Cerrar menú" onClick={close} className="absolute inset-0 bg-grafito/40" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85%] bg-white shadow-kru-lg">{sidebar}</aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col lg:pl-64">
        <header className="sticky top-0 z-10 flex items-center gap-3 border-b border-borde bg-white px-4 py-3 lg:hidden">
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="Abrir menú"
            aria-expanded={open}
            className="grid h-9 w-9 place-items-center rounded-lg text-grafito hover:bg-hueso"
          >
            <Icon name="menu" />
          </button>
          <Logo />
        </header>
        <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">{children}</main>
      </div>
    </div>
  );
}
