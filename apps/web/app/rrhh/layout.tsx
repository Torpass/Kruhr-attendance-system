import { RoleGate } from "@/components/role-gate";

export default function RrhhRootLayout({ children }: LayoutProps<"/rrhh">) {
  return <RoleGate roles={["superadmin", "admin", "analyst"]}>{children}</RoleGate>;
}
