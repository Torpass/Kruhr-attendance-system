import { Icon } from "@/components/ui/icons";

/**
 * Descarga de un PDF de la API (`/api/...`, misma sesión). Con `download` el navegador lo guarda
 * con el nombre que manda la API en `Content-Disposition`.
 */
export function DownloadPdf({
  href,
  children,
  variant = "secondary",
}: {
  href: string;
  children: React.ReactNode;
  variant?: "primary" | "secondary";
}) {
  return (
    <a
      href={href}
      download
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors ${
        variant === "primary"
          ? "bg-kru-600 text-white shadow-kru hover:bg-kru-800"
          : "border border-borde-fuerte bg-white text-grafito hover:border-kru-300 hover:text-kru-700"
      }`}
    >
      <Icon name="download" className="h-4 w-4" />
      {children}
    </a>
  );
}
