"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { api, type SessionUser } from "./api";

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: () => api<{ user: SessionUser }>("/auth/me").then(({ user }) => user),
    staleTime: 60_000,
  });
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
