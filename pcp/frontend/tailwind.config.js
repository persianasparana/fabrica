/**
 * Tailwind — PCP Persianas Paraná
 *
 * Paleta lida de public/brand/palette.json (sincronizada de shared/brand).
 *
 * Rebrand sem reescrever o componente (tema escuro, chão de fábrica):
 *  - `amber` (cor de destaque legada) -> DOURADO da marca (#C6B784)
 *  - `stone` (superfícies/texto do tema escuro) -> escala `ink` (preto #1D1D1B)
 *  - `red` (default do Tailwind) permanece para ALERTAS (atrasos/erros)
 * Assim a UI adota a identidade oficial (preto + dourado) automaticamente.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const palette = JSON.parse(
  readFileSync(resolve(here, 'public/brand/palette.json'), 'utf8')
);
const { brand, gold, ink, sand } = palette.color;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand, // vermelho da marca (alertas/ênfase)
        gold,
        ink,
        sand,
        amber: gold, // destaque legado -> dourado
        stone: ink, // superfícies/texto escuros -> preto da marca
      },
      fontFamily: {
        sans: ["'Galano Grotesque'", "'Manrope'", "'Helvetica Neue'", 'Arial', 'sans-serif'],
        mono: ["'JetBrains Mono'", 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
