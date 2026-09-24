import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Seit 15.5 stabil (vorher experimental.typedRoutes). Erzeugt .next/types/routes.d.ts
  // und macht <Link href> sowie router.push typsicher.
  typedRoutes: true,

  // Linting laeuft als eigener Schritt (npm run lint / npm run verify),
  // damit der Build nicht dieselbe Arbeit ein zweites Mal macht.
  eslint: { ignoreDuringBuilds: true },

  // Das Projekt liegt unter /mnt/c (Windows-Mount in WSL). Dort liefert inotify
  // keine zuverlaessigen Events, HMR bliebe sonst stumm. Turbopack reicht
  // pollIntervalMs an seinen Dateiwaechter durch (verifiziert in next@15.5.26,
  // server/dev/hot-reloader-turbopack.js).
  // Zieht das Projekt ins WSL-Dateisystem (~/...) um: diesen Block entfernen.
  watchOptions: { pollIntervalMs: 1000 },
};

export default nextConfig;
