import { AppShell } from "@/components/app-shell";
import { RoleGate } from "@/components/role-gate";

export default function AdminLayout({ children }: LayoutProps<"/admin">) {
  return (
    <RoleGate roles={["superadmin"]}>
      <AppShell>{children}</AppShell>
    </RoleGate>
  );
}
