import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

const rootDir = fileURLToPath(new URL(".", import.meta.url)).replace(/\/$/, "");

// Vitest schliesst standardmaessig nur node_modules und dist aus. .next wird
// sonst mitgescannt, und nach einem Build laufen dort kompilierte Dateien als
// Phantomtests mit. Deshalb explizit.
const neverScan = [
  "**/node_modules/**",
  "**/.next/**",
  "**/out/**",
  "**/build/**",
  "**/coverage/**",
  "**/.vercel/**",
  "**/supabase/**",
];

export default defineConfig({
  // Ohne dieses Plugin scheitert Vitest 5 / Vite 8 (rolldown) an jedem JSX in .tsx.
  plugins: [react()],
  resolve: {
    // Array-Form mit Regex, nicht { "@": rootDir }: die Objektform wuerde auch
    // "@testing-library/react" umschreiben, weil Vite Praefixe vergleicht.
    alias: [{ find: /^@\/(.*)$/, replacement: `${rootDir}/$1` }],
  },
  test: {
    exclude: neverScan,
    projects: [
      {
        extends: true,
        test: {
          name: { label: "domain", color: "green" },
          environment: "node",
          include: ["lib/**/*.test.ts", "tests/domain/**/*.test.ts"],
          exclude: neverScan,
        },
      },
      {
        extends: true,
        test: {
          name: { label: "ui", color: "cyan" },
          environment: "jsdom",
          include: [
            "app/**/*.test.tsx",
            "components/**/*.test.tsx",
            "tests/ui/**/*.test.tsx",
          ],
          exclude: neverScan,
          setupFiles: ["./vitest.setup.ts"],
        },
      },
    ],
    coverage: {
      provider: "v8",
      include: ["lib/domain/**/*.ts", "lib/services/**/*.ts"],
      exclude: ["**/*.test.ts"],
    },
  },
});
