export type Role = "superadmin" | "admin" | "analyst" | "employee";

/** Espejo de `SessionUser` de la API (apps/api/src/common/auth/session.ts). */
export type SessionUser =
  | {
      kind: "staff";
      id: string;
      role: Exclude<Role, "employee">;
      name: string;
      email: string;
      groupId: string | null;
      companyIds: string[];
    }
  | {
      kind: "employee";
      id: string;
      role: "employee";
      name: string;
      cedula: string;
      companyName: string;
      groupId: string;
      companyIds: string[];
    };

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    /** Cuerpo del error (p. ej. `errors` por campo cuando la validación falla). */
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

/** Mensaje legible de un error de la API, con el primer error por campo si lo hay. */
export function errorMessage(err: unknown): string {
  if (!(err instanceof ApiError)) return "No pudimos conectar con el servidor.";
  if (err.status === 429) return "Demasiados intentos. Espera un minuto.";
  const fields = (err.body as { errors?: Record<string, string[] | undefined> } | null)?.errors;
  const first = fields && Object.values(fields).flat().find(Boolean);
  return first ?? err.message;
}

/** Llama a la API por el rewrite /api/* (mismo origen, cookie incluida). */
export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api${path}`, {
    ...init,
    credentials: "same-origin",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });

  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as {
      message?: string | string[];
    } | null;
    const message = Array.isArray(body?.message)
      ? body.message.join(", ")
      : (body?.message ?? response.statusText);
    throw new ApiError(response.status, message, body);
  }

  return response.status === 204 ? (undefined as T) : (response.json() as Promise<T>);
}
