/**
 * Valida o motor de cálculo de corte contra os valores das planilhas oficiais
 * (PLANEJAMENTO DE CORTE). Roda sem banco — usa só o motor (corte.js).
 *
 * Regra de ouro confirmada nas planilhas: as medidas entram em CENTÍMETROS
 * (ex.: largura 154, altura 131) e as fórmulas são do tipo IF(medida>0, ...).
 *
 * Uso: node bin/validar-cortes.js
 */
import { calcularCortes } from '../src/corte.js';

const casos = [
  {
    nome: 'SOFT LISA NOVUS — SEM PLUS · L=154 A=131 (aba "SOFT LISA NOVUS SEM PLUS")',
    cortes: [
      { nome: 'Tubo 32mm Natural', formula: 'L - 2.2' },   // planilha B: R-2.2
      { nome: 'Base Quadrada Baixa', formula: 'L - 2.4' },  // planilha D: R-2.4
      { nome: 'Tecido (Largura)', formula: 'L - 2.4' },     // planilha F: R-2.4
      { nome: 'Tecido (Altura)', formula: 'A + 15' },       // planilha H: T+15
    ],
    medidas: { L: 154, A: 131, largura: 154, altura: 131 },
    esperado: {
      'Tubo 32mm Natural': 151.8,
      'Base Quadrada Baixa': 151.6,
      'Tecido (Largura)': 151.6,
      'Tecido (Altura)': 146,
    },
  },
  {
    nome: 'SOFT LISA NOVUS — SEM PLUS · L=200 A=180 (conferência redonda)',
    cortes: [
      { nome: 'Tubo 32mm Natural', formula: 'L - 2.2' },
      { nome: 'Base Quadrada Baixa', formula: 'L - 2.4' },
      { nome: 'Tecido (Largura)', formula: 'L - 2.4' },
      { nome: 'Tecido (Altura)', formula: 'A + 15' },
    ],
    medidas: { L: 200, A: 180, largura: 200, altura: 180 },
    esperado: {
      'Tubo 32mm Natural': 197.8,
      'Base Quadrada Baixa': 197.6,
      'Tecido (Largura)': 197.6,
      'Tecido (Altura)': 195,
    },
  },
];

let falhas = 0;
for (const c of casos) {
  console.log('\n' + c.nome);
  const res = calcularCortes(c.cortes, c.medidas);
  for (const r of res) {
    const exp = c.esperado[r.nome];
    const ok = exp == null || Math.abs(Number(r.valor) - exp) < 0.005;
    if (!ok) falhas++;
    console.log(`  ${ok ? '✓' : '✗'} ${r.nome}: ${r.valor}${exp != null ? `   (planilha: ${exp})` : ''}`);
  }
}

// Demonstra o erro de unidade: medida em metros gera corte negativo (igual à planilha).
console.log('\n[demonstração] mesma peça com medida em METROS (1.54 × 1.31) — resultado inválido:');
const ruim = calcularCortes(
  [{ nome: 'Tubo 32mm Natural', formula: 'L - 2.2' }],
  { L: 1.54, A: 1.31, largura: 1.54, altura: 1.31 }
);
console.log(`  Tubo 32mm Natural: ${ruim[0].valor}  → negativo = medida foi digitada em metros, não cm.`);

console.log(falhas ? `\n✗ ${falhas} divergência(s) com a planilha.` : '\n✓ Todos os cortes batem com a planilha.');
process.exit(falhas ? 1 : 0);
