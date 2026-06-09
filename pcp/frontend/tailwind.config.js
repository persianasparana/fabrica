/**
 * Tailwind — PCP Persianas Paraná
 *
 * A paleta da marca é lida de public/brand/palette.json (fonte única,
 * sincronizada de shared/brand via `bash shared/brand/sync.sh`).
 *
 * Estratégia de rebrand sem reescrever o componente: a escala `amber` do
 * Tailwind (usada como cor de destaque em toda a UI) é REMAPEADA para o
 * terracota da marca. Assim, todas as classes `amber-*` existentes passam a
 * renderizar na identidade da Persianas Paraná automaticamente.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const palette = JSON.parse(
  readFileSync(resolve(here, 'public/brand/palette.json'), 'utf8')
);
const { brand, sand, night } = palette.color;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Escalas nomeadas da marca (uso explícito)
        brand,
        sand,
        night,
        // Remapeia o destaque legado `amber` -> terracota da marca
        amber: brand,
      },
      fontFamily: {
        sans: ["'Bricolage Grotesque'", 'system-ui', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
