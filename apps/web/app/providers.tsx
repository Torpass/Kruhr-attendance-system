"use client";

import { QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { ApiError } from "@/lib/api";

// La sesión venció o se revocó (persona o empresa desactivada): volver al login.
let goToLogin: (() => void) | undefined;
function onUnauthorized(error: unknown) {
  if (error instanceof ApiError && error.status === 401) goToLogin?.();
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient() {
  const create = () =>
    new QueryClient({
      queryCache: new QueryCache({ onError: onUnauthorized }),
      defaultOptions: {
        queries: {
          // Los errores 4xx no se reintentan: no van a cambiar.
          retry: (count, error) =>
            !(error instanceof ApiError && error.status < 500) && count < 2,
          staleTime: 10_000,
        },
      },
    });
  // Un cliente por render en el servidor; uno solo en el navegador.
  if (typeof window === "undefined") return create();
  browserQueryClient ??= create();
  return browserQueryClient;
}

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    goToLogin = () => {
      getQueryClient().clear();
      router.replace("/login");
    };
  }, [router]);
  return <QueryClientProvider client={getQueryClient()}>{children}</QueryClientProvider>;
}
