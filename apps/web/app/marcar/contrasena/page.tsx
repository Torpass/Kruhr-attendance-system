"use client";

import { useMutation } from "@tanstack/react-query";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, errorMessage } from "@/lib/api";

export default function ContrasenaPage() {
  const [mismatch, setMismatch] = useState(false);
  const change = useMutation({
    mutationFn: (body: { currentPassword: string; newPassword: string }) =>
      api("/auth/employee/password", { method: "POST", body: JSON.stringify(body) }),
  });

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const newPassword = String(form.get("newPassword"));
    const differs = newPassword !== String(form.get("confirmPassword"));
    setMismatch(differs);
    if (differs) return;
    change.mutate(
      { currentPassword: String(form.get("currentPassword")), newPassword },
      { onSuccess: () => formElement.reset() },
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <Link href="/marcar" className="text-sm font-semibold text-kru-700 hover:text-kru-800">
        ← Volver
      </Link>
      <Card>
        <h1 className="text-xl font-bold tracking-[-0.02em]">Cambiar contraseña</h1>
        <p className="mt-1 text-sm text-gris">
          Si trabajas en varias empresas, cambia en todas las que usan tu contraseña actual.
        </p>
        <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4">
          <Input
            label="Contraseña actual"
            name="currentPassword"
            type="password"
            autoComplete="current-password"
            required
          />
          <Input
            label="Contraseña nueva"
            name="newPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            title="Al menos 10 caracteres"
            required
          />
          <Input
            label="Repite la contraseña nueva"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={10}
            required
          />
          <p className="-mt-2 text-[13px] text-gris">Al menos 10 caracteres: letras, números o símbolos.</p>
          {(mismatch || change.isError) && (
            <p role="alert" className="rounded-lg bg-error-fondo px-3.5 py-2.5 text-sm text-error-texto">
              {mismatch ? "Las contraseñas nuevas no coinciden." : errorMessage(change.error)}
            </p>
          )}
          {change.isSuccess && (
            <p role="status" className="rounded-lg bg-kru-50 px-3.5 py-2.5 text-sm text-kru-800">
              Listo. Usa tu contraseña nueva la próxima vez que entres.
            </p>
          )}
          <Button type="submit" size="lg" disabled={change.isPending} className="w-full">
            {change.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </form>
      </Card>
    </div>
  );
}
