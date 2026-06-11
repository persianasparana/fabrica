/**
 * Tailwind — PCP Persianas Paraná
 *
 * Paleta lida de public/brand/palette.json (sincronizada de shared/brand).
 *
 * TEMA CLARO alinhado aos demais sistemas da empresa (Agenda, Qualidade,
 * Logística): fundo branco, texto preto #1D1D1B, acento DOURADO da marca e
 * cores semânticas para status. O componente foi escrito no tema escuro com
 * as famílias `stone` (superfícies/texto) e `amber` (acento); em vez de
 * reescrever 3.700 linhas, as famílias são REMAPEADAS aqui:
 *
 *  - `stone`  -> escala INVERTIDA derivada de `ink`: stone-950 vira o fundo
 *               claro e stone-100 o texto escuro, preservando a hierarquia.
 *  - `amber`  -> DOURADO escurecido (gold-600/700 da paleta) para manter
 *               contraste AA sobre fundo claro (o dourado puro #C6B784 é
 *               claro demais para texto/botões em fundo branco).
 *  - `red`    -> vermelho da MARCA (#C1212D) para alertas.
 *  - `emerald`/`green` -> verde institucional (tokens semânticos).
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const palette = JSON.parse(
  readFileSync(resolve(here, 'public/brand/palette.json'), 'utf8')
);
const { brand, gold, ink, sand } = palette.color;

// Escala invertida p/ tema claro: índices altos = claros (fundos/bordas),
// índices baixos = escuros (texto) — o oposto da escala `ink` original.
const stoneLight = {
  50: '#141413',
  100: '#1D1D1B', // texto principal
  200: '#2F2F2C',
  300: '#44423D',
  400: '#56554F', // texto secundário
  500: '#75736B', // texto atenuado
  600: '#9C9A91', // placeholders / terciário
  700: '#B6B4AD',
  800: '#E2E0DA', // bordas
  900: '#F1F0EC', // superfície (cards, thead, hover)
  950: '#FFFFFF', // fundo da página + texto sobre acento
};

// Dourado da marca ajustado para fundo claro (contraste de texto/botão).
const goldLight = {
  50: gold[50],
  100: gold[100],
  200: gold[200],
  300: gold[300],
  400: '#8E7E4E', // hover claro / acentos
  500: gold[700], // #87794C — botões e acentos (branco por cima passa AA-large)
  600: '#6F6340', // hover escuro
  700: gold[800],
  800: gold[800],
  900: gold[900],
};

// Vermelho da marca para alertas sobre fundo claro.
const redLight = {
  50: brand[50],
  100: brand[100],
  200: brand[200],
  300: brand[600], // texto de erro (escuro)
  400: brand[500], // #C1212D
  500: brand[500],
  600: brand[600],
  700: brand[700],
  800: brand[800],
  900: brand[200], // bordas suaves (era vermelho profundo no tema escuro)
  950: brand[500], // usado só como tinta translúcida (/10) -> rosa suave
};

// Verde institucional (tokens semânticos da marca).
const greenLight = {
  300: '#15803D',
  400: '#15803D',
  500: '#16A34A',
  600: '#166534',
};

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand, // vermelho da marca
        gold,
        ink,
        sand,
        amber: goldLight, // acento legado -> dourado p/ fundo claro
        stone: stoneLight, // superfícies/texto -> tema claro invertido
        red: redLight,
        emerald: greenLight,
        green: greenLight,
      },
      fontFamily: {
        sans: ["'Galano Grotesque'", "'Manrope'", "'Helvetica Neue'", 'Arial', 'sans-serif'],
        // `font-mono` era JetBrains Mono no visual antigo (estilo terminal).
        // Alinhado aos demais sistemas: rótulos/tabelas na fonte da marca.
        mono: ["'Galano Grotesque'", "'Manrope'", "'Helvetica Neue'", 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
