import type { MetadataRoute } from "next";

/** PWA instalable: el colaborador la agrega a su pantalla de inicio y abre directo en marcar. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "KruHr",
    short_name: "KruHr",
    description: "Registro de entrada y salida de colaboradores.",
    lang: "es-VE",
    start_url: "/panel",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#f3f4f6",
    theme_color: "#7c3aed",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
