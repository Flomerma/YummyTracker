import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import eslintConfigPrettier from "eslint-config-prettier";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// eslint-config-next@15.5.26 ist noch eslintrc-Stil (main: index.js, kein
// Flat-Export). FlatCompat ist deshalb Pflicht, nicht Altlast.
const compat = new FlatCompat({ baseDirectory: __dirname });

const supabaseOnlyInDataLayer = {
  group: ["@supabase/supabase-js", "@supabase/ssr"],
  message:
    "Supabase-Aufrufe gehoeren ausschliesslich nach lib/data/ (Konzept 7.1).",
};

const eslintConfig = [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "coverage/**",
      "supabase/.branches/**",
      "supabase/.temp/**",
      "next-env.d.ts",
    ],
  },
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    files: ["**/*.ts", "**/*.tsx"],
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
    },
  },
  {
    // lib/domain/ bleibt rein: keine Datenbank, kein React, kein Netzwerk.
    // Achtung: nur EIN Block darf no-restricted-imports fuer lib/domain setzen,
    // ein spaeterer Block mit derselben Regel wuerde diesen still ueberschreiben.
    files: ["lib/domain/**/*.ts"],
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "react",
                "react-dom",
                "react/*",
                "next",
                "next/*",
                "@supabase/*",
                "@/lib/data",
                "@/lib/data/*",
                "@/lib/services",
                "@/lib/services/*",
                "@/lib/ai",
                "@/lib/ai/*",
                "@/app/*",
                "@/components/*",
              ],
              message:
                "lib/domain/ muss rein bleiben: keine Datenbank, kein React, kein Netzwerk (Konzept 7.1).",
            },
          ],
        },
      ],
    },
  },
  {
    // Supabase nur in lib/data/ und in middleware.ts (Session-Refresh).
    files: [
      "app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "lib/services/**/*.ts",
      "lib/ai/**/*.ts",
    ],
    rules: {
      "no-restricted-imports": [
        "error",
        { patterns: [supabaseOnlyInDataLayer] },
      ],
    },
  },
  // Muss zuletzt stehen: schaltet alle Formatierungsregeln ab, die mit Prettier kollidieren.
  eslintConfigPrettier,
];

export default eslintConfig;
