import type { NextConfig } from "next";

const apiUrl = process.env.API_URL ?? "http://localhost:4000";

const nextConfig: NextConfig = {
  // El navegador solo habla con este dominio: /api/* se reenvía a NestJS.
  // Así la cookie de sesión es first-party (Safari iOS) y no hace falta CORS.
  async rewrites() {
    return [{ source: "/api/:path*", destination: `${apiUrl}/api/:path*` }];
  },
};

export default nextConfig;
