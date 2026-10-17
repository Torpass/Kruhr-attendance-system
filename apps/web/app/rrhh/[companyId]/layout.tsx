"use client";

import { useParams } from "next/navigation";
import { useEffect } from "react";
import { AppShell } from "@/components/app-shell";
import { rememberCompany } from "@/lib/companies";

export default function RrhhLayout({ children }: LayoutProps<"/rrhh/[companyId]">) {
  const { companyId } = useParams<{ companyId: string }>();

  useEffect(() => rememberCompany(companyId), [companyId]);

  return <AppShell companyId={companyId}>{children}</AppShell>;
}
