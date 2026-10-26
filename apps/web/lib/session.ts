"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, type SessionUser } from "./api";

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ user: SessionUser }>("/auth/me").then(({ user }) => user),
    staleTime: 60_000,
    // El navegador guarda una sola sesión: si se entró con otra cuenta en otra pestaña,
    // esta se entera al volver a ella.
    refetchOnWindowFocus: "always",
  });
}

/** Pantalla de inicio de cada quien. */
export function homeFor(user: SessionUser) {
  return user.kind === "employee" ? "/marcar" : user.role === "superadmin" ? "/admin" : "/rrhh";
}

export function useLogout() {
  const router = useRouter();
  const queryClient = useQueryClient();
  return async () => {
    await api("/auth/logout", { method: "POST" });
    queryClient.clear();
    router.replace("/login");
  };
}
