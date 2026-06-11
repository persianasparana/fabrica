import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Factory, FileText, Plus, Trash2, Edit3, Save, X, Search, Download,
  Package, Scissors, ClipboardList, BarChart3, AlertTriangle, CheckCircle2,
  Clock, ArrowRight, Filter, Printer, Settings, Archive, ChevronRight,
  ChevronDown, Activity, Layers, Boxes, Wrench, TrendingUp, Calendar,
  Hash, Ruler, Eye, Copy, ChevronLeft, ListChecks, AlertCircle, Info,
  Truck, Gauge, Target, Play, Square, RotateCw, Tag, FileBarChart,
  CalendarDays, ArrowDownToLine, ArrowUpFromLine, Award, History,
  Sliders, FileCheck, LogOut, Menu, Users
} from "lucide-react";
import UsersView from "./components/UsersView.jsx";

/* =====================================================================
 * CATÁLOGO DE PRODUTOS — extraído das planilhas oficiais da empresa.
 * As fórmulas seguem exatamente o que está nos arquivos:
 *   PLANEJAMENTO DE CORTE * .xlsx e ESTRUTURA DE PRODUTO.xlsx
 *
 * Convenções:
 *   L  = largura do pedido (cm)   -- em PH 25/PH 50: METROS
 *   A  = altura  do pedido (cm)   -- em PH 25/PH 50: METROS
 *   cuts        = peças de matéria-prima cortadas
 *   components  = itens contados em unidades (BOM)
 * ===================================================================== */

const garrasPorLargura = (L) => {
  if (!L || L <= 0) return 0;
  if (L < 100) return 2;
  if (L < 150) return 3;
  if (L < 200) return 4;
  if (L < 250) return 5;
  if (L < 300) return 6;
  return Math.ceil(L / 50);
};

const varetasRomana = (A) => {
  if (!A) return 0;
  if (A >= 50 && A < 60) return 2;
  if (A >= 60.1 && A <= 120) return 4;
  if (A > 120 && A <= 180) return 6;
  if (A > 180 && A <= 240) return 8;
  if (A > 240 && A <= 300) return 10;
  if (A > 300 && A <= 360.5) return 12;
  if (A > 360.5 && A <= 400) return 14;
  if (A > 400 && A <= 450) return 16;
  return 0;
};

const varetasRomanaTeto = (A) => {
  if (!A) return 0;
  if (A >= 50 && A <= 86.5) return 1;
  if (A > 86.5 && A <= 164.5) return 3;
  if (A > 164.5 && A <= 242.5) return 5;
  if (A > 242.5 && A <= 320.5) return 7;
  if (A > 320.5 && A <= 398.5) return 9;
  if (A > 398.5 && A <= 450) return 11;
  return 0;
};

// CATÁLOGO COMPLETO
const PRODUCT_CATALOG = {
  // ============ FAMÍLIA SOFT (Tubo 32mm) ============
  "soft-lisa-sem-plus": {
    family: "SOFT",
    name: "Soft Lisa Novus — Sem Plus",
    tube: "32mm",
    cuts: [
      { name: "Tubo 32mm Natural", fn: (L) => L - 2.2, dim: "L" },
      { name: "Base Quadrada Baixa", fn: (L) => L - 2.4, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.4, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Comando Mini", qty: 1 },
      { name: "Ponta Oposta 32mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa da Base Quadrada Baixa", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
      { name: "Garra 40mm Branca", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "soft-lisa-com-plus": {
    family: "SOFT",
    name: "Soft Lisa Novus — Trilho Plus",
    tube: "32mm",
    cuts: [
      { name: "Trilho Plus", fn: (L) => L - 0.4, dim: "L" },
      { name: "Tubo 32mm Natural", fn: (L) => L - 2.2, dim: "L" },
      { name: "Base Quadrada Baixa", fn: (L) => L - 2.4, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.4, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Comando Mini", qty: 1 },
      { name: "Ponta Oposta 32mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa da Base Quadrada Baixa", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
      { name: "Garra 40mm Branca", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "soft-lisa-bando-vision": {
    family: "SOFT",
    name: "Soft Lisa Novus — Bandô Vision",
    tube: "32mm",
    cuts: [
      { name: "Bandô Vision", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tubo 32mm Natural", fn: (L) => L - 2.8, dim: "L" },
      { name: "Base Quadrada Baixa", fn: (L) => L - 3.0, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 3.0, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Tampa Vision Rolo 1720 Lisa (Tampa do Bandô Vision)", qty: 1 },
      { name: "Comando Mini", qty: 1 },
      { name: "Ponta Oposta 32mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa da Base Quadrada Baixa", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
      { name: "Garra p/ Bandô Vision", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "soft-lisa-box-70": {
    family: "SOFT",
    name: "Soft Lisa Novus — Box 70mm",
    tube: "32mm",
    cuts: [
      { name: "Box 70mm (Perfil L 70)", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tubo 32mm Natural", fn: (L) => L - 2.7, dim: "L" },
      { name: "Base Quadrada Média", fn: (L) => L - 5, dim: "L" },
      { name: "Guia Lateral (esq + dir)", fn: (L, A) => A - 7, dim: "A", qtyMult: 2 },
      { name: "Guia Inferior", fn: (L) => L - 12, dim: "L" },
      { name: "Perfil Superior/Inferior", fn: (L) => L - 10.2, dim: "L" },
      { name: "Perfil Lateral", fn: (L, A) => A - 0.4, dim: "A" },
      { name: "Tampa Box 70", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 3.1, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Tampa Lateral Box 70 (E/D)", qty: 1, note: "Verificar lado de comando" },
      { name: "Comando Mini", qty: 1 },
      { name: "Ponta Oposta 32mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
    ],
  },
  "soft-sheer-trilho-plus": {
    family: "SOFT",
    name: "Soft Sheer Arco-Íris — Trilho Plus",
    tube: "32mm",
    cuts: [
      { name: "Trilho Plus", fn: (L) => L - 0.4, dim: "L" },
      { name: "Tubo 32mm Natural", fn: (L) => L - 2.2, dim: "L" },
      { name: "Base Duo", fn: (L) => L - 2.2, dim: "L" },
      { name: "Rolete da Base Duo", fn: (L) => L - 2.6, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.4, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Comando Mini", qty: 1 },
      { name: "Ponta Oposta 32mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa do Rolete Duo", qty: 2 },
      { name: "Tampa Base Duo", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
      { name: "Garra 40mm Branca", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "soft-sheer-bando-vision": {
    family: "SOFT",
    name: "Soft Sheer Arco-Íris — Bandô Vision",
    tube: "32mm",
    cuts: [
      { name: "Bandô Vision", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tubo 32mm Natural", fn: (L) => L - 2.8, dim: "L" },
      { name: "Base Sheer (Duo)", fn: (L) => L - 2.8, dim: "L" },
      { name: "Rolete da Base Duo", fn: (L) => L - 3.2, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 3.0, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Tampa Vision Rolo 1720 Lisa (Tampa do Bandô Vision)", qty: 1 },
      { name: "Comando Mini", qty: 1 },
      { name: "Ponta Oposta 32mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa do Rolete Duo", qty: 2 },
      { name: "Tampa Base Duo", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
      { name: "Garra p/ Bandô Vision", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },

  // ============ FAMÍLIA PREMIUM (Tubo 40mm) ============
  "premium-lisa-bando-vision": {
    family: "PREMIUM",
    name: "Premium Lisa — Bandô Vision",
    tube: "40mm",
    cuts: [
      { name: "Bandô Vision", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tubo 40mm Natural", fn: (L) => L - 3.4, dim: "L" },
      { name: "Base Quadrada Baixa", fn: (L) => L - 3.6, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 3.6, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 20, dim: "A" },
    ],
    components: [
      { name: "Tampa Vision Rolo 1720 Lisa", qty: 1 },
      { name: "Comando Médio s/ Redução", qty: 1 },
      { name: "Ponta Oposta 40mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa da Base Quadrada Baixa", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
      { name: "Garra p/ Bandô Vision", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "premium-lisa-trilho-plus": {
    family: "PREMIUM",
    name: "Premium Lisa — Trilho Plus",
    tube: "40mm",
    cuts: [
      { name: "Trilho Plus", fn: (L) => L - 0.4, dim: "L" },
      { name: "Tubo 40mm Natural", fn: (L) => L - 2.7, dim: "L" },
      { name: "Base Quadrada Baixa", fn: (L) => L - 2.9, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.9, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 20, dim: "A" },
    ],
    components: [
      { name: "Comando Médio s/ Redução", qty: 1 },
      { name: "Ponta Oposta 40mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa da Base Quadrada Baixa", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
      { name: "Garra 40mm Branca", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "premium-vision-bando-vision": {
    family: "PREMIUM",
    name: "Premium Vision — Bandô Vision",
    tube: "40mm",
    cuts: [
      { name: "Bandô Vision", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tubo 40mm Natural", fn: (L) => L - 3.4, dim: "L" },
      { name: "Base Vision", fn: (L) => L - 3.4, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 3.6, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 12, dim: "A" },
    ],
    components: [
      { name: "Tampa Vision Rolo 1720 Lisa", qty: 1 },
      { name: "Comando Médio s/ Redução", qty: 1 },
      { name: "Ponta Oposta 40mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
      { name: "Garra p/ Bandô Vision", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "premium-vision-trilho-plus": {
    family: "PREMIUM",
    name: "Premium Vision — Trilho Plus",
    tube: "40mm",
    cuts: [
      { name: "Trilho Plus", fn: (L) => L - 0.4, dim: "L" },
      { name: "Tubo 40mm Natural", fn: (L) => L - 2.7, dim: "L" },
      { name: "Base Vision", fn: (L) => L - 2.7, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.9, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 12, dim: "A" },
    ],
    components: [
      { name: "Comando Médio s/ Redução", qty: 1 },
      { name: "Ponta Oposta 40mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
      { name: "Garra 40mm Branca", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "premium-sheer-bando-vision": {
    family: "PREMIUM",
    name: "Premium Sheer — Bandô Vision (C. Novus)",
    tube: "40mm",
    cuts: [
      { name: "Bandô Vision", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tubo 40mm Natural", fn: (L) => L - 3.2, dim: "L" },
      { name: "Base Duo", fn: (L) => L - 3.2, dim: "L" },
      { name: "Tubo Rolete Duo", fn: (L) => L - 3.6, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 3.4, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Tampa Vision Rolo 1720 Lisa", qty: 1 },
      { name: "Comando Novus 40", qty: 1 },
      { name: "Ponta Oposta 40mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa do Rolete Duo", qty: 2 },
      { name: "Tampa Base Duo", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
      { name: "Garra p/ Bandô Vision", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "premium-sheer-trilho-plus": {
    family: "PREMIUM",
    name: "Premium Sheer — Trilho Plus (C. Novus)",
    tube: "40mm",
    cuts: [
      { name: "Trilho Plus", fn: (L) => L - 0.4, dim: "L" },
      { name: "Tubo 40mm Natural", fn: (L) => L - 2.5, dim: "L" },
      { name: "Base Duo", fn: (L) => L - 2.5, dim: "L" },
      { name: "Tubo Rolete Duo", fn: (L) => L - 2.9, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.7, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Comando Novus 40", qty: 1 },
      { name: "Ponta Oposta 40mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa do Rolete Duo", qty: 2 },
      { name: "Tampa Base Duo", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
      { name: "Garra 40mm Branca", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "premium-lisa-box-90": {
    family: "PREMIUM",
    name: "Premium Lisa — Box 90mm",
    tube: "40mm",
    cuts: [
      { name: "Box 90mm (Perfil L 90)", fn: (L) => L - 0.7, dim: "L" },
      { name: "Tubo 40mm Natural", fn: (L) => L - 3.4, dim: "L" },
      { name: "Base Quadrada Média", fn: (L) => L - 5, dim: "L" },
      { name: "Guia Lateral (esq + dir)", fn: (L, A) => A - 7.5, dim: "A", qtyMult: 2 },
      { name: "Guia Inferior", fn: (L) => L - 12, dim: "L" },
      { name: "Perfil Superior/Inferior", fn: (L) => L - 10.2, dim: "L" },
      { name: "Perfil Lateral", fn: (L, A) => A - 0.4, dim: "A" },
      { name: "Tampa Box 90", fn: (L) => L - 0.7, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 3.6, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 20, dim: "A" },
    ],
    components: [
      { name: "Tampa Lateral Box 90 (E/D)", qty: 1, note: "Verificar lado de comando" },
      { name: "Comando Médio s/ Redução", qty: 1 },
      { name: "Ponta Oposta 40mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Uniline Médio c/ Rolamento", qty: 1 },
    ],
  },

  // ============ FAMÍLIA MOTORIZADAS (Tubo 47mm) ============
  "motor-lisa-trilho-plus-47": {
    family: "MOTORIZADAS",
    name: "Motorizada Lisa — Trilho Plus (Tubo 47mm)",
    tube: "47mm",
    cuts: [
      { name: "Trilho Plus", fn: (L) => L - 0.4, dim: "L" },
      { name: "Tubo 47mm Natural", fn: (L) => L - 3.1, dim: "L" },
      { name: "Base Quadrada Média", fn: (L) => L - 3.3, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 3.3, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 20, dim: "A" },
    ],
    components: [
      { name: "Motor (conforme marca solicitada)", qty: 1 },
      { name: "Comando Oposto Uniline s/ Acionador Tubo 47mm", qty: 1 },
      { name: "Adaptador Suporte Cruz 2P (Morceguinha)", qty: 1 },
      { name: "Roda do Motor - Tubos 43 e 47mm", qty: 1 },
      { name: "Coroa do Motor p/ Tubos 43 e 47mm", qty: 1 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Uniline Médio c/ Rolamento", qty: 1 },
      { name: "Tampa da Base Quadrada Média", qty: 2 },
      { name: "Emissor (conforme canais solicitados)", qty: 1, note: "Verificar pedido" },
      { name: "Garra 40mm Branca", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "motor-lisa-bando-vision-47": {
    family: "MOTORIZADAS",
    name: "Motorizada Lisa — Bandô Vision (Tubo 47mm)",
    tube: "47mm",
    cuts: [
      { name: "Bandô Vision", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tubo 47mm Natural", fn: (L) => L - 4.0, dim: "L" },
      { name: "Base Quadrada Média", fn: (L) => L - 4.2, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 4.2, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 20, dim: "A" },
    ],
    components: [
      { name: "Tampa do Bandô Vision", qty: 1 },
      { name: "Motor (conforme marca solicitada)", qty: 1 },
      { name: "Comando Oposto Uniline s/ Acionador Tubo 47mm", qty: 1 },
      { name: "Adaptador Suporte Cruz 2P (Morceguinha)", qty: 1 },
      { name: "Roda do Motor - Tubos 43 e 47mm", qty: 1 },
      { name: "Coroa do Motor p/ Tubos 43 e 47mm", qty: 1 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Uniline Médio c/ Rolamento", qty: 1 },
      { name: "Tampa da Base Quadrada Média", qty: 1 },
      { name: "Emissor (conforme canais solicitados)", qty: 1, note: "Verificar pedido" },
      { name: "Garra p/ Bandô Vision", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "motor-sheer-trilho-plus-47": {
    family: "MOTORIZADAS",
    name: "Motorizada Sheer — Trilho Plus (Tubo 47mm)",
    tube: "47mm",
    cuts: [
      { name: "Trilho Plus", fn: (L) => L - 0.4, dim: "L" },
      { name: "Tubo 47mm Natural", fn: (L) => L - 3.1, dim: "L" },
      { name: "Base Duo", fn: (L) => L - 3.3, dim: "L" },
      { name: "Rolete Base Duo", fn: (L) => L - 3.5, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 3.3, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 20, dim: "A" },
    ],
    components: [
      { name: "Motor (conforme marca solicitada)", qty: 1 },
      { name: "Comando Oposto Uniline s/ Acionador Tubo 47mm", qty: 1 },
      { name: "Adaptador Suporte Cruz 2P (Morceguinha)", qty: 1 },
      { name: "Roda do Motor - Tubos 43 e 47mm", qty: 1 },
      { name: "Coroa do Motor p/ Tubos 43 e 47mm", qty: 1 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Uniline Médio c/ Rolamento", qty: 1 },
      { name: "Tampa Rolete Duo", qty: 2 },
      { name: "Tampa Duo", qty: 2 },
      { name: "Emissor (conforme canais solicitados)", qty: 1, note: "Verificar pedido" },
      { name: "Garra 40mm Branca", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "motor-sheer-bando-vision-47": {
    family: "MOTORIZADAS",
    name: "Motorizada Sheer — Bandô Vision (Tubo 47mm)",
    tube: "47mm",
    cuts: [
      { name: "Bandô Vision", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tubo 47mm Natural", fn: (L) => L - 4.0, dim: "L" },
      { name: "Base Duo", fn: (L) => L - 4.2, dim: "L" },
      { name: "Rolete Base Duo", fn: (L) => L - 4.4, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 4.2, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 20, dim: "A" },
    ],
    components: [
      { name: "Tampa do Bandô Vision", qty: 1 },
      { name: "Motor (conforme marca solicitada)", qty: 1 },
      { name: "Comando Oposto Uniline s/ Acionador Tubo 47mm", qty: 1 },
      { name: "Adaptador Suporte Cruz 2P (Morceguinha)", qty: 1 },
      { name: "Roda do Motor - Tubos 43 e 47mm", qty: 1 },
      { name: "Coroa do Motor p/ Tubos 43 e 47mm", qty: 1 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Uniline Médio c/ Rolamento", qty: 1 },
      { name: "Tampa Rolete Duo", qty: 2 },
      { name: "Tampa Duo", qty: 2 },
      { name: "Emissor (conforme canais solicitados)", qty: 1, note: "Verificar pedido" },
      { name: "Garra p/ Bandô Vision", qtyFn: (L) => garrasPorLargura(L) },
    ],
  },
  "motor-box-90-47": {
    family: "MOTORIZADAS",
    name: "Motorizada Box 90mm (Tubo 47mm)",
    tube: "47mm",
    cuts: [
      { name: "Box 90mm (Perfil L 90)", fn: (L) => L - 0.7, dim: "L" },
      { name: "Tubo 47mm Natural", fn: (L) => L - 4.5, dim: "L" },
      { name: "Base Quadrada Média", fn: (L) => L - 5, dim: "L" },
      { name: "Guia Lateral (esq + dir)", fn: (L, A) => A - 7.5, dim: "A", qtyMult: 2 },
      { name: "Guia Inferior", fn: (L) => L - 12, dim: "L" },
      { name: "Perfil Superior/Inferior", fn: (L) => L - 10.2, dim: "L" },
      { name: "Perfil Lateral", fn: (L, A) => A - 0.4, dim: "A" },
      { name: "Tampa Box 90", fn: (L) => L - 0.7, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 4.7, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 20, dim: "A" },
    ],
    components: [
      { name: "Tampa Lateral Box 90 (E/D)", qty: 1, note: "Verificar lado de comando" },
      { name: "Motor (conforme marca solicitada)", qty: 1 },
      { name: "Comando Oposto Uniline s/ Acionador Tubo 47mm", qty: 1 },
      { name: "Adaptador Suporte Cruz 2P (Morceguinha)", qty: 1 },
      { name: "Roda do Motor - Tubos 43 e 47mm", qty: 1 },
      { name: "Coroa do Motor p/ Tubos 43 e 47mm", qty: 1 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Uniline Médio c/ Rolamento", qty: 1 },
      { name: "Emissor (conforme canais solicitados)", qty: 1, note: "Verificar pedido" },
    ],
  },

  // ============ FAMÍLIA INTERMEDIÁRIA / ACOPLADA ============
  "intermed-plus-32-lisa": {
    family: "INTERMEDIARIO",
    name: "Intermediária Trilho Plus 32mm — Lisa",
    tube: "32mm",
    cuts: [
      { name: "Trilho Plus", fn: (L) => L - 0.4, dim: "L" },
      { name: "Tubo 32mm Natural", fn: (L) => L - 1.9, dim: "L", note: "Lado direito; esquerdo: L − 2.1" },
      { name: "Base Quadrada Baixa", fn: (L) => L - 2.1, dim: "L", note: "Lado direito; esquerdo: L − 2.3" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.1, dim: "L", note: "Lado direito; esquerdo: L − 2.3" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Comando Mini", qty: 1 },
      { name: "Ponta Oposta 32mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa da Base Quadrada Baixa", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
    ],
  },
  "intermed-plus-32-sheer": {
    family: "INTERMEDIARIO",
    name: "Intermediária Trilho Plus 32mm — Sheer",
    tube: "32mm",
    cuts: [
      { name: "Trilho Plus", fn: (L) => L - 0.4, dim: "L" },
      { name: "Tubo 32mm Natural", fn: (L) => L - 1.9, dim: "L", note: "Lado direito; esquerdo: L − 2.1" },
      { name: "Base Duo", fn: (L) => L - 1.9, dim: "L", note: "Lado direito; esquerdo: L − 2.1" },
      { name: "Rolete Duo", fn: (L) => L - 2.3, dim: "L", note: "Lado direito; esquerdo: L − 2.5" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.1, dim: "L", note: "Lado direito; esquerdo: L − 2.3" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Comando Mini", qty: 1 },
      { name: "Ponta Oposta 32mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa do Rolete Duo", qty: 2 },
      { name: "Tampa Base Duo", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
    ],
  },
  "intermed-bv-32-lisa": {
    family: "INTERMEDIARIO",
    name: "Intermediária Bandô Vision 32mm — Lisa",
    tube: "32mm",
    cuts: [
      { name: "Bandô Vision", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tubo 32mm Natural", fn: (L) => L - 2.3, dim: "L" },
      { name: "Base Quadrada Baixa", fn: (L) => L - 2.5, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.5, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Tampa Vision Rolo 1720 Lisa", qty: 1 },
      { name: "Comando Mini", qty: 1 },
      { name: "Ponta Oposta 32mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa da Base Quadrada Baixa", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
    ],
  },
  "intermed-bv-32-sheer": {
    family: "INTERMEDIARIO",
    name: "Intermediária Bandô Vision 32mm — Sheer",
    tube: "32mm",
    cuts: [
      { name: "Bandô Vision", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tubo 32mm Natural", fn: (L) => L - 2.3, dim: "L" },
      { name: "Base Duo", fn: (L) => L - 2.3, dim: "L" },
      { name: "Rolete Duo", fn: (L) => L - 2.7, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.5, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 15, dim: "A" },
    ],
    components: [
      { name: "Tampa Vision Rolo 1720 Lisa", qty: 1 },
      { name: "Comando Mini", qty: 1 },
      { name: "Ponta Oposta 32mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa do Rolete Duo", qty: 2 },
      { name: "Tampa Base Duo", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
    ],
  },
  "intermed-plus-40-lisa": {
    family: "INTERMEDIARIO",
    name: "Intermediária Trilho Plus 40mm — Lisa",
    tube: "40mm",
    cuts: [
      { name: "Trilho Plus", fn: (L) => L - 0.4, dim: "L" },
      { name: "Tubo 40mm Natural", fn: (L) => L - 2.4, dim: "L", note: "Lado direito; esquerdo: L − 2.7" },
      { name: "Base Quadrada Baixa", fn: (L) => L - 2.7, dim: "L", note: "Lado direito; esquerdo: L − 2.9" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.7, dim: "L", note: "Lado direito; esquerdo: L − 2.9" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 20, dim: "A" },
    ],
    components: [
      { name: "Comando Médio s/ Redução", qty: 1 },
      { name: "Ponta Oposta 40mm s/ Acionamento", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa da Base Quadrada Baixa", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Pino Retrátil Médio", qty: 1 },
    ],
  },
  "acoplada-bv-47-lisa": {
    family: "ACOPLADA",
    name: "Acoplada Bandô Vision 47mm — Lisa",
    tube: "47mm",
    cuts: [
      { name: "Bandô Vision", fn: (L) => L - 0.6, dim: "L" },
      { name: "Tubo 47mm Natural", fn: (L) => L - 2.9, dim: "L" },
      { name: "Base Quadrada Baixa", fn: (L) => L - 3.1, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 3.1, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 20, dim: "A" },
    ],
    components: [
      { name: "Tampa Vision Rolo 1720 Lisa", qty: 1 },
      { name: "Comando R20 Max c/ Redução e Guia Regulável", qty: 1 },
      { name: "Comando Oposto Uniline s/ Acionador", qty: 1 },
      { name: "Stop Plus (Roller Stop) 40,3mm", qty: 1 },
      { name: "Corrente s/ Fim Bola 10 (m)", qty: 1, note: "Verificar altura" },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa da Base Quadrada Baixa", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Uniline Médio c/ Rolamento", qty: 1 },
    ],
  },
  "acoplada-plus-47-lisa": {
    family: "ACOPLADA",
    name: "Acoplada Trilho Plus 47mm — Lisa",
    tube: "47mm",
    cuts: [
      { name: "Trilho Plus", fn: (L) => L - 0.4, dim: "L" },
      { name: "Tubo 47mm Natural", fn: (L) => L - 2.5, dim: "L", note: "Lado direito; esquerdo: L − 2.8" },
      { name: "Base Quadrada Baixa", fn: (L) => L - 2.7, dim: "L", note: "Lado direito; esquerdo: L − 3.0" },
      { name: "Tecido (Largura)", fn: (L) => L - 2.7, dim: "L", note: "Lado direito; esquerdo: L − 3.0" },
      { name: "Tecido (Altura)", fn: (L, A) => A + 20, dim: "A" },
    ],
    components: [
      { name: "Comando R20 Max c/ Redução e Guia Regulável", qty: 1 },
      { name: "Comando Oposto Uniline s/ Acionador", qty: 1 },
      { name: "Stop Plus (Roller Stop) 40,3mm", qty: 1 },
      { name: "Corrente s/ Fim Bola 10 (m)", qty: 1, note: "Verificar altura" },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa da Base Quadrada Baixa", qty: 2 },
      { name: "Suporte X10 Médio", qty: 1 },
      { name: "Suporte Uniline Médio c/ Rolamento", qty: 1 },
    ],
  },

  // ============ FAMÍLIA ROMANA / PAINEL ============
  "romana-padrao": {
    family: "ROMANA",
    name: "Romana — Padrão (parede)",
    tube: "—",
    cuts: [
      { name: "Trilho Romana", fn: (L) => L - 1.5, dim: "L" },
      { name: "Eixo Romana Sextavado 7mm", fn: (L) => L - 4.5, dim: "L" },
      { name: "Vareta Romana", fn: (L) => L - 1.2, dim: "L", qtyDyn: (L, A) => varetasRomana(A) },
      { name: "Base Quadrada Baixa", fn: (L) => L - 1, dim: "L" },
      { name: "Tecido (Largura)", fn: (L) => L - 1, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + varetasRomana(A) + 10, dim: "A" },
    ],
    components: [
      { name: "Kit Romana Redutor (Comando Romana)", qty: 1 },
      { name: "Corrente s/ Fim Bola 10 (m)", qty: 1, note: "Conforme altura do pedido" },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Tampa da Base Quadrada Baixa", qty: 2 },
      { name: "Garra p/ Romana", qtyFn: (L) => garrasPorLargura(L) },
    ],
    extra: (L, A) => ({
      "Tamanho dos Gomos (cm)": (A / (varetasRomana(A) + 1) + 1).toFixed(2),
      "Qtd de Varetas": varetasRomana(A),
    }),
  },
  "romana-teto": {
    family: "ROMANA",
    name: "Romana de Teto",
    tube: "—",
    cuts: [
      { name: "Trilho — Largura", fn: (L) => L - 1, dim: "L" },
      { name: "Trilho — Altura", fn: (L, A) => A - 4.7, dim: "A" },
      { name: "Largura Base", fn: (L) => L - 4.9, dim: "L" },
      { name: "Vareta — Largura", fn: (L) => L - 4.9, dim: "L", qtyDyn: (L, A) => varetasRomanaTeto(A) },
      { name: "Tecido (Largura)", fn: (L) => L - 5.5, dim: "L" },
      { name: "Tecido (Altura)", fn: (L, A) => A + varetasRomanaTeto(A) + 10, dim: "A" },
    ],
    components: [
      { name: "Kit Romana Redutor (Comando Romana)", qty: 1 },
      { name: "Corrente s/ Fim Bola 10 (m)", qty: 1, note: "Conforme altura do pedido" },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
      { name: "Garra p/ Romana", qtyFn: (L) => garrasPorLargura(L) },
    ],
    extra: (L, A) => ({
      "Qtd de Varetas": varetasRomanaTeto(A),
    }),
  },
  "painel-3-vias": {
    family: "ROMANA",
    name: "Painel 3 Vias",
    tube: "—",
    cuts: [
      { name: "Trilho Painel", fn: (L) => L - 2.6, dim: "L" },
      { name: "Vias Painel (cada uma)", fn: (L) => (L + 20) / 3, dim: "L", qtyMult: 3 },
      { name: "Base Chata (cada uma)", fn: (L) => ((L + 20) / 3) - 0.3, dim: "L", qtyMult: 3 },
      { name: "Tecido — Largura (cada via)", fn: (L) => (L + 20) / 3, dim: "L", qtyMult: 3 },
      { name: "Tecido — Altura", fn: (L, A) => A - 1.5, dim: "A" },
    ],
    components: [
      { name: "Comando do Painel", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
    ],
  },
  "painel-4-vias": {
    family: "ROMANA",
    name: "Painel 4 Vias",
    tube: "—",
    cuts: [
      { name: "Trilho Painel", fn: (L) => L - 2.6, dim: "L" },
      { name: "Vias Painel (cada uma)", fn: (L) => (L + 30) / 4, dim: "L", qtyMult: 4 },
      { name: "Base Chata (cada uma)", fn: (L) => ((L + 30) / 4) - 0.3, dim: "L", qtyMult: 4 },
      { name: "Tecido — Largura (cada via)", fn: (L) => (L + 30) / 4, dim: "L", qtyMult: 4 },
      { name: "Tecido — Altura", fn: (L, A) => A - 1.5, dim: "A" },
    ],
    components: [
      { name: "Comando do Painel", qty: 1 },
      { name: "Pingente Top Lux c/ Gravação", qty: 1 },
    ],
  },

  // ============ FAMÍLIA HORIZONTAIS (PH 25 / PH 50) ============
  // ATENÇÃO: largura e altura em METROS conforme planilha original
  "ph-25mm": {
    family: "HORIZONTAL",
    name: "PH 25mm (Horizontal)",
    tube: "25mm",
    unit: "m",
    cuts: [
      { name: "Cabeçalho 25mm", fn: (L) => L, dim: "L" },
      { name: "Lâmina 25mm (cada)", fn: (L) => L, dim: "L", qtyDyn: (L, A) => ph25NumLaminas(A) },
      { name: "Cadarço/Fita", fn: (L, A) => A + 0.08, dim: "A" },
    ],
    components: [
      { name: "Bastão de Comando", qty: 1 },
      { name: "Suporte de Cabeçalho", qty: 2, note: "Pode variar com a largura" },
      { name: "Furação lateral (m)", qty: 0.1 },
    ],
    extra: (L, A) => {
      const I = (L < 1.205) ? 3 : (L < 1.7) ? 4 : (L < 2.2) ? 5 : 6;
      const M = (L < 1.205) ? 2 : (L < 1.7) ? 4 : (L < 2.2) ? 3 : 4;
      const X = I - 1;
      const Z = X > 0 ? (L - 0.2) / X : 0;
      const cordas = {};
      if ([2, 3, 4].includes(M)) {
        cordas["Corda 1 (m)"] = (A + 0.4).toFixed(3);
        cordas["Corda 2 (m)"] = (2 * A + 0.4 + (L / 1.65)).toFixed(3);
      }
      if (![3, 4].includes(M)) cordas["Corda 3 (m)"] = (A + 0.3 + (X * Z)).toFixed(3);
      if (M === 4) cordas["Corda 4 (m)"] = (A + 0.4 + (L - 0.3)).toFixed(3);
      return {
        "Nº de furos cabeçalho": I,
        "Nº de lâminas (cabeçalho)": M,
        "Nº de lâminas (total)": ph25NumLaminas(A),
        "Espaçamento furos centrais (m)": Z.toFixed(3),
        ...cordas,
      };
    },
  },
  "ph-50mm-aluminio": {
    family: "HORIZONTAL",
    name: "PH 50mm Alumínio",
    tube: "50mm",
    unit: "m",
    cuts: [
      { name: "Cabeçalho 50mm Alumínio", fn: (L) => L, dim: "L" },
      { name: "Lâmina 50mm Alumínio (cada)", fn: (L) => L, dim: "L", qtyDyn: (L, A) => ph50NumLaminas(A) },
      { name: "Cadarço/Fita", fn: (L, A) => A + 0.25, dim: "A" },
    ],
    components: [
      { name: "Bastão de Comando", qty: 1 },
      { name: "Suporte de Cabeçalho 50mm", qty: 2, note: "Pode variar com a largura" },
      { name: "Furação lateral (m)", qty: 0.15 },
    ],
    extra: (L, A) => {
      const I = (L < 1.205) ? 3 : (L < 1.7) ? 4 : (L < 2.2) ? 5 : 6;
      const M = (L < 1.205) ? 2 : (L < 1.7) ? 4 : (L < 2.2) ? 3 : 4;
      const X = I - 1;
      const Z = X > 0 ? (L - 0.303) / X : 0;
      const cordas = {};
      if ([2, 3, 4].includes(M)) {
        cordas["Corda 1 (m)"] = (A + 0.6).toFixed(3);
        cordas["Corda 2 (m)"] = (A + 0.4 + (L / 1.65)).toFixed(3);
      }
      if (![3, 4].includes(M)) cordas["Corda 3 (m)"] = (A + 0.3 + (Z * Z)).toFixed(3);
      if (M === 4) cordas["Corda 4 (m)"] = (A + 0.5 + (L - 0.3)).toFixed(3);
      return {
        "Nº de furos cabeçalho": I,
        "Nº de lâminas (cabeçalho)": M,
        "Nº de lâminas (total)": ph50NumLaminas(A),
        "Espaçamento furos centrais (m)": Z.toFixed(3),
        ...cordas,
      };
    },
  },
  "ph-50mm-mad-sintetica": {
    family: "HORIZONTAL",
    name: "PH 50mm Madeira Sintética",
    tube: "50mm",
    unit: "m",
    cuts: [
      { name: "Cabeçalho 50mm Mad. Sintética", fn: (L) => L, dim: "L" },
      { name: "Lâmina 50mm Mad. Sintética (cada)", fn: (L) => L, dim: "L", qtyDyn: (L, A) => ph50NumLaminas(A) },
      { name: "Cadarço/Fita", fn: (L, A) => A + 0.25, dim: "A" },
    ],
    components: [
      { name: "Bastão de Comando", qty: 1 },
      { name: "Suporte de Cabeçalho 50mm", qty: 2, note: "Pode variar com a largura" },
    ],
    extra: (L, A) => {
      const M = (L < 1.205) ? 2 : (L < 1.7) ? 4 : (L < 2.2) ? 3 : 4;
      const I = (L < 1.205) ? 3 : (L < 1.7) ? 4 : (L < 2.2) ? 5 : 6;
      const X = I - 1;
      const Z = X > 0 ? (L - 0.303) / X : 0;
      const cordas = {};
      if ([2, 3, 4].includes(M)) {
        cordas["Corda 1 (m)"] = (2 * A + 1.1).toFixed(3);
        cordas["Corda 2 (m)"] = (2 * A + 0.9 + (L / 1.65)).toFixed(3);
      }
      if (![3, 4].includes(M)) cordas["Corda 3 (m)"] = (2 * A + 0.8 + (X * Z)).toFixed(3);
      if (M === 4) cordas["Corda 4 (m)"] = (2 * A + 1 + (L - 0.3)).toFixed(3);
      return {
        "Nº de furos cabeçalho": I,
        "Nº de lâminas (cabeçalho)": M,
        "Nº de lâminas (total)": ph50NumLaminas(A),
        "Espaçamento furos centrais (m)": Z.toFixed(3),
        ...cordas,
      };
    },
  },
  "ph-50mm-mad-natural": {
    family: "HORIZONTAL",
    name: "PH 50mm Madeira Natural",
    tube: "50mm",
    unit: "m",
    cuts: [
      { name: "Cabeçalho 50mm Mad. Natural", fn: (L) => L, dim: "L" },
      { name: "Lâmina 50mm Mad. Natural (cada)", fn: (L) => L, dim: "L", qtyDyn: (L, A) => ph50NumLaminas(A) },
      { name: "Cadarço/Fita", fn: (L, A) => A + 0.25, dim: "A" },
    ],
    components: [
      { name: "Bastão de Comando", qty: 1 },
      { name: "Suporte de Cabeçalho 50mm", qty: 2 },
    ],
    extra: (L, A) => {
      const M = (L < 1.205) ? 2 : (L < 1.7) ? 4 : (L < 2.2) ? 3 : 4;
      const I = (L < 1.205) ? 3 : (L < 1.7) ? 4 : (L < 2.2) ? 5 : 6;
      const X = I - 1;
      const Z = X > 0 ? (L - 0.303) / X : 0;
      const cordas = {};
      if ([2, 3, 4].includes(M)) {
        cordas["Corda 1 (m)"] = (2 * A + 1.1).toFixed(3);
        cordas["Corda 2 (m)"] = (2 * A + 0.9 + (L / 1.65)).toFixed(3);
      }
      if (![3, 4].includes(M)) cordas["Corda 3 (m)"] = (2 * A + 0.8 + (X * Z)).toFixed(3);
      if (M === 4) cordas["Corda 4 (m)"] = (2 * A + 1 + (L - 0.3)).toFixed(3);
      return {
        "Nº de furos cabeçalho": I,
        "Nº de lâminas (cabeçalho)": M,
        "Nº de lâminas (total)": ph50NumLaminas(A),
        "Espaçamento furos centrais (m)": Z.toFixed(3),
        ...cordas,
      };
    },
  },
  "ph-50mm-pvc": {
    family: "HORIZONTAL",
    name: "PH 50mm PVC",
    tube: "50mm",
    unit: "m",
    cuts: [
      { name: "Cabeçalho 50mm PVC", fn: (L) => L, dim: "L" },
      { name: "Lâmina 50mm PVC (cada)", fn: (L) => L, dim: "L", qtyDyn: (L, A) => ph50NumLaminas(A) },
      { name: "Cadarço/Fita", fn: (L, A) => A + 0.25, dim: "A" },
    ],
    components: [
      { name: "Bastão de Comando", qty: 1 },
      { name: "Suporte de Cabeçalho 50mm", qty: 2 },
    ],
    extra: (L, A) => {
      const M = (L < 1.205) ? 2 : (L < 1.7) ? 4 : (L < 2.2) ? 3 : 4;
      const I = (L < 1.205) ? 3 : (L < 1.7) ? 4 : (L < 2.2) ? 5 : 6;
      const X = I - 1;
      const Z = X > 0 ? (L - 0.303) / X : 0;
      const cordas = {};
      if ([2, 3, 4].includes(M)) {
        cordas["Corda 1 (m)"] = (2 * A + 1.1).toFixed(3);
        cordas["Corda 2 (m)"] = (2 * A + 0.9 + (L / 1.65)).toFixed(3);
      }
      if (![3, 4].includes(M)) cordas["Corda 3 (m)"] = (2 * A + 0.8 + (X * Z)).toFixed(3);
      if (M === 4) cordas["Corda 4 (m)"] = (2 * A + 1 + (L - 0.3)).toFixed(3);
      return {
        "Nº de furos cabeçalho": I,
        "Nº de lâminas (cabeçalho)": M,
        "Nº de lâminas (total)": ph50NumLaminas(A),
        "Espaçamento furos centrais (m)": Z.toFixed(3),
        ...cordas,
      };
    },
  },
};

function ph25NumLaminas(A) { return Math.max(0, Math.round(A * 46 + 1)); }
function ph50NumLaminas(A) { return Math.max(0, Math.round((A - 0.05) / 0.044)); }

// Cores p/ FUNDO CLARO, alinhadas aos tokens da marca (roxo é banido pelo
// brandguide — Motorizada usa o azul institucional).
const FAMILY_META = {
  SOFT:          { label: "Soft", color: "#B45309", icon: "S" },
  PREMIUM:       { label: "Premium", color: "#0E7490", icon: "P" },
  MOTORIZADAS:   { label: "Motorizada", color: "#1E40AF", icon: "M" },
  INTERMEDIARIO: { label: "Intermediária", color: "#4D7C0F", icon: "I" },
  ACOPLADA:      { label: "Acoplada", color: "#0F766E", icon: "A" },
  ROMANA:        { label: "Romana/Painel", color: "#C2410C", icon: "R" },
  HORIZONTAL:    { label: "Horizontal (PH)", color: "#475569", icon: "H" },
};

// Texto escuro sobre tinta clara (tokens semânticos); Expedido = dourado da marca.
const STATUS_META = {
  pendente:    { label: "Pendente",     color: "#606060", bg: "#F0F1F3" },
  cortando:    { label: "Em Corte",     color: "#B45309", bg: "#FEF3C7" },
  montando:    { label: "Em Montagem",  color: "#1E40AF", bg: "#DBEAFE" },
  pronto:      { label: "Pronto",       color: "#15803D", bg: "#DCFCE7" },
  expedido:    { label: "Expedido",     color: "#87794C", bg: "#F1E9CF" },
  cancelado:   { label: "Cancelado",    color: "#B91C1C", bg: "#FEE2E2" },
};

const PRIORITY_META = {
  baixa:    { label: "Baixa",    color: "#606060" },
  normal:   { label: "Normal",   color: "#87794C" },
  alta:     { label: "Alta",     color: "#C1212D" },
  urgente:  { label: "Urgente",  color: "#82131C" },
};

const BARRA_PADRAO_CM = 600; // 6 metros

// Lead times padrão (dias úteis) por família — sobrescrevíveis em Configurações
const DEFAULT_LEAD_TIMES = {
  SOFT:          5,
  PREMIUM:       7,
  MOTORIZADAS:  10,
  INTERMEDIARIO: 7,
  ACOPLADA:      8,
  ROMANA:       10,
  HORIZONTAL:    8,
};

// Tempos-padrão (minutos por peça) — sobrescrevíveis em Configurações
const DEFAULT_TEMPOS = {
  SOFT:          { corte: 8,  montagem: 15, expedicao: 4 },
  PREMIUM:       { corte: 10, montagem: 20, expedicao: 5 },
  MOTORIZADAS:   { corte: 12, montagem: 35, expedicao: 6 },
  INTERMEDIARIO: { corte: 10, montagem: 22, expedicao: 5 },
  ACOPLADA:      { corte: 12, montagem: 28, expedicao: 5 },
  ROMANA:        { corte: 15, montagem: 30, expedicao: 5 },
  HORIZONTAL:    { corte: 18, montagem: 25, expedicao: 5 },
};

// Capacidade-padrão (horas/dia) — sobrescrevível em Configurações
const DEFAULT_CAPACIDADE = {
  corteHorasDia: 8,
  montagemHorasDia: 16, // 2 montadores * 8h
  expedicaoHorasDia: 4,
};

// Categorias de estoque
const CATEGORIAS_ESTOQUE = [
  "Perfil/Tubo", "Tecido", "Comando", "Suporte", "Tampa/Ponta",
  "Motor/Acessório", "Bandô/Trilho", "Cordas/Cadarços", "Vareta/Lâmina", "Diversos"
];

// Gerador de SKU determinístico a partir do nome do componente
function autoSku(nome) {
  if (!nome) return "SKU-000";
  const clean = nome.toUpperCase().replace(/[^A-Z0-9 ]/g, "").trim();
  const parts = clean.split(/\s+/).filter(Boolean);
  const code = parts.slice(0, 3).map((p) => p.slice(0, 3)).join("-");
  // Hash curto para evitar colisão
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  const suffix = (h % 999).toString().padStart(3, "0");
  return `${code}-${suffix}`;
}

// Curva ABC: dado array com {valor}, retorna mapa idx → "A"/"B"/"C"
function classificarABC(items, getValue) {
  if (!items.length) return new Map();
  const sorted = [...items].sort((a, b) => getValue(b) - getValue(a));
  const total = sorted.reduce((s, it) => s + getValue(it), 0) || 1;
  const result = new Map();
  let acc = 0;
  for (const it of sorted) {
    acc += getValue(it);
    const pct = acc / total;
    result.set(it, pct <= 0.80 ? "A" : pct <= 0.95 ? "B" : "C");
  }
  return result;
}

// Datas úteis: adiciona N dias úteis a uma data ISO
function addBusinessDays(isoDate, days) {
  const d = new Date(isoDate + "T12:00:00");
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const dow = d.getDay();
    if (dow !== 0 && dow !== 6) added++;
  }
  return d.toISOString().slice(0, 10);
}

// Diferença em dias entre duas datas ISO
function daysBetween(isoA, isoB) {
  const a = new Date(isoA + "T12:00:00");
  const b = new Date(isoB + "T12:00:00");
  return Math.round((b - a) / 86400000);
}

// Início e fim de semana corrente (segunda a domingo) em ISO
function semanaAtual() {
  const d = new Date();
  const dow = d.getDay();
  const offset = dow === 0 ? -6 : 1 - dow; // segunda
  const seg = new Date(d);
  seg.setDate(d.getDate() + offset);
  const dom = new Date(seg);
  dom.setDate(seg.getDate() + 6);
  return { inicio: seg.toISOString().slice(0,10), fim: dom.toISOString().slice(0,10) };
}

// =====================================================================
//                          CÁLCULOS
// =====================================================================
function calculatePiece(piece) {
  const p = PRODUCT_CATALOG[piece.productKey];
  if (!p) return null;
  const L = parseFloat(piece.largura);
  const A = parseFloat(piece.altura);
  const qty = parseInt(piece.quantidade) || 1;
  if (!(L > 0) || !(A > 0)) return null;

  const cuts = p.cuts.map((c) => {
    let unitValue = c.fn(L, A);
    if (!Number.isFinite(unitValue) || unitValue <= 0) unitValue = 0;
    const mult = c.qtyMult || 1;
    const dyn = c.qtyDyn ? c.qtyDyn(L, A) : 1;
    return {
      name: c.name,
      dim: c.dim,
      unitValue,
      perPiece: mult * dyn,
      totalQty: qty * mult * dyn,
      totalLength: qty * mult * dyn * unitValue,
      unit: p.unit === "m" ? "m" : "cm",
      note: c.note,
    };
  });

  const components = p.components.map((c) => {
    const qtyEach = c.qtyFn ? c.qtyFn(L, A) : c.qty;
    return {
      name: c.name,
      qtyEach,
      total: qty * qtyEach,
      note: c.note,
    };
  });

  const extra = p.extra ? p.extra(L, A) : null;
  return { product: p, cuts, components, extra, L, A, qty };
}

function consolidateComponents(pieces) {
  const map = new Map();
  pieces.forEach((piece) => {
    const c = calculatePiece(piece);
    if (!c) return;
    c.components.forEach((comp) => {
      const k = comp.name;
      map.set(k, (map.get(k) || 0) + comp.total);
    });
  });
  return Array.from(map.entries())
    .map(([name, total]) => ({ name, total }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function consolidateCuts(pieces) {
  // Agrupa cortes por perfil; soma o comprimento total (em metros) e estima barras de 6m
  const map = new Map();
  pieces.forEach((piece) => {
    const c = calculatePiece(piece);
    if (!c) return;
    c.cuts.forEach((cut) => {
      const k = cut.name;
      const m = (cut.unit === "m") ? cut.totalLength : (cut.totalLength / 100);
      const prev = map.get(k) || { totalM: 0, count: 0, sample: cut };
      map.set(k, { totalM: prev.totalM + m, count: prev.count + cut.totalQty, sample: cut });
    });
  });
  return Array.from(map.entries())
    .map(([name, v]) => ({
      name,
      totalCount: v.count,
      totalMeters: v.totalM,
      bars6m: Math.ceil(v.totalM / 6),
      sample: v.sample,
    }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// =====================================================================
//                          PERSISTÊNCIA
// =====================================================================
async function storageList(prefix) {
  try {
    const r = await window.storage.list(prefix);
    return r?.keys || [];
  } catch (e) { return []; }
}
async function storageGet(k) {
  try {
    const r = await window.storage.get(k);
    return r?.value ? JSON.parse(r.value) : null;
  } catch (e) { return null; }
}
async function storageSet(k, v) {
  try { await window.storage.set(k, JSON.stringify(v)); return true; }
  catch (e) { return false; }
}
async function storageDel(k) {
  try { await window.storage.delete(k); return true; }
  catch (e) { return false; }
}

// =====================================================================
//                          UI HELPERS
// =====================================================================
const fmt = (n, decimals = 1) => {
  if (!Number.isFinite(n)) return "—";
  return n.toLocaleString("pt-BR", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
};
const fmtInt = (n) => Number.isFinite(n) ? n.toLocaleString("pt-BR") : "—";

const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36);

// =====================================================================
//                          COMPONENTES
// =====================================================================
function Badge({ children, color = "#87794C", bg }) {
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-sm border"
      style={{ color, borderColor: color + "55", background: bg || (color + "12") }}
    >
      {children}
    </span>
  );
}

function StatusBadge({ status }) {
  const m = STATUS_META[status] || STATUS_META.pendente;
  return <Badge color={m.color} bg={m.bg + "66"}>{m.label}</Badge>;
}

function FamilyChip({ family }) {
  const m = FAMILY_META[family] || { label: family, color: "#606060", icon: "?" };
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-mono">
      <span
        className="w-4 h-4 rounded-sm flex items-center justify-center text-[9px] font-bold"
        style={{ background: m.color + "33", color: m.color, border: `1px solid ${m.color}66` }}
      >
        {m.icon}
      </span>
      <span className="text-stone-300">{m.label}</span>
    </span>
  );
}

function Section({ title, icon: Icon, children, action, hint }) {
  return (
    <section className="mb-8">
      <header className="flex items-center justify-between mb-3 pb-2 border-b border-stone-800">
        <div className="flex items-center gap-2.5">
          {Icon && <Icon size={14} className="text-amber-500" />}
          <h2 className="text-[11px] font-mono uppercase tracking-[0.25em] text-stone-300">{title}</h2>
          {hint && <span className="text-[10px] text-stone-600 ml-2">{hint}</span>}
        </div>
        {action}
      </header>
      {children}
    </section>
  );
}

// =====================================================================
//                          FORMULÁRIO DE PEDIDO
// =====================================================================
function OrderForm({ existing, onSave, onCancel, config }) {
  const [orderNumber, setOrderNumber] = useState(existing?.orderNumber || "");
  const [client, setClient] = useState(existing?.client || "");
  const [date, setDate] = useState(existing?.date || today());
  const [deliveryDate, setDeliveryDate] = useState(existing?.deliveryDate || "");
  const [priority, setPriority] = useState(existing?.priority || "normal");
  const [status, setStatus] = useState(existing?.status || "pendente");
  const [notes, setNotes] = useState(existing?.notes || "");
  const [pieces, setPieces] = useState(existing?.pieces || []);
  const [showPicker, setShowPicker] = useState(false);
  const [familyFilter, setFamilyFilter] = useState("ALL");
  const [search, setSearch] = useState("");

  // Sugerir data de entrega com base no maior lead time entre as famílias do pedido
  useEffect(() => {
    if (!deliveryDate && pieces.length > 0 && config?.leadTimes) {
      const fams = new Set(pieces.map((p) => PRODUCT_CATALOG[p.productKey]?.family).filter(Boolean));
      const maxLead = Math.max(...Array.from(fams).map((f) => config.leadTimes[f] || 7));
      if (maxLead > 0) setDeliveryDate(addBusinessDays(date, maxLead));
    }
  }, [pieces.length]); // somente quando muda quantidade de peças

  const handleAddPiece = (productKey) => {
    setPieces([...pieces, {
      id: uid(),
      productKey,
      ambiente: "",
      largura: "",
      altura: "",
      quantidade: 1,
      cor: "",
      tecido: "",
      observacao: "",
    }]);
    setShowPicker(false);
    setSearch("");
  };

  const updatePiece = (id, field, value) => {
    setPieces(pieces.map((p) => p.id === id ? { ...p, [field]: value } : p));
  };
  const removePiece = (id) => setPieces(pieces.filter((p) => p.id !== id));
  const duplicatePiece = (p) => setPieces([...pieces, { ...p, id: uid() }]);

  const filteredCatalog = useMemo(() => {
    return Object.entries(PRODUCT_CATALOG).filter(([k, p]) => {
      if (familyFilter !== "ALL" && p.family !== familyFilter) return false;
      if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [familyFilter, search]);

  const handleSave = () => {
    if (!orderNumber.trim()) { alert("Número do pedido é obrigatório."); return; }
    if (pieces.length === 0) { alert("Adicione ao menos uma peça."); return; }
    const order = {
      id: existing?.id || uid(),
      orderNumber: orderNumber.trim(),
      client: client.trim(),
      date,
      deliveryDate,
      priority,
      status,
      notes,
      pieces,
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    onSave(order);
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-3">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Nº do Pedido *</label>
          <input
            value={orderNumber}
            onChange={(e) => setOrderNumber(e.target.value)}
            placeholder="PED-2026-001"
            className="w-full bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 text-sm font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
          />
        </div>
        <div className="md:col-span-4">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Cliente</label>
          <input
            value={client}
            onChange={(e) => setClient(e.target.value)}
            placeholder="Nome do cliente"
            className="w-full bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 focus:outline-none focus:border-amber-500/60"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Data do Pedido</label>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="w-full bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 text-sm font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
          />
        </div>
        <div className="md:col-span-2">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Entrega Prevista</label>
          <input
            type="date"
            value={deliveryDate}
            onChange={(e) => setDeliveryDate(e.target.value)}
            className="w-full bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 text-sm font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
          />
        </div>
        <div className="md:col-span-1">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Prio.</label>
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value)}
            className="w-full bg-stone-950 border border-stone-800 rounded-sm px-2 py-2 text-xs font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
          >
            {Object.entries(PRIORITY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="md:col-span-3">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Status</label>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value)}
            className="w-full bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 text-sm font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
          >
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="md:col-span-9">
          <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Observações</label>
          <input
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Observações gerais do pedido…"
            className="w-full bg-stone-950 border border-stone-800 rounded-sm px-3 py-2 text-sm text-stone-100 focus:outline-none focus:border-amber-500/60"
          />
        </div>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[11px] font-mono uppercase tracking-[0.25em] text-stone-300">
            Peças do Pedido <span className="text-stone-600">({pieces.length})</span>
          </h3>
          <button
            onClick={() => setShowPicker(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-400 rounded-sm text-xs font-mono uppercase tracking-wider transition"
          >
            <Plus size={12} /> Adicionar Peça
          </button>
        </div>

        {pieces.length === 0 && (
          <div className="text-center py-8 border border-dashed border-stone-800 rounded-sm">
            <Package size={28} className="mx-auto text-stone-700 mb-2" />
            <p className="text-xs text-stone-500 font-mono">Nenhuma peça cadastrada. Clique em "Adicionar Peça".</p>
          </div>
        )}

        <div className="space-y-3">
          {pieces.map((piece, idx) => {
            const p = PRODUCT_CATALOG[piece.productKey];
            const calc = calculatePiece(piece);
            const family = p?.family;
            const isPH = family === "HORIZONTAL";
            return (
              <div key={piece.id} className="border border-stone-800 rounded-sm bg-stone-950/60">
                <header className="flex items-center justify-between px-3 py-2 border-b border-stone-800 bg-stone-900/40">
                  <div className="flex items-center gap-3">
                    <span className="text-amber-500 font-mono text-xs">#{String(idx + 1).padStart(2, "0")}</span>
                    {p && <FamilyChip family={family} />}
                    <span className="text-stone-200 text-sm font-medium">{p?.name || "Produto não selecionado"}</span>
                    {p?.tube && p.tube !== "—" && <span className="text-[10px] text-stone-500 font-mono">∅{p.tube}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => duplicatePiece(piece)} className="p-1.5 text-stone-500 hover:text-stone-200 transition" title="Duplicar">
                      <Copy size={12} />
                    </button>
                    <button onClick={() => removePiece(piece.id)} className="p-1.5 text-stone-500 hover:text-red-400 transition" title="Remover">
                      <Trash2 size={12} />
                    </button>
                  </div>
                </header>
                <div className="grid grid-cols-2 md:grid-cols-12 gap-2 p-3">
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Ambiente</label>
                    <input
                      value={piece.ambiente}
                      onChange={(e) => updatePiece(piece.id, "ambiente", e.target.value)}
                      placeholder="Sala / Quarto..."
                      className="w-full bg-stone-950 border border-stone-800 rounded-sm px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500/60"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">
                      Largura ({isPH ? "m" : "cm"}) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={piece.largura}
                      onChange={(e) => updatePiece(piece.id, "largura", e.target.value)}
                      placeholder={isPH ? "1.50" : "150"}
                      className="w-full bg-stone-950 border border-stone-800 rounded-sm px-2 py-1.5 text-xs font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">
                      Altura ({isPH ? "m" : "cm"}) *
                    </label>
                    <input
                      type="number"
                      step="0.01"
                      value={piece.altura}
                      onChange={(e) => updatePiece(piece.id, "altura", e.target.value)}
                      placeholder={isPH ? "2.20" : "220"}
                      className="w-full bg-stone-950 border border-stone-800 rounded-sm px-2 py-1.5 text-xs font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
                    />
                  </div>
                  <div className="md:col-span-1">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Qtd *</label>
                    <input
                      type="number"
                      min="1"
                      value={piece.quantidade}
                      onChange={(e) => updatePiece(piece.id, "quantidade", e.target.value)}
                      className="w-full bg-stone-950 border border-stone-800 rounded-sm px-2 py-1.5 text-xs font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Cor / Tecido</label>
                    <input
                      value={piece.tecido}
                      onChange={(e) => updatePiece(piece.id, "tecido", e.target.value)}
                      placeholder="Modelo, cor..."
                      className="w-full bg-stone-950 border border-stone-800 rounded-sm px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500/60"
                    />
                  </div>
                  <div className="md:col-span-3">
                    <label className="block text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Observação da Peça</label>
                    <input
                      value={piece.observacao}
                      onChange={(e) => updatePiece(piece.id, "observacao", e.target.value)}
                      placeholder="Lado de comando, etc."
                      className="w-full bg-stone-950 border border-stone-800 rounded-sm px-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500/60"
                    />
                  </div>
                </div>
                {calc && (
                  <div className="px-3 pb-3">
                    <div className="border-t border-stone-800 pt-2 mt-1 grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px] font-mono">
                      {calc.cuts.slice(0, 8).map((c, i) => (
                        <div key={i} className="flex justify-between text-stone-400">
                          <span className="truncate pr-1">{c.name}:</span>
                          <span className="text-amber-400 tabular-nums">{fmt(c.unitValue, 2)} {c.unit}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {showPicker && (
        <div className="fixed inset-0 z-50 bg-black/85 backdrop-blur-sm flex items-center justify-center p-4" onClick={() => setShowPicker(false)}>
          <div className="bg-stone-950 border border-stone-800 rounded-sm w-full max-w-3xl max-h-[80vh] overflow-hidden flex flex-col" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between px-4 py-3 border-b border-stone-800">
              <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200">Catálogo de Produtos</h3>
              <button onClick={() => setShowPicker(false)} className="text-stone-500 hover:text-stone-200"><X size={16} /></button>
            </header>
            <div className="p-3 border-b border-stone-800 flex gap-2">
              <div className="flex-1 relative">
                <Search size={12} className="absolute left-2.5 top-2.5 text-stone-600" />
                <input
                  autoFocus
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Buscar produto..."
                  className="w-full bg-stone-900 border border-stone-800 rounded-sm pl-7 pr-2 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500/60"
                />
              </div>
              <select
                value={familyFilter}
                onChange={(e) => setFamilyFilter(e.target.value)}
                className="bg-stone-900 border border-stone-800 rounded-sm px-2 py-1.5 text-xs font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
              >
                <option value="ALL">Todas Famílias</option>
                {Object.entries(FAMILY_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              {filteredCatalog.map(([key, p]) => (
                <button
                  key={key}
                  onClick={() => handleAddPiece(key)}
                  className="w-full text-left px-3 py-2 hover:bg-stone-900 transition flex items-center gap-3 border-b border-stone-900"
                >
                  <FamilyChip family={p.family} />
                  <span className="text-sm text-stone-200 flex-1">{p.name}</span>
                  {p.tube && p.tube !== "—" && <span className="text-[10px] text-stone-500 font-mono">∅{p.tube}</span>}
                  <ArrowRight size={12} className="text-stone-600" />
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-4 border-t border-stone-800">
        <button onClick={onCancel} className="px-4 py-2 text-xs font-mono uppercase tracking-wider text-stone-400 hover:text-stone-200 transition">
          Cancelar
        </button>
        <button onClick={handleSave} className="flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-stone-950 font-mono text-xs uppercase tracking-wider transition">
          <Save size={12} /> Salvar Pedido
        </button>
      </div>
    </div>
  );
}

// =====================================================================
//                          DETALHE DO PEDIDO
// =====================================================================
function OrderDetail({ order, onBack, onEdit, onChangeStatus, onDelete }) {
  const [tab, setTab] = useState("corte");

  const allCalc = useMemo(
    () => order.pieces.map((p) => ({ piece: p, calc: calculatePiece(p) })),
    [order]
  );

  const consolidatedComponents = useMemo(() => consolidateComponents(order.pieces), [order]);
  const consolidatedCuts = useMemo(() => consolidateCuts(order.pieces), [order]);

  const handlePrint = () => window.print();

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-stone-800">
        <div>
          <button onClick={onBack} className="flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-wider text-stone-500 hover:text-amber-500 transition mb-2">
            <ChevronLeft size={12} /> Voltar
          </button>
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-2xl font-bold text-stone-100">
              <span className="text-amber-500 font-mono">#</span>{order.orderNumber}
            </h2>
            <StatusBadge status={order.status} />
            <Badge color={PRIORITY_META[order.priority]?.color || "#606060"}>
              {PRIORITY_META[order.priority]?.label || order.priority}
            </Badge>
          </div>
          <div className="mt-1 text-xs text-stone-500 flex gap-4 flex-wrap">
            {order.client && <span>👤 {order.client}</span>}
            {order.date && <span>📅 Aberto: {order.date}</span>}
            {order.deliveryDate && <span>🚚 Entrega: {order.deliveryDate}</span>}
            <span>{order.pieces.length} peça(s)</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={order.status}
            onChange={(e) => onChangeStatus(order.id, e.target.value)}
            className="bg-stone-900 border border-stone-800 rounded-sm px-2 py-1.5 text-xs font-mono text-stone-200 focus:outline-none focus:border-amber-500/60"
          >
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <button onClick={handlePrint} className="p-2 border border-stone-800 hover:border-amber-500/60 text-stone-400 hover:text-amber-500 rounded-sm transition" title="Imprimir">
            <Printer size={14} />
          </button>
          <button onClick={() => onEdit(order)} className="flex items-center gap-1.5 px-3 py-1.5 border border-stone-800 hover:border-amber-500/60 text-stone-300 rounded-sm text-xs font-mono uppercase tracking-wider transition">
            <Edit3 size={12} /> Editar
          </button>
          <button onClick={() => onDelete(order.id)} className="p-2 border border-stone-800 hover:border-red-500/60 text-stone-500 hover:text-red-400 rounded-sm transition" title="Excluir">
            <Trash2 size={14} />
          </button>
        </div>
      </header>

      {order.notes && (
        <div className="border-l-2 border-amber-500/60 pl-3 py-2 bg-stone-900/40 text-xs text-stone-400">
          <span className="font-mono uppercase text-[10px] text-stone-500 block mb-0.5">Observações</span>
          {order.notes}
        </div>
      )}

      <div className="flex gap-1 border-b border-stone-800 -mb-px">
        {[
          { k: "corte", label: "Planejamento de Corte", icon: Scissors },
          { k: "componentes", label: "Componentes (BOM)", icon: Boxes },
          { k: "consolidado", label: "Consolidado", icon: BarChart3 },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setTab(t.k)}
            className={`flex items-center gap-1.5 px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition border-b-2 ${
              tab === t.k
                ? "border-amber-500 text-amber-500"
                : "border-transparent text-stone-500 hover:text-stone-300"
            }`}
          >
            <t.icon size={12} /> {t.label}
          </button>
        ))}
      </div>

      {tab === "corte" && (
        <div className="space-y-6">
          {allCalc.map(({ piece, calc }, idx) => {
            if (!calc) return (
              <div key={piece.id} className="border border-amber-500/30 bg-amber-500/5 p-3 text-amber-400 text-xs flex items-center gap-2">
                <AlertCircle size={14} />
                Peça #{idx + 1}: dimensões inválidas ou ausentes
              </div>
            );
            return (
              <article key={piece.id} className="border border-stone-800 rounded-sm">
                <header className="px-4 py-2.5 border-b border-stone-800 bg-stone-900/40 flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-amber-500 font-mono text-xs">PEÇA {String(idx + 1).padStart(2, "0")}</span>
                    <FamilyChip family={calc.product.family} />
                    <span className="text-stone-100 text-sm font-medium">{calc.product.name}</span>
                  </div>
                  <div className="text-[11px] font-mono text-stone-400 flex gap-3">
                    <span>L: <span className="text-amber-400">{fmt(calc.L, 2)}</span></span>
                    <span>A: <span className="text-amber-400">{fmt(calc.A, 2)}</span></span>
                    <span>Qtd: <span className="text-amber-400">{calc.qty}</span></span>
                    {piece.ambiente && <span className="text-stone-500">| {piece.ambiente}</span>}
                  </div>
                </header>
                <div className="p-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
                        <th className="text-left py-1.5 px-2">Item</th>
                        <th className="text-center py-1.5 px-2">Dim.</th>
                        <th className="text-right py-1.5 px-2">Tamanho</th>
                        <th className="text-center py-1.5 px-2">Qtd/peça</th>
                        <th className="text-center py-1.5 px-2">Qtd total</th>
                        <th className="text-right py-1.5 px-2">Total {calc.product.unit === "m" ? "(m)" : "(cm)"}</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {calc.cuts.map((c, i) => (
                        <tr key={i} className="border-b border-stone-900 hover:bg-stone-900/40">
                          <td className="py-1.5 px-2 text-stone-200">{c.name}{c.note && <span className="text-[10px] text-stone-500 ml-2">({c.note})</span>}</td>
                          <td className="text-center text-stone-500 text-[10px]">{c.dim}</td>
                          <td className="text-right text-amber-400 tabular-nums">{fmt(c.unitValue, 2)}</td>
                          <td className="text-center text-stone-400">{c.perPiece}</td>
                          <td className="text-center text-stone-300">{c.totalQty}</td>
                          <td className="text-right text-stone-100 tabular-nums">{fmt(c.totalLength, 2)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {calc.extra && (
                    <div className="mt-3 pt-3 border-t border-stone-800">
                      <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-2">Dados Adicionais</div>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-x-4 gap-y-1 text-[11px] font-mono">
                        {Object.entries(calc.extra).map(([k, v]) => (
                          <div key={k} className="flex justify-between text-stone-400">
                            <span className="truncate pr-1">{k}:</span>
                            <span className="text-amber-400 tabular-nums">{v}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === "componentes" && (
        <div className="space-y-6">
          {allCalc.map(({ piece, calc }, idx) => {
            if (!calc) return null;
            return (
              <article key={piece.id} className="border border-stone-800 rounded-sm">
                <header className="px-4 py-2.5 border-b border-stone-800 bg-stone-900/40 flex justify-between items-center flex-wrap gap-2">
                  <div className="flex items-center gap-3">
                    <span className="text-amber-500 font-mono text-xs">PEÇA {String(idx + 1).padStart(2, "0")}</span>
                    <span className="text-stone-100 text-sm font-medium">{calc.product.name}</span>
                  </div>
                  <span className="text-[11px] font-mono text-stone-500">Qtd: {calc.qty}</span>
                </header>
                <div className="p-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
                        <th className="text-left py-1.5 px-2">Componente</th>
                        <th className="text-center py-1.5 px-2">Por peça</th>
                        <th className="text-center py-1.5 px-2">Total</th>
                        <th className="text-left py-1.5 px-2">Observação</th>
                      </tr>
                    </thead>
                    <tbody className="font-mono">
                      {calc.components.map((c, i) => (
                        <tr key={i} className="border-b border-stone-900 hover:bg-stone-900/40">
                          <td className="py-1.5 px-2 text-stone-200">{c.name}</td>
                          <td className="text-center text-stone-400">{c.qtyEach}</td>
                          <td className="text-center text-amber-400 font-semibold">{c.total}</td>
                          <td className="py-1.5 px-2 text-[10px] text-stone-500">{c.note || ""}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {tab === "consolidado" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="border border-stone-800 rounded-sm">
            <header className="px-4 py-2.5 border-b border-stone-800 bg-stone-900/40 flex items-center gap-2">
              <Scissors size={14} className="text-amber-500" />
              <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200">Cortes Totais do Pedido</h3>
            </header>
            <div className="p-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
                    <th className="text-left py-1.5 px-2">Perfil / Item</th>
                    <th className="text-center py-1.5 px-2">Cortes</th>
                    <th className="text-right py-1.5 px-2">Metros</th>
                    <th className="text-right py-1.5 px-2">Barras 6m</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {consolidatedCuts.map((c, i) => (
                    <tr key={i} className="border-b border-stone-900 hover:bg-stone-900/40">
                      <td className="py-1.5 px-2 text-stone-200">{c.name}</td>
                      <td className="text-center text-stone-400">{c.totalCount}</td>
                      <td className="text-right text-amber-400 tabular-nums">{fmt(c.totalMeters, 2)}</td>
                      <td className="text-right text-stone-100 tabular-nums">{c.bars6m}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          <div className="border border-stone-800 rounded-sm">
            <header className="px-4 py-2.5 border-b border-stone-800 bg-stone-900/40 flex items-center gap-2">
              <Boxes size={14} className="text-amber-500" />
              <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200">Componentes Totais (BOM)</h3>
            </header>
            <div className="p-3">
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
                    <th className="text-left py-1.5 px-2">Componente</th>
                    <th className="text-right py-1.5 px-2">Qtd</th>
                  </tr>
                </thead>
                <tbody className="font-mono">
                  {consolidatedComponents.map((c, i) => (
                    <tr key={i} className="border-b border-stone-900 hover:bg-stone-900/40">
                      <td className="py-1.5 px-2 text-stone-200">{c.name}</td>
                      <td className="text-right text-amber-400 tabular-nums">{fmtInt(Math.ceil(c.total))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
//                          PAINEL DE PRODUÇÃO
// =====================================================================
function ProductionPanel({ orders }) {
  const grouped = useMemo(() => {
    const g = { pendente: [], cortando: [], montando: [], pronto: [], expedido: [] };
    orders.forEach((o) => {
      if (g[o.status]) g[o.status].push(o);
    });
    return g;
  }, [orders]);

  const stats = useMemo(() => {
    let totalPecas = 0;
    orders.filter(o => ["pendente", "cortando", "montando"].includes(o.status)).forEach(o => {
      totalPecas += o.pieces.reduce((s, p) => s + (parseInt(p.quantidade) || 0), 0);
    });
    return {
      totalPedidos: orders.length,
      abertos: orders.filter(o => !["expedido", "cancelado"].includes(o.status)).length,
      pecasNaFila: totalPecas,
    };
  }, [orders]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-3 gap-3">
        {[
          { label: "Pedidos Cadastrados", v: stats.totalPedidos, icon: FileText },
          { label: "Em Andamento", v: stats.abertos, icon: Activity },
          { label: "Peças na Fila", v: stats.pecasNaFila, icon: Boxes },
        ].map((s, i) => (
          <div key={i} className="border border-stone-800 rounded-sm p-4 bg-stone-950/60">
            <div className="flex items-center justify-between mb-2">
              <s.icon size={16} className="text-amber-500" />
              <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500">{s.label}</span>
            </div>
            <div className="text-3xl font-bold text-stone-100 tabular-nums">{fmtInt(s.v)}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
        {["pendente", "cortando", "montando", "pronto", "expedido"].map((status) => {
          const m = STATUS_META[status];
          const list = grouped[status] || [];
          return (
            <div key={status} className="border border-stone-800 rounded-sm bg-stone-950/40 flex flex-col">
              <header className="px-3 py-2 border-b border-stone-800 flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider" style={{ color: m.color }}>{m.label}</span>
                <span className="text-[10px] font-mono text-stone-500">{list.length}</span>
              </header>
              <div className="flex-1 p-2 space-y-2 max-h-[60vh] overflow-y-auto">
                {list.map((o) => {
                  const pecas = o.pieces.reduce((s, p) => s + (parseInt(p.quantidade) || 0), 0);
                  return (
                    <div key={o.id} className="border border-stone-800 rounded-sm p-2 bg-stone-950 text-xs">
                      <div className="flex justify-between items-start mb-1">
                        <span className="font-mono text-amber-400">#{o.orderNumber}</span>
                        <Badge color={PRIORITY_META[o.priority]?.color}>
                          {PRIORITY_META[o.priority]?.label?.[0] || "?"}
                        </Badge>
                      </div>
                      {o.client && <div className="text-stone-300 truncate">{o.client}</div>}
                      <div className="text-[10px] text-stone-500 mt-1 flex justify-between">
                        <span>{pecas} pç</span>
                        {o.deliveryDate && <span>📅 {o.deliveryDate}</span>}
                      </div>
                    </div>
                  );
                })}
                {list.length === 0 && <div className="text-center text-[10px] text-stone-700 py-4">—vazio—</div>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// =====================================================================
//                          NECESSIDADES (Suprimentos)
// =====================================================================
function SupplyPanel({ orders, allStatusFilter, estoque, skuMap }) {
  const [filterStatus, setFilterStatus] = useState(["pendente", "cortando", "montando"]);
  const [showOnlyMissing, setShowOnlyMissing] = useState(false);

  const filtered = useMemo(() => orders.filter((o) => filterStatus.includes(o.status)), [orders, filterStatus]);

  const allPieces = useMemo(() => filtered.flatMap((o) => o.pieces.map((p) => ({ ...p, _orderId: o.id, _orderNumber: o.orderNumber }))), [filtered]);

  const consolidatedComponents = useMemo(() => consolidateComponents(allPieces), [allPieces]);
  const consolidatedCuts = useMemo(() => consolidateCuts(allPieces), [allPieces]);

  // Cruzar com estoque por nome (via skuMap → sku → estoque)
  const compsComEstoque = useMemo(() => {
    return consolidatedComponents.map((c) => {
      const sku = skuMap?.[c.name] || autoSku(c.name);
      const item = estoque?.[sku];
      const saldo = item?.saldo ?? 0;
      const necessario = Math.ceil(c.total);
      const liquido = Math.max(0, necessario - saldo);
      const minimo = item?.minimo ?? 0;
      const reposicao = item?.reposicao ?? 0;
      const alerta = (saldo - necessario) < minimo;
      return { ...c, sku, saldo, necessario, liquido, minimo, reposicao, alerta, cadastrado: !!item };
    });
  }, [consolidatedComponents, estoque, skuMap]);

  const cutsComEstoque = useMemo(() => {
    return consolidatedCuts.map((c) => {
      const sku = skuMap?.[c.name] || autoSku(c.name);
      const item = estoque?.[sku];
      const saldoBarras = item?.saldo ?? 0; // saldo em barras de 6m
      const necessario = c.bars6m;
      const liquido = Math.max(0, necessario - saldoBarras);
      return { ...c, sku, saldoBarras, necessario, liquido, cadastrado: !!item };
    });
  }, [consolidatedCuts, estoque, skuMap]);

  const compsToShow = showOnlyMissing ? compsComEstoque.filter((c) => c.liquido > 0) : compsComEstoque;
  const cutsToShow = showOnlyMissing ? cutsComEstoque.filter((c) => c.liquido > 0) : cutsComEstoque;

  const totalCompsFaltam = compsComEstoque.filter((c) => c.liquido > 0).length;
  const totalCutsFaltam = cutsComEstoque.filter((c) => c.liquido > 0).length;

  const toggleStatus = (s) => {
    setFilterStatus((prev) => prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s]);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 flex-wrap pb-3 border-b border-stone-800">
        <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Considerar pedidos:</span>
        {Object.entries(STATUS_META).map(([k, m]) => (
          <button
            key={k}
            onClick={() => toggleStatus(k)}
            className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider border rounded-sm transition ${
              filterStatus.includes(k) ? "border-amber-500/60 text-amber-400 bg-amber-500/10" : "border-stone-800 text-stone-500"
            }`}
          >
            {m.label}
          </button>
        ))}
        <button
          onClick={() => setShowOnlyMissing((v) => !v)}
          className={`px-2 py-1 text-[10px] font-mono uppercase tracking-wider border rounded-sm transition ${
            showOnlyMissing ? "border-red-500/60 text-red-400 bg-red-500/10" : "border-stone-800 text-stone-500"
          }`}
        >
          <AlertTriangle size={10} className="inline mr-1" />
          Só o que falta comprar
        </button>
        <span className="text-[10px] font-mono text-stone-500 ml-auto">
          {filtered.length} pedido(s) | {allPieces.length} peça(s)
        </span>
      </div>

      {(totalCompsFaltam + totalCutsFaltam) > 0 && (
        <div className="border border-red-900/60 bg-red-950/30 px-4 py-3 rounded-sm flex items-center gap-3">
          <AlertTriangle size={16} className="text-red-400" />
          <div className="text-xs font-mono text-red-300">
            <span className="font-bold">{totalCutsFaltam + totalCompsFaltam}</span> item(ns) com saldo insuficiente —
            <span className="text-red-400 ml-1">{totalCutsFaltam} matéria(s)-prima</span> e
            <span className="text-red-400 ml-1">{totalCompsFaltam} componente(s)</span>.
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="border border-stone-800 rounded-sm">
          <header className="px-4 py-2.5 border-b border-stone-800 bg-stone-900/40 flex items-center gap-2">
            <Scissors size={14} className="text-amber-500" />
            <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200">Matéria-Prima — Necessidade Líquida</h3>
          </header>
          <div className="p-3 max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-stone-950 z-10">
                <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
                  <th className="text-left py-1.5 px-2">Perfil / Item</th>
                  <th className="text-right py-1.5 px-2">Bruto<br/>(barras)</th>
                  <th className="text-right py-1.5 px-2">Saldo</th>
                  <th className="text-right py-1.5 px-2">Comprar</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {cutsToShow.map((c, i) => (
                  <tr key={i} className={`border-b border-stone-900 hover:bg-stone-900/40 ${c.liquido > 0 ? "bg-red-950/10" : ""}`}>
                    <td className="py-1.5 px-2 text-stone-200">
                      <div>{c.name}</div>
                      <div className="text-[9px] text-stone-600">
                        {c.sku} · {fmt(c.totalMeters, 2)}m totais
                        {!c.cadastrado && <span className="text-amber-600 ml-1">⚠ não cadastrado</span>}
                      </div>
                    </td>
                    <td className="text-right text-stone-300 tabular-nums">{c.bars6m}</td>
                    <td className="text-right text-stone-400 tabular-nums">{c.saldoBarras}</td>
                    <td className={`text-right font-semibold tabular-nums ${c.liquido > 0 ? "text-red-400" : "text-emerald-500"}`}>{c.liquido}</td>
                  </tr>
                ))}
                {cutsToShow.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-stone-700 py-6">
                    {showOnlyMissing ? "Tudo coberto pelo estoque" : "Nenhum corte previsto"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>

        <div className="border border-stone-800 rounded-sm">
          <header className="px-4 py-2.5 border-b border-stone-800 bg-stone-900/40 flex items-center gap-2">
            <Boxes size={14} className="text-amber-500" />
            <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200">Componentes — Necessidade Líquida</h3>
          </header>
          <div className="p-3 max-h-[60vh] overflow-y-auto">
            <table className="w-full text-xs">
              <thead className="sticky top-0 bg-stone-950 z-10">
                <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
                  <th className="text-left py-1.5 px-2">Componente</th>
                  <th className="text-right py-1.5 px-2">Bruto</th>
                  <th className="text-right py-1.5 px-2">Saldo</th>
                  <th className="text-right py-1.5 px-2">Comprar</th>
                </tr>
              </thead>
              <tbody className="font-mono">
                {compsToShow.map((c, i) => (
                  <tr key={i} className={`border-b border-stone-900 hover:bg-stone-900/40 ${c.liquido > 0 ? "bg-red-950/10" : c.alerta ? "bg-amber-950/10" : ""}`}>
                    <td className="py-1.5 px-2 text-stone-200">
                      <div>{c.name}</div>
                      <div className="text-[9px] text-stone-600">
                        {c.sku}
                        {!c.cadastrado && <span className="text-amber-600 ml-1">⚠ não cadastrado</span>}
                        {c.alerta && c.cadastrado && <span className="text-amber-500 ml-1">↓ ponto reposição</span>}
                      </div>
                    </td>
                    <td className="text-right text-stone-300 tabular-nums">{c.necessario}</td>
                    <td className="text-right text-stone-400 tabular-nums">{c.saldo}</td>
                    <td className={`text-right font-semibold tabular-nums ${c.liquido > 0 ? "text-red-400" : "text-emerald-500"}`}>{c.liquido}</td>
                  </tr>
                ))}
                {compsToShow.length === 0 && (
                  <tr><td colSpan={4} className="text-center text-stone-700 py-6">
                    {showOnlyMissing ? "Tudo coberto pelo estoque" : "Nenhum componente previsto"}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
//                          CATÁLOGO (referência)
// =====================================================================
function CatalogView() {
  const [expanded, setExpanded] = useState({});
  const families = useMemo(() => {
    const out = {};
    Object.entries(PRODUCT_CATALOG).forEach(([k, p]) => {
      out[p.family] = out[p.family] || [];
      out[p.family].push({ key: k, ...p });
    });
    return out;
  }, []);

  return (
    <div className="space-y-4">
      <div className="text-xs text-stone-500 max-w-3xl">
        Catálogo completo de produtos com fórmulas de corte e componentes (BOM). 
        L = largura, A = altura. Em centímetros para todas as famílias, exceto PH 25/PH 50, onde valores são em metros.
      </div>
      {Object.entries(families).map(([family, items]) => {
        const m = FAMILY_META[family];
        return (
          <div key={family} className="border border-stone-800 rounded-sm">
            <header className="px-4 py-3 border-b border-stone-800 bg-stone-900/40 flex items-center gap-3">
              <div
                className="w-6 h-6 rounded-sm flex items-center justify-center text-xs font-bold"
                style={{ background: m.color + "33", color: m.color, border: `1px solid ${m.color}66` }}
              >
                {m.icon}
              </div>
              <h3 className="text-sm font-mono uppercase tracking-wider text-stone-100">{m.label}</h3>
              <span className="text-[10px] text-stone-500 font-mono">{items.length} produto(s)</span>
            </header>
            <div>
              {items.map((p) => {
                const isOpen = expanded[p.key];
                return (
                  <div key={p.key} className="border-b border-stone-900 last:border-b-0">
                    <button
                      onClick={() => setExpanded({ ...expanded, [p.key]: !isOpen })}
                      className="w-full flex items-center gap-2 px-4 py-2 hover:bg-stone-900/40 text-left"
                    >
                      {isOpen ? <ChevronDown size={12} className="text-amber-500" /> : <ChevronRight size={12} className="text-stone-600" />}
                      <span className="text-sm text-stone-200 flex-1">{p.name}</span>
                      {p.tube && p.tube !== "—" && <span className="text-[10px] text-stone-500 font-mono">∅{p.tube}</span>}
                    </button>
                    {isOpen && (
                      <div className="px-8 py-3 bg-stone-950/60 grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Fórmulas de Corte</div>
                          <ul className="space-y-0.5 font-mono">
                            {p.cuts.map((c, i) => {
                              const sample = c.fn(100, 200);
                              const example = Number.isFinite(sample) ? sample : 0;
                              return (
                                <li key={i} className="text-stone-300 text-[11px]">
                                  <span className="text-amber-400">▸</span> {c.name}
                                  <span className="text-stone-600 ml-1">[{c.dim}]</span>
                                </li>
                              );
                            })}
                          </ul>
                        </div>
                        <div>
                          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mb-1">Componentes (BOM)</div>
                          <ul className="space-y-0.5 font-mono">
                            {p.components.map((c, i) => (
                              <li key={i} className="text-stone-300 text-[11px]">
                                <span className="text-amber-400">▸</span> {c.name}
                                <span className="text-stone-600 ml-1">×{c.qtyFn ? "var." : c.qty}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// =====================================================================
//                          LISTA DE PEDIDOS
// =====================================================================
function OrderList({ orders, onOpen, onNew }) {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("ALL");

  const filtered = orders
    .filter((o) => {
      if (statusFilter !== "ALL" && o.status !== statusFilter) return false;
      if (search) {
        const s = search.toLowerCase();
        return o.orderNumber.toLowerCase().includes(s) || o.client?.toLowerCase().includes(s);
      }
      return true;
    })
    .sort((a, b) => {
      // urgentes primeiro, depois por data
      const pa = ["urgente", "alta", "normal", "baixa"].indexOf(a.priority);
      const pb = ["urgente", "alta", "normal", "baixa"].indexOf(b.priority);
      if (pa !== pb) return pa - pb;
      return (a.deliveryDate || "9999").localeCompare(b.deliveryDate || "9999");
    });

  return (
    <div>
      <header className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="relative">
            <Search size={12} className="absolute left-2.5 top-2.5 text-stone-600" />
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar pedido ou cliente..."
              className="bg-stone-950 border border-stone-800 rounded-sm pl-7 pr-3 py-1.5 text-xs text-stone-100 focus:outline-none focus:border-amber-500/60 w-64"
            />
          </div>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="bg-stone-950 border border-stone-800 rounded-sm px-2 py-1.5 text-xs font-mono text-stone-100 focus:outline-none focus:border-amber-500/60"
          >
            <option value="ALL">Todos os Status</option>
            {Object.entries(STATUS_META).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <button onClick={onNew} className="flex items-center gap-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-stone-950 font-mono text-xs uppercase tracking-wider transition">
          <Plus size={12} /> Novo Pedido
        </button>
      </header>

      {filtered.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-stone-800 rounded-sm">
          <FileText size={32} className="mx-auto text-stone-700 mb-3" />
          <p className="text-sm text-stone-500 mb-1">Nenhum pedido encontrado</p>
          <p className="text-xs text-stone-600">Clique em "Novo Pedido" para começar</p>
        </div>
      ) : (
        <div className="border border-stone-800 rounded-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800 bg-stone-900/40">
                <th className="text-left py-2 px-3">Nº Pedido</th>
                <th className="text-left py-2 px-3">Cliente</th>
                <th className="text-center py-2 px-3">Status</th>
                <th className="text-center py-2 px-3">Prioridade</th>
                <th className="text-center py-2 px-3">Peças</th>
                <th className="text-center py-2 px-3">Aberto</th>
                <th className="text-center py-2 px-3">Entrega</th>
                <th className="text-right py-2 px-3"></th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {filtered.map((o) => {
                const totalPecas = o.pieces.reduce((s, p) => s + (parseInt(p.quantidade) || 0), 0);
                const isLate = o.deliveryDate && o.deliveryDate < today() && !["expedido", "cancelado"].includes(o.status);
                return (
                  <tr key={o.id} className="border-b border-stone-900 hover:bg-stone-900/40 cursor-pointer" onClick={() => onOpen(o)}>
                    <td className="py-2 px-3 text-amber-400 font-semibold">#{o.orderNumber}</td>
                    <td className="py-2 px-3 text-stone-200">{o.client || <span className="text-stone-600">—</span>}</td>
                    <td className="text-center py-2 px-3"><StatusBadge status={o.status} /></td>
                    <td className="text-center py-2 px-3">
                      <Badge color={PRIORITY_META[o.priority]?.color || "#606060"}>
                        {PRIORITY_META[o.priority]?.label || o.priority}
                      </Badge>
                    </td>
                    <td className="text-center py-2 px-3 text-stone-300 tabular-nums">{totalPecas}</td>
                    <td className="text-center py-2 px-3 text-stone-500 text-[10px]">{o.date}</td>
                    <td className={`text-center py-2 px-3 text-[10px] ${isLate ? "text-red-400 font-semibold" : "text-stone-500"}`}>
                      {o.deliveryDate || "—"} {isLate && <AlertTriangle size={10} className="inline ml-1" />}
                    </td>
                    <td className="text-right py-2 px-3"><ChevronRight size={12} className="text-stone-600 inline" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// =====================================================================
//                          ESTOQUE
// =====================================================================
function EstoqueView({ estoque, skuMap, onSave, onDelete, onMovimento, orders }) {
  const [search, setSearch] = useState("");
  const [filterCat, setFilterCat] = useState("");
  const [editing, setEditing] = useState(null); // null | "new" | item
  const [movItem, setMovItem] = useState(null); // item para entrada/saída

  // Auto-popular sugestões a partir do catálogo
  const sugestoes = useMemo(() => {
    const all = new Set();
    Object.values(PRODUCT_CATALOG).forEach((p) => {
      (p.components || []).forEach((c) => all.add(c.name));
      (p.cuts || []).forEach((c) => all.add(c.name));
    });
    return Array.from(all).sort();
  }, []);

  const lista = useMemo(() => {
    return Object.values(estoque || {}).filter((it) => {
      if (filterCat && it.categoria !== filterCat) return false;
      if (search && !it.nome.toLowerCase().includes(search.toLowerCase()) && !it.sku.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    }).sort((a, b) => a.nome.localeCompare(b.nome));
  }, [estoque, search, filterCat]);

  // Demanda atual (para mostrar criticidade)
  const demanda = useMemo(() => {
    const map = new Map();
    const pieces = (orders || []).filter((o) => ["pendente", "cortando", "montando"].includes(o.status))
      .flatMap((o) => o.pieces);
    consolidateComponents(pieces).forEach((c) => {
      const sku = skuMap?.[c.name] || autoSku(c.name);
      map.set(sku, (map.get(sku) || 0) + Math.ceil(c.total));
    });
    consolidateCuts(pieces).forEach((c) => {
      const sku = skuMap?.[c.name] || autoSku(c.name);
      map.set(sku, (map.get(sku) || 0) + c.bars6m);
    });
    return map;
  }, [orders, skuMap]);

  const totais = useMemo(() => {
    const items = Object.values(estoque || {});
    return {
      itens: items.length,
      valorTotal: items.reduce((s, i) => s + (i.saldo * (i.custoUnit || 0)), 0),
      abaixoMin: items.filter((i) => i.saldo < (i.minimo || 0)).length,
      zerados: items.filter((i) => i.saldo === 0).length,
    };
  }, [estoque]);

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pb-3 border-b border-stone-800">
        <div>
          <h2 className="text-xl font-bold text-stone-100" style={{ fontFamily: "'Galano Grotesque', 'Manrope', sans-serif" }}>Estoque de Componentes</h2>
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mt-1">
            Cadastro de itens, saldo, estoque mínimo e ponto de reposição
          </div>
        </div>
        <button onClick={() => setEditing("new")} className="flex items-center gap-2 bg-amber-500 text-stone-950 px-3 py-1.5 text-xs font-mono uppercase tracking-wider hover:bg-amber-400">
          <Plus size={13} /> Novo Item
        </button>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <div className="border border-stone-800 p-3 rounded-sm bg-stone-950">
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Itens cadastrados</div>
          <div className="text-2xl font-bold text-stone-100 tabular-nums">{totais.itens}</div>
        </div>
        <div className="border border-stone-800 p-3 rounded-sm bg-stone-950">
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Valor em estoque</div>
          <div className="text-2xl font-bold text-emerald-400 tabular-nums">R$ {fmt(totais.valorTotal, 2)}</div>
        </div>
        <div className="border border-stone-800 p-3 rounded-sm bg-stone-950">
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Abaixo do mínimo</div>
          <div className="text-2xl font-bold text-amber-400 tabular-nums">{totais.abaixoMin}</div>
        </div>
        <div className="border border-stone-800 p-3 rounded-sm bg-stone-950">
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Itens zerados</div>
          <div className="text-2xl font-bold text-red-400 tabular-nums">{totais.zerados}</div>
        </div>
      </div>

      <div className="flex gap-2 flex-wrap">
        <div className="flex items-center gap-2 border border-stone-800 px-2 rounded-sm bg-stone-950 flex-1 max-w-md">
          <Search size={12} className="text-stone-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome ou SKU..."
            className="flex-1 bg-transparent border-0 outline-none text-xs font-mono py-2 text-stone-100 placeholder-stone-600"
          />
        </div>
        <select
          value={filterCat}
          onChange={(e) => setFilterCat(e.target.value)}
          className="bg-stone-900 border border-stone-800 px-2 py-1.5 text-xs font-mono text-stone-200 outline-none"
        >
          <option value="">Todas as categorias</option>
          {CATEGORIAS_ESTOQUE.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
      </div>

      <div className="border border-stone-800 rounded-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-stone-900/40">
            <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
              <th className="text-left py-2 px-3">SKU</th>
              <th className="text-left py-2 px-3">Item</th>
              <th className="text-left py-2 px-3">Categoria</th>
              <th className="text-right py-2 px-3">Saldo</th>
              <th className="text-right py-2 px-3">Mín.</th>
              <th className="text-right py-2 px-3">Repor</th>
              <th className="text-right py-2 px-3">Demanda</th>
              <th className="text-right py-2 px-3">R$ Unit</th>
              <th className="text-center py-2 px-3 w-32">Ações</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {lista.map((it) => {
              const dem = demanda.get(it.sku) || 0;
              const liquido = it.saldo - dem;
              const critico = liquido < (it.minimo || 0);
              return (
                <tr key={it.sku} className={`border-b border-stone-900 hover:bg-stone-900/40 ${critico ? "bg-red-950/10" : ""}`}>
                  <td className="py-2 px-3 text-stone-500 text-[10px]">{it.sku}</td>
                  <td className="py-2 px-3 text-stone-200">{it.nome}</td>
                  <td className="py-2 px-3 text-stone-500 text-[10px]">{it.categoria}</td>
                  <td className={`py-2 px-3 text-right tabular-nums font-semibold ${it.saldo === 0 ? "text-red-400" : it.saldo < (it.minimo || 0) ? "text-amber-400" : "text-stone-100"}`}>
                    {it.saldo}
                  </td>
                  <td className="py-2 px-3 text-right text-stone-500 tabular-nums">{it.minimo || 0}</td>
                  <td className="py-2 px-3 text-right text-stone-500 tabular-nums">{it.reposicao || 0}</td>
                  <td className={`py-2 px-3 text-right tabular-nums ${dem > 0 ? "text-amber-400" : "text-stone-700"}`}>{dem}</td>
                  <td className="py-2 px-3 text-right text-emerald-500/80 tabular-nums">{it.custoUnit ? fmt(it.custoUnit, 2) : "—"}</td>
                  <td className="py-2 px-3">
                    <div className="flex items-center justify-center gap-1">
                      <button onClick={() => setMovItem({ ...it, tipo: "entrada" })} title="Entrada" className="p-1 text-emerald-500 hover:bg-stone-800 rounded-sm">
                        <ArrowDownToLine size={12} />
                      </button>
                      <button onClick={() => setMovItem({ ...it, tipo: "saida" })} title="Saída" className="p-1 text-red-400 hover:bg-stone-800 rounded-sm">
                        <ArrowUpFromLine size={12} />
                      </button>
                      <button onClick={() => setEditing(it)} title="Editar" className="p-1 text-stone-400 hover:bg-stone-800 rounded-sm">
                        <Edit3 size={12} />
                      </button>
                      <button onClick={() => { if (confirm("Excluir item do estoque?")) onDelete(it.sku); }} title="Excluir" className="p-1 text-red-400 hover:bg-stone-800 rounded-sm">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {lista.length === 0 && (
              <tr><td colSpan={9} className="text-center text-stone-700 py-8">
                Nenhum item cadastrado. Clique em "Novo Item" para começar.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      {editing && <EstoqueForm item={editing === "new" ? null : editing} sugestoes={sugestoes} onSave={(it) => { onSave(it); setEditing(null); }} onCancel={() => setEditing(null)} />}
      {movItem && <MovimentoForm item={movItem} onConfirm={(qtd, motivo) => { onMovimento(movItem, movItem.tipo, qtd, motivo); setMovItem(null); }} onCancel={() => setMovItem(null)} />}
    </div>
  );
}

function EstoqueForm({ item, sugestoes, onSave, onCancel }) {
  const [data, setData] = useState({
    sku: item?.sku || "",
    nome: item?.nome || "",
    categoria: item?.categoria || CATEGORIAS_ESTOQUE[0],
    saldo: item?.saldo ?? 0,
    minimo: item?.minimo ?? 0,
    reposicao: item?.reposicao ?? 0,
    custoUnit: item?.custoUnit ?? 0,
    fornecedor: item?.fornecedor || "",
    unidade: item?.unidade || "un",
  });

  const handleNomeChange = (nome) => {
    setData((d) => ({ ...d, nome, sku: d.sku || autoSku(nome) }));
  };

  const handleSubmit = () => {
    if (!data.nome.trim()) return alert("Informe o nome do item.");
    if (!data.sku.trim()) return alert("Informe o SKU.");
    onSave({ ...data, saldo: Number(data.saldo) || 0, minimo: Number(data.minimo) || 0, reposicao: Number(data.reposicao) || 0, custoUnit: Number(data.custoUnit) || 0 });
  };

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-sm w-full max-w-2xl">
        <header className="px-4 py-3 border-b border-stone-800 flex items-center justify-between">
          <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200">
            {item ? "Editar Item" : "Novo Item de Estoque"}
          </h3>
          <button onClick={onCancel} className="text-stone-500 hover:text-stone-200"><X size={14} /></button>
        </header>
        <div className="p-4 grid grid-cols-2 gap-3 text-xs font-mono">
          <div className="col-span-2">
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Nome do item</label>
            <input
              type="text"
              list="sugestoes-estoque"
              value={data.nome}
              onChange={(e) => handleNomeChange(e.target.value)}
              disabled={!!item}
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-stone-100 outline-none focus:border-amber-500/60 disabled:opacity-60"
            />
            <datalist id="sugestoes-estoque">
              {sugestoes.map((s) => <option key={s} value={s} />)}
            </datalist>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">SKU</label>
            <input type="text" value={data.sku} onChange={(e) => setData({ ...data, sku: e.target.value.toUpperCase() })} disabled={!!item}
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-amber-400 outline-none focus:border-amber-500/60 disabled:opacity-60" />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Categoria</label>
            <select value={data.categoria} onChange={(e) => setData({ ...data, categoria: e.target.value })} className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-stone-100 outline-none focus:border-amber-500/60">
              {CATEGORIAS_ESTOQUE.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Saldo atual</label>
            <input type="number" min="0" step="1" value={data.saldo} onChange={(e) => setData({ ...data, saldo: e.target.value })}
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-stone-100 outline-none focus:border-amber-500/60 tabular-nums" />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Unidade</label>
            <select value={data.unidade} onChange={(e) => setData({ ...data, unidade: e.target.value })} className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-stone-100 outline-none focus:border-amber-500/60">
              <option value="un">un (unidade)</option>
              <option value="barra">barra (6m)</option>
              <option value="m">m (metro)</option>
              <option value="m2">m² (metro²)</option>
              <option value="kg">kg</option>
              <option value="pct">pct (pacote)</option>
            </select>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Estoque mínimo</label>
            <input type="number" min="0" step="1" value={data.minimo} onChange={(e) => setData({ ...data, minimo: e.target.value })}
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-stone-100 outline-none focus:border-amber-500/60 tabular-nums" />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Ponto de reposição</label>
            <input type="number" min="0" step="1" value={data.reposicao} onChange={(e) => setData({ ...data, reposicao: e.target.value })}
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-stone-100 outline-none focus:border-amber-500/60 tabular-nums" />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Custo unitário (R$)</label>
            <input type="number" min="0" step="0.01" value={data.custoUnit} onChange={(e) => setData({ ...data, custoUnit: e.target.value })}
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-emerald-400 outline-none focus:border-amber-500/60 tabular-nums" />
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Fornecedor</label>
            <input type="text" value={data.fornecedor} onChange={(e) => setData({ ...data, fornecedor: e.target.value })}
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-stone-100 outline-none focus:border-amber-500/60" />
          </div>
        </div>
        <footer className="px-4 py-3 border-t border-stone-800 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-stone-800 text-stone-400 hover:bg-stone-900">Cancelar</button>
          <button onClick={handleSubmit} className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-amber-500 text-stone-950 hover:bg-amber-400 flex items-center gap-1.5">
            <Save size={12} /> Salvar
          </button>
        </footer>
      </div>
    </div>
  );
}

function MovimentoForm({ item, onConfirm, onCancel }) {
  const [qtd, setQtd] = useState("");
  const [motivo, setMotivo] = useState("");
  const tipo = item.tipo;
  const isEntrada = tipo === "entrada";

  return (
    <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4">
      <div className="bg-stone-950 border border-stone-800 rounded-sm w-full max-w-md">
        <header className={`px-4 py-3 border-b border-stone-800 flex items-center gap-2 ${isEntrada ? "bg-emerald-950/20" : "bg-red-950/20"}`}>
          {isEntrada ? <ArrowDownToLine size={14} className="text-emerald-400" /> : <ArrowUpFromLine size={14} className="text-red-400" />}
          <h3 className="text-sm font-mono uppercase tracking-wider text-stone-200">
            {isEntrada ? "Entrada" : "Saída"} de Estoque
          </h3>
        </header>
        <div className="p-4 space-y-3 text-xs font-mono">
          <div className="text-stone-400">
            <div className="text-stone-100">{item.nome}</div>
            <div className="text-[10px] text-stone-500">SKU {item.sku} · Saldo atual: <span className="text-amber-400">{item.saldo}</span> {item.unidade}</div>
          </div>
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Quantidade</label>
            <input type="number" min="1" step="1" value={qtd} onChange={(e) => setQtd(e.target.value)} autoFocus
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-stone-100 outline-none focus:border-amber-500/60 tabular-nums" />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Motivo / observação</label>
            <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder={isEntrada ? "NF 12345, Fornecedor X..." : "Consumo OP #123, perda..."}
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-stone-100 outline-none focus:border-amber-500/60" />
          </div>
          {!isEntrada && Number(qtd) > item.saldo && (
            <div className="text-[10px] text-red-400 flex items-center gap-1">
              <AlertTriangle size={11} /> Quantidade maior que o saldo — saldo ficará negativo.
            </div>
          )}
        </div>
        <footer className="px-4 py-3 border-t border-stone-800 flex justify-end gap-2">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-stone-800 text-stone-400 hover:bg-stone-900">Cancelar</button>
          <button
            onClick={() => { const q = Number(qtd); if (!(q > 0)) return alert("Informe uma quantidade válida."); onConfirm(q, motivo); }}
            className={`px-3 py-1.5 text-xs font-mono uppercase tracking-wider text-stone-950 ${isEntrada ? "bg-emerald-500 hover:bg-emerald-400" : "bg-red-500 hover:bg-red-400"}`}
          >
            Confirmar
          </button>
        </footer>
      </div>
    </div>
  );
}

// =====================================================================
//                          APONTAMENTO DE PRODUÇÃO
// =====================================================================
function ApontamentoView({ orders, onSave }) {
  const [operador, setOperador] = useState(() => {
    try { return localStorage.getItem("op_atual") || ""; } catch { return ""; }
  });
  const [etapa, setEtapa] = useState("corte");
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [running, setRunning] = useState(null); // { pedidoId, peca, etapa, inicio }
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    try { if (operador) localStorage.setItem("op_atual", operador); } catch {}
  }, [operador]);

  const elegiveis = orders.filter((o) => {
    if (etapa === "corte") return ["pendente", "cortando"].includes(o.status);
    if (etapa === "montagem") return ["cortando", "montando"].includes(o.status);
    if (etapa === "expedicao") return ["pronto"].includes(o.status);
    return false;
  });

  const startTimer = (order, pecaIdx) => {
    if (!operador.trim()) return alert("Identifique o operador primeiro.");
    setRunning({
      id: uid(),
      pedidoId: order.id,
      pedidoNumber: order.orderNumber,
      pecaIdx,
      peca: order.pieces[pecaIdx],
      etapa,
      operador,
      inicio: new Date().toISOString(),
    });
  };

  const stopTimer = async (qtdOk, qtdRefugo, motivoRefugo) => {
    if (!running) return;
    const fim = new Date().toISOString();
    const apont = {
      id: running.id,
      pedidoId: running.pedidoId,
      pedidoNumber: running.pedidoNumber,
      pecaIdx: running.pecaIdx,
      productKey: running.peca.productKey,
      etapa: running.etapa,
      operador: running.operador,
      inicio: running.inicio,
      fim,
      duracaoSeg: Math.round((new Date(fim) - new Date(running.inicio)) / 1000),
      qtdOk: Number(qtdOk) || 0,
      qtdRefugo: Number(qtdRefugo) || 0,
      motivoRefugo: motivoRefugo || "",
    };
    await onSave(apont);
    setRunning(null);
  };

  const elapsed = running ? Math.floor((now - new Date(running.inicio).getTime()) / 1000) : 0;
  const formatElapsed = (s) => {
    const h = Math.floor(s / 3600); const m = Math.floor((s % 3600) / 60); const r = s % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
  };

  return (
    <div className="space-y-5">
      <header className="pb-3 border-b border-stone-800">
        <h2 className="text-xl font-bold text-stone-100" style={{ fontFamily: "'Galano Grotesque', 'Manrope', sans-serif" }}>Apontamento de Produção</h2>
        <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mt-1">
          Registro de início/fim por peça — alimenta indicadores de OEE e tempo-padrão
        </div>
      </header>

      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="block text-[10px] uppercase text-stone-500 mb-1 font-mono">Operador</label>
          <input type="text" value={operador} onChange={(e) => setOperador(e.target.value)}
            placeholder="Seu nome ou matrícula"
            className="w-full bg-stone-900 border border-stone-800 px-2 py-2 text-sm font-mono text-stone-100 outline-none focus:border-amber-500/60" />
        </div>
        <div>
          <label className="block text-[10px] uppercase text-stone-500 mb-1 font-mono">Etapa</label>
          <select value={etapa} onChange={(e) => setEtapa(e.target.value)} className="w-full bg-stone-900 border border-stone-800 px-2 py-2 text-sm font-mono text-stone-100 outline-none focus:border-amber-500/60">
            <option value="corte">Corte</option>
            <option value="montagem">Montagem</option>
            <option value="expedicao">Expedição</option>
          </select>
        </div>
        <div className="border border-stone-800 rounded-sm bg-stone-900/40 p-3 text-center">
          <div className="text-[9px] uppercase text-stone-500 font-mono tracking-wider">Pedidos disponíveis</div>
          <div className="text-2xl font-bold text-amber-400 tabular-nums">{elegiveis.length}</div>
        </div>
      </div>

      {running ? (
        <RunningTimer running={running} elapsed={elapsed} format={formatElapsed} onStop={stopTimer} onCancel={() => setRunning(null)} />
      ) : (
        <div className="border border-stone-800 rounded-sm">
          <header className="px-4 py-2.5 border-b border-stone-800 bg-stone-900/40">
            <h3 className="text-xs font-mono uppercase tracking-wider text-stone-300">
              Selecione um pedido para iniciar — etapa: <span className="text-amber-400">{etapa}</span>
            </h3>
          </header>
          <div className="max-h-[55vh] overflow-y-auto">
            {elegiveis.length === 0 ? (
              <div className="text-center text-stone-600 py-10 text-xs font-mono">
                Nenhum pedido disponível para esta etapa.
              </div>
            ) : (
              elegiveis.map((o) => (
                <div key={o.id} className="border-b border-stone-900 px-4 py-3 hover:bg-stone-900/30">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-3">
                      <span className="text-xs font-mono text-amber-400">#{o.orderNumber}</span>
                      <span className="text-xs text-stone-200">{o.client}</span>
                      <StatusBadge status={o.status} />
                    </div>
                    <span className="text-[10px] font-mono text-stone-500">{o.pieces.length} peça(s)</span>
                  </div>
                  <div className="space-y-1">
                    {o.pieces.map((p, idx) => {
                      const prod = PRODUCT_CATALOG[p.productKey];
                      return (
                        <div key={idx} className="flex items-center justify-between text-[11px] font-mono py-1 hover:bg-stone-900/40 rounded-sm">
                          <div className="flex items-center gap-2">
                            <span className="text-stone-500">P{idx + 1}</span>
                            <span className="text-stone-300">{prod?.name || p.productKey}</span>
                            <span className="text-stone-600">{p.largura}×{p.altura} cm · {p.quantidade}×</span>
                            {p.ambiente && <span className="text-stone-700">({p.ambiente})</span>}
                          </div>
                          <button
                            onClick={() => startTimer(o, idx)}
                            className="flex items-center gap-1 px-2 py-1 text-[10px] font-mono uppercase tracking-wider bg-emerald-600/20 text-emerald-400 border border-emerald-600/40 hover:bg-emerald-600/30"
                          >
                            <Play size={10} /> Iniciar
                          </button>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function RunningTimer({ running, elapsed, format, onStop, onCancel }) {
  const [qtdOk, setQtdOk] = useState(running.peca.quantidade);
  const [qtdRefugo, setQtdRefugo] = useState(0);
  const [motivo, setMotivo] = useState("");
  const prod = PRODUCT_CATALOG[running.peca.productKey];

  return (
    <div className="border-2 border-amber-500/60 bg-stone-950 rounded-sm p-6">
      <div className="text-center mb-4">
        <div className="text-[10px] uppercase tracking-wider text-amber-500/80 font-mono mb-1">Em execução · etapa {running.etapa}</div>
        <div className="text-6xl font-bold text-amber-400 tabular-nums" style={{ fontFamily: "'JetBrains Mono', monospace" }}>{format(elapsed)}</div>
        <div className="text-[10px] text-stone-500 font-mono mt-2">
          Operador: <span className="text-stone-300">{running.operador}</span> · Pedido <span className="text-amber-400">#{running.pedidoNumber}</span>
        </div>
      </div>
      <div className="border-t border-stone-800 pt-4 mt-4">
        <div className="text-xs font-mono text-stone-300 mb-3">
          {prod?.name} · {running.peca.largura}×{running.peca.altura} cm · {running.peca.quantidade} peça(s)
        </div>
        <div className="grid grid-cols-3 gap-3 text-xs font-mono">
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Peças OK</label>
            <input type="number" min="0" value={qtdOk} onChange={(e) => setQtdOk(e.target.value)}
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-emerald-400 outline-none tabular-nums" />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Refugo</label>
            <input type="number" min="0" value={qtdRefugo} onChange={(e) => setQtdRefugo(e.target.value)}
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-red-400 outline-none tabular-nums" />
          </div>
          <div>
            <label className="block text-[10px] uppercase text-stone-500 mb-1">Motivo (se refugo)</label>
            <input type="text" value={motivo} onChange={(e) => setMotivo(e.target.value)}
              placeholder="Medida errada, defeito..."
              className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-stone-100 outline-none" />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-stone-800 text-stone-400 hover:bg-stone-900">Cancelar</button>
          <button onClick={() => onStop(qtdOk, qtdRefugo, motivo)} className="px-4 py-1.5 text-xs font-mono uppercase tracking-wider bg-emerald-500 text-stone-950 hover:bg-emerald-400 flex items-center gap-1.5">
            <Square size={11} /> Finalizar
          </button>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
//                          INDICADORES (KPIs)
// =====================================================================
function IndicadoresView({ orders, apontamentos, config }) {
  // OTIF — % pedidos expedidos no prazo (data fim <= data prometida)
  const otif = useMemo(() => {
    const expedidos = orders.filter((o) => o.status === "expedido" && o.dataExpedicao && o.deliveryDate);
    if (!expedidos.length) return { pct: null, total: 0, no_prazo: 0 };
    const noprazo = expedidos.filter((o) => o.dataExpedicao <= o.deliveryDate).length;
    return { pct: (noprazo / expedidos.length) * 100, total: expedidos.length, no_prazo: noprazo };
  }, [orders]);

  // Lead time real médio (criação → expedição)
  const leadTimeReal = useMemo(() => {
    const finalizados = orders.filter((o) => o.status === "expedido" && o.dataExpedicao && o.createdAt);
    if (!finalizados.length) return null;
    const total = finalizados.reduce((s, o) => s + daysBetween(o.createdAt.slice(0, 10), o.dataExpedicao), 0);
    return total / finalizados.length;
  }, [orders]);

  // OEE simplificado — qualidade (peças OK / total) × eficiência (tempo padrão / tempo real)
  const oee = useMemo(() => {
    const apList = Object.values(apontamentos || {});
    if (!apList.length) return null;
    const totalOk = apList.reduce((s, a) => s + (a.qtdOk || 0), 0);
    const totalRef = apList.reduce((s, a) => s + (a.qtdRefugo || 0), 0);
    const totalSeg = apList.reduce((s, a) => s + (a.duracaoSeg || 0), 0);
    const qualidade = (totalOk + totalRef) > 0 ? totalOk / (totalOk + totalRef) : 1;

    // Tempo padrão total esperado vs real
    let tempoPadraoSeg = 0;
    apList.forEach((a) => {
      const prod = PRODUCT_CATALOG[a.productKey];
      const fam = prod?.family;
      const tp = (config?.tempos?.[fam] || DEFAULT_TEMPOS[fam] || { corte: 10, montagem: 20, expedicao: 5 });
      const min = tp[a.etapa] || 10;
      tempoPadraoSeg += min * 60 * ((a.qtdOk || 0) + (a.qtdRefugo || 0));
    });
    const eficiencia = totalSeg > 0 ? Math.min(1.5, tempoPadraoSeg / totalSeg) : 1;
    const disponibilidade = 0.85; // placeholder — só com apontamento de paradas para ser exato
    const oeePct = disponibilidade * eficiencia * qualidade * 100;
    return { qualidade: qualidade * 100, eficiencia: eficiencia * 100, disponibilidade: disponibilidade * 100, oee: oeePct, apontamentos: apList.length };
  }, [apontamentos, config]);

  // Curva ABC de produtos por demanda (peças produzidas)
  const abc = useMemo(() => {
    const pieces = orders.flatMap((o) => o.pieces);
    const map = new Map();
    pieces.forEach((p) => {
      const prod = PRODUCT_CATALOG[p.productKey];
      if (!prod) return;
      const cur = map.get(p.productKey) || { key: p.productKey, name: prod.name, family: prod.family, qtd: 0 };
      cur.qtd += Number(p.quantidade) || 0;
      map.set(p.productKey, cur);
    });
    const items = Array.from(map.values()).filter((i) => i.qtd > 0);
    const cls = classificarABC(items, (it) => it.qtd);
    return items.map((it) => ({ ...it, classe: cls.get(it) })).sort((a, b) => b.qtd - a.qtd);
  }, [orders]);

  // Aderência ao plano — % peças apontadas na semana vs planejadas
  const aderencia = useMemo(() => {
    const { inicio, fim } = semanaAtual();
    const semanaApont = Object.values(apontamentos || {}).filter((a) => a.fim && a.fim.slice(0, 10) >= inicio && a.fim.slice(0, 10) <= fim);
    const qtdReal = semanaApont.reduce((s, a) => s + (a.qtdOk || 0), 0);
    // Planejado: peças com entrega na semana
    const planejado = orders
      .filter((o) => o.deliveryDate && o.deliveryDate >= inicio && o.deliveryDate <= fim)
      .flatMap((o) => o.pieces)
      .reduce((s, p) => s + (Number(p.quantidade) || 0), 0);
    return {
      planejado,
      realizado: qtdReal,
      pct: planejado > 0 ? (qtdReal / planejado) * 100 : null,
      inicio, fim,
    };
  }, [orders, apontamentos]);

  // Top motivos de refugo
  const refugos = useMemo(() => {
    const map = new Map();
    Object.values(apontamentos || {}).forEach((a) => {
      if ((a.qtdRefugo || 0) > 0 && a.motivoRefugo) {
        map.set(a.motivoRefugo, (map.get(a.motivoRefugo) || 0) + a.qtdRefugo);
      }
    });
    return Array.from(map.entries()).sort((a, b) => b[1] - a[1]).slice(0, 5);
  }, [apontamentos]);

  return (
    <div className="space-y-6">
      <header className="pb-3 border-b border-stone-800">
        <h2 className="text-xl font-bold text-stone-100" style={{ fontFamily: "'Galano Grotesque', 'Manrope', sans-serif" }}>Indicadores de PCP</h2>
        <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mt-1">
          OTIF · Lead Time Real · OEE · Aderência ao Plano · Curva ABC
        </div>
      </header>

      <div className="grid grid-cols-4 gap-3">
        <KpiCard
          icon={Target} label="OTIF"
          value={otif.pct !== null ? `${fmt(otif.pct, 1)}%` : "—"}
          sub={`${otif.no_prazo} / ${otif.total} pedidos no prazo`}
          color={otif.pct === null ? "#606060" : otif.pct >= 95 ? "#15803D" : otif.pct >= 80 ? "#B45309" : "#C1212D"}
        />
        <KpiCard
          icon={Clock} label="Lead Time Real"
          value={leadTimeReal !== null ? `${fmt(leadTimeReal, 1)} d` : "—"}
          sub="Criação → Expedição (média)"
          color="#1E40AF"
        />
        <KpiCard
          icon={Gauge} label="OEE"
          value={oee ? `${fmt(oee.oee, 1)}%` : "—"}
          sub={oee ? `Q ${fmt(oee.qualidade, 0)}% · E ${fmt(oee.eficiencia, 0)}% · D ${fmt(oee.disponibilidade, 0)}%` : "Sem apontamentos"}
          color={!oee ? "#606060" : oee.oee >= 75 ? "#15803D" : oee.oee >= 60 ? "#B45309" : "#C1212D"}
        />
        <KpiCard
          icon={FileCheck} label="Aderência Plano"
          value={aderencia.pct !== null ? `${fmt(aderencia.pct, 0)}%` : "—"}
          sub={`${aderencia.realizado} / ${aderencia.planejado} peças na semana`}
          color={aderencia.pct === null ? "#606060" : aderencia.pct >= 90 ? "#15803D" : aderencia.pct >= 70 ? "#B45309" : "#C1212D"}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Section title="Curva ABC — Produtos por demanda" icon={Award}>
          <div className="border border-stone-800 rounded-sm overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-stone-900/40">
                <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
                  <th className="text-center py-1.5 px-2 w-10">Cl.</th>
                  <th className="text-left py-1.5 px-2">Produto</th>
                  <th className="text-right py-1.5 px-2">Qtd</th>
                </tr>
              </thead>
              <tbody className="font-mono max-h-96">
                {abc.slice(0, 25).map((it, i) => (
                  <tr key={i} className="border-b border-stone-900">
                    <td className="text-center py-1.5">
                      <span className={`inline-block px-2 py-0.5 text-[10px] font-bold rounded-sm ${
                        it.classe === "A" ? "bg-emerald-500/20 text-emerald-400" :
                        it.classe === "B" ? "bg-amber-500/20 text-amber-400" :
                        "bg-stone-700/40 text-stone-400"
                      }`}>{it.classe}</span>
                    </td>
                    <td className="py-1.5 px-2 text-stone-300">{it.name}</td>
                    <td className="py-1.5 px-2 text-right text-amber-400 tabular-nums">{it.qtd}</td>
                  </tr>
                ))}
                {abc.length === 0 && (
                  <tr><td colSpan={3} className="text-center text-stone-700 py-6">Sem dados — cadastre pedidos com peças</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </Section>

        <Section title="Refugo — top motivos" icon={AlertTriangle}>
          <div className="border border-stone-800 rounded-sm p-4">
            {refugos.length === 0 ? (
              <div className="text-center text-stone-600 py-6 text-xs font-mono">Nenhum refugo registrado</div>
            ) : (
              <div className="space-y-2">
                {refugos.map(([motivo, qtd], i) => {
                  const total = refugos.reduce((s, r) => s + r[1], 0);
                  const pct = (qtd / total) * 100;
                  return (
                    <div key={i}>
                      <div className="flex justify-between text-xs font-mono mb-1">
                        <span className="text-stone-300">{motivo}</span>
                        <span className="text-red-400 tabular-nums">{qtd}</span>
                      </div>
                      <div className="h-2 bg-stone-900 rounded-sm overflow-hidden">
                        <div className="h-full bg-red-500/60" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </Section>
      </div>

      <Section title="Apontamentos recentes" icon={History}>
        <div className="border border-stone-800 rounded-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-stone-900/40">
              <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
                <th className="text-left py-1.5 px-2">Data</th>
                <th className="text-left py-1.5 px-2">Pedido</th>
                <th className="text-left py-1.5 px-2">Operador</th>
                <th className="text-left py-1.5 px-2">Etapa</th>
                <th className="text-right py-1.5 px-2">Duração</th>
                <th className="text-right py-1.5 px-2">OK</th>
                <th className="text-right py-1.5 px-2">Refugo</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {Object.values(apontamentos || {})
                .sort((a, b) => (b.fim || "").localeCompare(a.fim || ""))
                .slice(0, 15)
                .map((a) => (
                  <tr key={a.id} className="border-b border-stone-900 hover:bg-stone-900/40">
                    <td className="py-1.5 px-2 text-stone-400">{a.fim ? new Date(a.fim).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—"}</td>
                    <td className="py-1.5 px-2 text-amber-400">#{a.pedidoNumber}</td>
                    <td className="py-1.5 px-2 text-stone-300">{a.operador}</td>
                    <td className="py-1.5 px-2 text-stone-400">{a.etapa}</td>
                    <td className="py-1.5 px-2 text-right text-stone-300 tabular-nums">{Math.round((a.duracaoSeg || 0) / 60)} min</td>
                    <td className="py-1.5 px-2 text-right text-emerald-400 tabular-nums">{a.qtdOk}</td>
                    <td className="py-1.5 px-2 text-right text-red-400 tabular-nums">{a.qtdRefugo || 0}</td>
                  </tr>
                ))}
              {Object.keys(apontamentos || {}).length === 0 && (
                <tr><td colSpan={7} className="text-center text-stone-700 py-6">Nenhum apontamento registrado</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Section>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, sub, color }) {
  return (
    <div className="border border-stone-800 rounded-sm p-3 bg-stone-950">
      <div className="flex items-center gap-2 mb-2">
        <Icon size={12} style={{ color }} />
        <span className="text-[10px] font-mono uppercase tracking-wider text-stone-500">{label}</span>
      </div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{value}</div>
      <div className="text-[10px] font-mono text-stone-500 mt-1">{sub}</div>
    </div>
  );
}

// =====================================================================
//                          PLANO-MESTRE (S&OP semanal)
// =====================================================================
function PlanoMestreView({ orders, config }) {
  const [semanaOffset, setSemanaOffset] = useState(0); // 0 = corrente, 1 = próxima

  const semana = useMemo(() => {
    const { inicio } = semanaAtual();
    const d = new Date(inicio + "T12:00:00");
    d.setDate(d.getDate() + semanaOffset * 7);
    const seg = d.toISOString().slice(0, 10);
    const dom = new Date(d); dom.setDate(d.getDate() + 6);
    return { inicio: seg, fim: dom.toISOString().slice(0, 10) };
  }, [semanaOffset]);

  const dias = useMemo(() => {
    const list = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(semana.inicio + "T12:00:00");
      d.setDate(d.getDate() + i);
      list.push(d.toISOString().slice(0, 10));
    }
    return list;
  }, [semana]);

  // Capacidade vs carga por etapa, dia a dia
  const capacidade = config?.capacidade || DEFAULT_CAPACIDADE;
  const tempos = config?.tempos || DEFAULT_TEMPOS;

  const cargaPorDia = useMemo(() => {
    return dias.map((dia) => {
      const pedidosDoDia = orders.filter((o) =>
        ["pendente", "cortando", "montando"].includes(o.status) && o.deliveryDate === dia
      );
      let corteMin = 0, montMin = 0, expMin = 0;
      const pieces = pedidosDoDia.flatMap((o) => o.pieces);
      pieces.forEach((p) => {
        const prod = PRODUCT_CATALOG[p.productKey];
        const fam = prod?.family;
        const t = tempos[fam] || { corte: 10, montagem: 20, expedicao: 5 };
        const qtd = Number(p.quantidade) || 0;
        corteMin += t.corte * qtd;
        montMin += t.montagem * qtd;
        expMin += t.expedicao * qtd;
      });
      const dow = new Date(dia + "T12:00:00").getDay();
      const util = dow !== 0 && dow !== 6;
      return {
        dia,
        util,
        pedidos: pedidosDoDia.length,
        pecas: pieces.reduce((s, p) => s + (Number(p.quantidade) || 0), 0),
        corte: { carga: corteMin / 60, cap: util ? capacidade.corteHorasDia : 0 },
        mont: { carga: montMin / 60, cap: util ? capacidade.montagemHorasDia : 0 },
        exp: { carga: expMin / 60, cap: util ? capacidade.expedicaoHorasDia : 0 },
      };
    });
  }, [orders, dias, capacidade, tempos]);

  const totalSemana = useMemo(() => {
    return cargaPorDia.reduce((acc, d) => ({
      pedidos: acc.pedidos + d.pedidos,
      pecas: acc.pecas + d.pecas,
      corte: { carga: acc.corte.carga + d.corte.carga, cap: acc.corte.cap + d.corte.cap },
      mont: { carga: acc.mont.carga + d.mont.carga, cap: acc.mont.cap + d.mont.cap },
      exp: { carga: acc.exp.carga + d.exp.carga, cap: acc.exp.cap + d.exp.cap },
    }), { pedidos: 0, pecas: 0, corte: { carga: 0, cap: 0 }, mont: { carga: 0, cap: 0 }, exp: { carga: 0, cap: 0 } });
  }, [cargaPorDia]);

  const diaNome = (iso) => new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pb-3 border-b border-stone-800">
        <div>
          <h2 className="text-xl font-bold text-stone-100" style={{ fontFamily: "'Galano Grotesque', 'Manrope', sans-serif" }}>Plano-Mestre Semanal</h2>
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mt-1">
            Capacidade vs carga · S&OP simplificado
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setSemanaOffset((v) => v - 1)} className="p-1.5 border border-stone-800 text-stone-400 hover:bg-stone-900">
            <ChevronLeft size={12} />
          </button>
          <div className="text-xs font-mono text-stone-300 px-3">
            {semanaOffset === 0 ? "Semana atual" : semanaOffset === 1 ? "Próxima semana" : semanaOffset > 0 ? `+${semanaOffset} sem` : `${semanaOffset} sem`}
            <div className="text-[10px] text-stone-500">
              {new Date(semana.inicio + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })} – {new Date(semana.fim + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
            </div>
          </div>
          <button onClick={() => setSemanaOffset((v) => v + 1)} className="p-1.5 border border-stone-800 text-stone-400 hover:bg-stone-900">
            <ChevronRight size={12} />
          </button>
        </div>
      </header>

      <div className="grid grid-cols-5 gap-3">
        <div className="border border-stone-800 p-3 rounded-sm bg-stone-950">
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Pedidos na semana</div>
          <div className="text-2xl font-bold text-stone-100 tabular-nums">{totalSemana.pedidos}</div>
          <div className="text-[10px] font-mono text-stone-500">{totalSemana.pecas} peças</div>
        </div>
        <CapKpi label="Corte" carga={totalSemana.corte.carga} cap={totalSemana.corte.cap} />
        <CapKpi label="Montagem" carga={totalSemana.mont.carga} cap={totalSemana.mont.cap} />
        <CapKpi label="Expedição" carga={totalSemana.exp.carga} cap={totalSemana.exp.cap} />
        <div className="border border-stone-800 p-3 rounded-sm bg-stone-950">
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">Status geral</div>
          <div className="text-sm font-bold text-stone-100 mt-1">
            {(totalSemana.corte.carga > totalSemana.corte.cap || totalSemana.mont.carga > totalSemana.mont.cap)
              ? <span className="text-red-400">⚠ Sobrecarga</span>
              : <span className="text-emerald-400">✓ Dentro da capacidade</span>}
          </div>
        </div>
      </div>

      <div className="border border-stone-800 rounded-sm overflow-hidden">
        <table className="w-full text-xs">
          <thead className="bg-stone-900/40">
            <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
              <th className="text-left py-2 px-3">Dia</th>
              <th className="text-right py-2 px-3">Pedidos</th>
              <th className="text-right py-2 px-3">Peças</th>
              <th className="text-center py-2 px-3" colSpan={2}>Corte (h)</th>
              <th className="text-center py-2 px-3" colSpan={2}>Montagem (h)</th>
              <th className="text-center py-2 px-3" colSpan={2}>Expedição (h)</th>
            </tr>
          </thead>
          <tbody className="font-mono">
            {cargaPorDia.map((d) => {
              const sobrecarga = d.corte.carga > d.corte.cap || d.mont.carga > d.mont.cap;
              return (
                <tr key={d.dia} className={`border-b border-stone-900 ${d.util ? "" : "opacity-40"} ${sobrecarga ? "bg-red-950/10" : ""}`}>
                  <td className="py-2 px-3 text-stone-300">{diaNome(d.dia)}</td>
                  <td className="text-right py-2 px-3 tabular-nums text-stone-200">{d.pedidos}</td>
                  <td className="text-right py-2 px-3 tabular-nums text-stone-400">{d.pecas}</td>
                  <CapCell carga={d.corte.carga} cap={d.corte.cap} />
                  <CapCell carga={d.mont.carga} cap={d.mont.cap} />
                  <CapCell carga={d.exp.carga} cap={d.exp.cap} />
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="text-[10px] font-mono text-stone-600 px-1">
        Capacidade configurável em <span className="text-amber-500">Configurações</span>.
        Carga calculada com base nos tempos-padrão (min/peça) por família.
      </div>
    </div>
  );
}

function CapKpi({ label, carga, cap }) {
  const pct = cap > 0 ? (carga / cap) * 100 : 0;
  const color = pct > 100 ? "#C1212D" : pct > 85 ? "#B45309" : "#15803D";
  return (
    <div className="border border-stone-800 p-3 rounded-sm bg-stone-950">
      <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500">{label}</div>
      <div className="text-2xl font-bold tabular-nums" style={{ color }}>{fmt(carga, 1)}h</div>
      <div className="text-[10px] font-mono text-stone-500">/ {fmt(cap, 0)}h cap · {fmt(pct, 0)}%</div>
    </div>
  );
}

function CapCell({ carga, cap }) {
  const pct = cap > 0 ? (carga / cap) * 100 : (carga > 0 ? 999 : 0);
  const color = pct > 100 ? "text-red-400" : pct > 85 ? "text-amber-400" : "text-emerald-400";
  return (
    <>
      <td className={`text-right py-2 px-3 tabular-nums font-semibold ${color}`}>{fmt(carga, 1)}</td>
      <td className="text-right py-2 px-3 tabular-nums text-stone-600 pr-3">/ {fmt(cap, 0)}</td>
    </>
  );
}

// =====================================================================
//                          CONFIGURAÇÕES
// =====================================================================
function ConfigView({ config, onSave }) {
  const [tab, setTab] = useState("tempos");
  const [tempos, setTempos] = useState(() => config?.tempos || DEFAULT_TEMPOS);
  const [leadTimes, setLeadTimes] = useState(() => config?.leadTimes || DEFAULT_LEAD_TIMES);
  const [capacidade, setCapacidade] = useState(() => config?.capacidade || DEFAULT_CAPACIDADE);

  const saveAll = () => {
    onSave({ ...config, tempos, leadTimes, capacidade });
    alert("Configurações salvas.");
  };

  const resetDefaults = () => {
    if (!confirm("Restaurar valores-padrão?")) return;
    setTempos(DEFAULT_TEMPOS); setLeadTimes(DEFAULT_LEAD_TIMES); setCapacidade(DEFAULT_CAPACIDADE);
  };

  return (
    <div className="space-y-5">
      <header className="flex items-center justify-between pb-3 border-b border-stone-800">
        <div>
          <h2 className="text-xl font-bold text-stone-100" style={{ fontFamily: "'Galano Grotesque', 'Manrope', sans-serif" }}>Configurações</h2>
          <div className="text-[10px] font-mono uppercase tracking-wider text-stone-500 mt-1">
            Tempos-padrão · Lead times · Capacidade
          </div>
        </div>
        <div className="flex gap-2">
          <button onClick={resetDefaults} className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider border border-stone-800 text-stone-400 hover:bg-stone-900 flex items-center gap-1.5">
            <RotateCw size={11} /> Restaurar
          </button>
          <button onClick={saveAll} className="px-3 py-1.5 text-xs font-mono uppercase tracking-wider bg-amber-500 text-stone-950 hover:bg-amber-400 flex items-center gap-1.5">
            <Save size={11} /> Salvar
          </button>
        </div>
      </header>

      <div className="flex gap-1 border-b border-stone-800">
        {["tempos", "leadtimes", "capacidade"].map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-3 py-2 text-xs font-mono uppercase tracking-wider ${
              tab === t ? "border-b-2 border-amber-500 text-amber-400" : "text-stone-500 hover:text-stone-200"
            }`}>
            {t === "tempos" ? "Tempos-padrão" : t === "leadtimes" ? "Lead Times" : "Capacidade"}
          </button>
        ))}
      </div>

      {tab === "tempos" && (
        <div className="border border-stone-800 rounded-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-stone-900/40">
              <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
                <th className="text-left py-2 px-3">Família</th>
                <th className="text-right py-2 px-3">Corte (min/peça)</th>
                <th className="text-right py-2 px-3">Montagem (min/peça)</th>
                <th className="text-right py-2 px-3">Expedição (min/peça)</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(FAMILY_META).map(([fam, meta]) => {
                const t = tempos[fam] || { corte: 10, montagem: 20, expedicao: 5 };
                return (
                  <tr key={fam} className="border-b border-stone-900">
                    <td className="py-2 px-3"><FamilyChip family={fam} /></td>
                    <td className="py-2 px-3">
                      <input type="number" min="0" step="0.5" value={t.corte}
                        onChange={(e) => setTempos({ ...tempos, [fam]: { ...t, corte: Number(e.target.value) } })}
                        className="w-24 bg-stone-900 border border-stone-800 px-2 py-1 text-amber-400 text-right tabular-nums outline-none focus:border-amber-500/60 ml-auto block" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="number" min="0" step="0.5" value={t.montagem}
                        onChange={(e) => setTempos({ ...tempos, [fam]: { ...t, montagem: Number(e.target.value) } })}
                        className="w-24 bg-stone-900 border border-stone-800 px-2 py-1 text-amber-400 text-right tabular-nums outline-none focus:border-amber-500/60 ml-auto block" />
                    </td>
                    <td className="py-2 px-3">
                      <input type="number" min="0" step="0.5" value={t.expedicao}
                        onChange={(e) => setTempos({ ...tempos, [fam]: { ...t, expedicao: Number(e.target.value) } })}
                        className="w-24 bg-stone-900 border border-stone-800 px-2 py-1 text-amber-400 text-right tabular-nums outline-none focus:border-amber-500/60 ml-auto block" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === "leadtimes" && (
        <div className="border border-stone-800 rounded-sm overflow-hidden">
          <table className="w-full text-xs">
            <thead className="bg-stone-900/40">
              <tr className="text-[10px] font-mono uppercase tracking-wider text-stone-500 border-b border-stone-800">
                <th className="text-left py-2 px-3">Família</th>
                <th className="text-right py-2 px-3">Lead Time (dias úteis)</th>
              </tr>
            </thead>
            <tbody className="font-mono">
              {Object.entries(FAMILY_META).map(([fam]) => (
                <tr key={fam} className="border-b border-stone-900">
                  <td className="py-2 px-3"><FamilyChip family={fam} /></td>
                  <td className="py-2 px-3">
                    <input type="number" min="0" step="1" value={leadTimes[fam] ?? 7}
                      onChange={(e) => setLeadTimes({ ...leadTimes, [fam]: Number(e.target.value) })}
                      className="w-24 bg-stone-900 border border-stone-800 px-2 py-1 text-amber-400 text-right tabular-nums outline-none focus:border-amber-500/60 ml-auto block" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="px-3 py-2 text-[10px] font-mono text-stone-500 bg-stone-900/20 border-t border-stone-800">
            Usado para sugerir data de entrega ao cadastrar pedido (data hoje + lead time da família).
          </div>
        </div>
      )}

      {tab === "capacidade" && (
        <div className="border border-stone-800 rounded-sm p-4 max-w-md">
          <div className="space-y-3 text-xs font-mono">
            <div>
              <label className="block text-[10px] uppercase text-stone-500 mb-1">Corte (horas/dia)</label>
              <input type="number" min="0" step="0.5" value={capacidade.corteHorasDia}
                onChange={(e) => setCapacidade({ ...capacidade, corteHorasDia: Number(e.target.value) })}
                className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-amber-400 tabular-nums outline-none focus:border-amber-500/60" />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-stone-500 mb-1">Montagem (horas/dia)</label>
              <input type="number" min="0" step="0.5" value={capacidade.montagemHorasDia}
                onChange={(e) => setCapacidade({ ...capacidade, montagemHorasDia: Number(e.target.value) })}
                className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-amber-400 tabular-nums outline-none focus:border-amber-500/60" />
            </div>
            <div>
              <label className="block text-[10px] uppercase text-stone-500 mb-1">Expedição (horas/dia)</label>
              <input type="number" min="0" step="0.5" value={capacidade.expedicaoHorasDia}
                onChange={(e) => setCapacidade({ ...capacidade, expedicaoHorasDia: Number(e.target.value) })}
                className="w-full bg-stone-900 border border-stone-800 px-2 py-1.5 text-amber-400 tabular-nums outline-none focus:border-amber-500/60" />
            </div>
          </div>
          <div className="mt-3 text-[10px] font-mono text-stone-500">
            Inclua horas-homem de toda a equipe (ex.: 2 montadores × 8h = 16h/dia em montagem).
          </div>
        </div>
      )}
    </div>
  );
}

// =====================================================================
//                          DASHBOARD principal
// =====================================================================
export default function App({ currentUser = null, onLogout = () => {} }) {
  const [view, setView] = useState("pedidos");
  const [menuOpen, setMenuOpen] = useState(false);
  const [orders, setOrders] = useState([]);
  const [estoque, setEstoque] = useState({});       // sku -> item
  const [skuMap, setSkuMap] = useState({});         // nomeComponente -> sku
  const [apontamentos, setApontamentos] = useState({}); // id -> apontamento
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [editingOrder, setEditingOrder] = useState(null);
  const [viewingOrder, setViewingOrder] = useState(null);

  // ============ CARGAS ============
  const loadAll = useCallback(async () => {
    setLoading(true);
    // Pedidos
    const pedKeys = await storageList("pedido:");
    const pedList = [];
    for (const k of pedKeys) {
      const data = await storageGet(k);
      if (data) pedList.push(data);
    }
    setOrders(pedList.sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || "")));

    // Estoque
    const estKeys = await storageList("estoque:");
    const estObj = {};
    const map = {};
    for (const k of estKeys) {
      const data = await storageGet(k);
      if (data) {
        estObj[data.sku] = data;
        map[data.nome] = data.sku;
      }
    }
    setEstoque(estObj);
    setSkuMap(map);

    // Apontamentos
    const apKeys = await storageList("apontamento:");
    const apObj = {};
    for (const k of apKeys) {
      const data = await storageGet(k);
      if (data) apObj[data.id] = data;
    }
    setApontamentos(apObj);

    // Config
    const cfg = await storageGet("config:default");
    setConfig(cfg || { tempos: DEFAULT_TEMPOS, leadTimes: DEFAULT_LEAD_TIMES, capacidade: DEFAULT_CAPACIDADE });

    setLoading(false);
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ============ HANDLERS PEDIDOS ============
  const saveOrder = async (o) => {
    await storageSet(`pedido:${o.id}`, o);
    await loadAll();
    setEditingOrder(null);
    setViewingOrder(o);
  };

  const deleteOrder = async (id) => {
    if (!confirm("Excluir este pedido permanentemente?")) return;
    await storageDel(`pedido:${id}`);
    await loadAll();
    setViewingOrder(null);
    setEditingOrder(null);
  };

  const changeStatus = async (id, newStatus) => {
    const o = orders.find((x) => x.id === id);
    if (!o) return;
    const upd = { ...o, status: newStatus, updatedAt: new Date().toISOString() };
    // Marcar data de expedição quando passa a "expedido"
    if (newStatus === "expedido" && !o.dataExpedicao) {
      upd.dataExpedicao = today();
    }
    await storageSet(`pedido:${id}`, upd);
    await loadAll();
    if (viewingOrder?.id === id) setViewingOrder(upd);
  };

  // ============ HANDLERS ESTOQUE ============
  const saveEstoqueItem = async (item) => {
    await storageSet(`estoque:${item.sku}`, item);
    await loadAll();
  };

  const deleteEstoqueItem = async (sku) => {
    await storageDel(`estoque:${sku}`);
    await loadAll();
  };

  const registrarMovimento = async (item, tipo, qtd, motivo) => {
    const delta = tipo === "entrada" ? qtd : -qtd;
    const novoSaldo = (item.saldo || 0) + delta;
    const upd = { ...item, saldo: novoSaldo, ultimoMov: { tipo, qtd, motivo, data: new Date().toISOString() } };
    delete upd.tipo; // limpa flag de tipo do form
    await storageSet(`estoque:${item.sku}`, upd);
    // Registrar log de movimento
    const logId = uid();
    await storageSet(`mov:${logId}`, { id: logId, sku: item.sku, nome: item.nome, tipo, qtd, motivo, data: new Date().toISOString() });
    await loadAll();
  };

  // ============ HANDLERS APONTAMENTO ============
  const saveApontamento = async (apont) => {
    await storageSet(`apontamento:${apont.id}`, apont);

    // Auto-avança status do pedido se for primeiro apontamento da etapa
    const pedido = orders.find((o) => o.id === apont.pedidoId);
    if (pedido) {
      let novoStatus = pedido.status;
      if (apont.etapa === "corte" && pedido.status === "pendente") novoStatus = "cortando";
      else if (apont.etapa === "montagem" && pedido.status === "cortando") novoStatus = "montando";
      else if (apont.etapa === "expedicao" && pedido.status === "pronto") novoStatus = "expedido";

      if (novoStatus !== pedido.status) {
        const upd = { ...pedido, status: novoStatus, updatedAt: new Date().toISOString() };
        if (novoStatus === "expedido" && !upd.dataExpedicao) upd.dataExpedicao = today();
        await storageSet(`pedido:${pedido.id}`, upd);
      }
    }

    // Baixar componentes do estoque (consumo)
    if (apont.etapa === "montagem" && pedido) {
      const peca = pedido.pieces[apont.pecaIdx];
      const calc = calculatePiece(peca);
      if (calc) {
        for (const comp of calc.components) {
          const sku = skuMap[comp.name] || autoSku(comp.name);
          const item = estoque[sku];
          if (item) {
            const novoSaldo = (item.saldo || 0) - comp.total;
            await storageSet(`estoque:${sku}`, { ...item, saldo: novoSaldo, ultimoMov: { tipo: "consumo", qtd: comp.total, motivo: `OP #${pedido.orderNumber}`, data: new Date().toISOString() } });
          }
        }
      }
    }

    await loadAll();
  };

  // ============ HANDLERS CONFIG ============
  const saveConfig = async (cfg) => {
    await storageSet("config:default", cfg);
    setConfig(cfg);
  };

  // ============ EXPORT / IMPORT (backup JSON) ============
  const exportAll = async () => {
    const dump = { orders, estoque, apontamentos, config, exportedAt: new Date().toISOString() };
    const blob = new Blob([JSON.stringify(dump, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pcp-backup-${today()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ============ NAVEGAÇÃO ============
  const NAV = [
    { k: "pedidos", label: "Pedidos", icon: ClipboardList },
    { k: "producao", label: "Produção", icon: Activity },
    { k: "apontamento", label: "Apontamento", icon: Play },
    { k: "suprimentos", label: "Suprimentos", icon: Layers },
    { k: "estoque", label: "Estoque", icon: Package },
    { k: "plano", label: "Plano-Mestre", icon: CalendarDays },
    { k: "indicadores", label: "Indicadores", icon: BarChart3 },
    { k: "catalogo", label: "Catálogo", icon: Archive },
    { k: "config", label: "Configurações", icon: Sliders },
    // Gestão de usuários: somente administradores (base compartilhada com o Qualidade)
    ...(currentUser?.role === "admin" ? [{ k: "usuarios", label: "Usuários", icon: Users }] : []),
  ];

  // Contadores rápidos
  const atrasados = orders.filter((o) =>
    ["pendente", "cortando", "montando", "pronto"].includes(o.status) &&
    o.deliveryDate && o.deliveryDate < today()
  ).length;

  const estoqueAlerta = Object.values(estoque).filter((i) => i.saldo < (i.minimo || 0)).length;

  return (
    <div className="min-h-screen bg-stone-950 text-stone-100" style={{ fontFamily: "'Galano Grotesque', 'Manrope', system-ui, sans-serif" }}>
      <style>{`
        /* Galano Grotesque = fonte oficial (OTFs só no servidor); Manrope =
           fallback empacotado via @fontsource em src/index.css (sem CDN).
           Tudo na fonte da marca — JetBrains Mono fica só em dados numéricos
           pontuais (cronômetro), alinhado ao visual dos demais sistemas. */
        * { font-family: 'Galano Grotesque', 'Manrope', system-ui, sans-serif; }
        table { font-variant-numeric: tabular-nums; }
        ::-webkit-scrollbar { width: 8px; height: 8px; }
        ::-webkit-scrollbar-track { background: #F0F1F3; }
        ::-webkit-scrollbar-thumb { background: #CCCCCC; border-radius: 4px; }
        ::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
        .tabular-nums { font-variant-numeric: tabular-nums; }
        @media print {
          aside, header.main-header, .no-print { display: none !important; }
          main { padding: 0 !important; }
          body { background: white; color: black; }
        }
      `}</style>

      {/* HEADER */}
      <header className="main-header border-b border-stone-800 bg-stone-950/95 backdrop-blur sticky top-0 z-40">
        <div className="flex items-center justify-between px-4 sm:px-6 py-3">
          <div className="flex items-center gap-3">
            <button
              onClick={() => setMenuOpen((v) => !v)}
              className="md:hidden text-stone-400 hover:text-amber-400 -ml-1"
              aria-label="Abrir menu"
            >
              <Menu size={20} />
            </button>
            <img src="./brand/logos/logo-preto.png" alt="Persianas Paraná" className="h-7 w-auto" />
            <div>
              <h1 className="text-base font-bold leading-tight text-stone-100">
                PCP <span className="text-amber-500">/</span> Produção
              </h1>
              <div className="text-[10px] font-mono text-stone-500 uppercase tracking-[0.2em]">
                Sistema de Planejamento de Produção
              </div>
            </div>
          </div>
          <div className="text-[11px] font-mono text-stone-500 flex items-center gap-2 sm:gap-4">
            <span className="hidden sm:inline"><Calendar size={11} className="inline mr-1" />{new Date().toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</span>
            <span className="text-amber-500/60">●</span>
            <span>{orders.length} pedidos</span>
            {atrasados > 0 && (
              <>
                <span className="text-red-500/60">●</span>
                <span className="text-red-400">{atrasados} atrasado(s)</span>
              </>
            )}
            {estoqueAlerta > 0 && (
              <>
                <span className="text-amber-500/60">●</span>
                <span className="text-amber-400">{estoqueAlerta} item(ns) abaixo do mín.</span>
              </>
            )}
            <button onClick={exportAll} title="Backup completo (JSON)" className="text-stone-500 hover:text-amber-400 ml-2">
              <Download size={13} />
            </button>
            {currentUser && (
              <span className="hidden md:inline text-stone-400 ml-2">{currentUser.full_name || currentUser.username}</span>
            )}
            <button onClick={onLogout} title="Sair" className="text-stone-500 hover:text-amber-400">
              <LogOut size={13} />
            </button>
          </div>
        </div>
      </header>

      <div className="flex">
        {/* Backdrop do menu (mobile) */}
        {menuOpen && (
          <div
            className="md:hidden fixed inset-0 top-[57px] z-20 bg-black/50"
            onClick={() => setMenuOpen(false)}
          />
        )}
        {/* SIDEBAR */}
        <aside className={`${menuOpen ? "translate-x-0" : "-translate-x-full"} md:translate-x-0 transition-transform fixed md:sticky z-30 top-[57px] w-52 shrink-0 border-r border-stone-800 h-[calc(100vh-57px)] overflow-y-auto bg-stone-950 md:bg-stone-950/40 py-4 px-2`}>
          {NAV.map((n) => (
            <button
              key={n.k}
              onClick={() => { setView(n.k); setEditingOrder(null); setViewingOrder(null); setMenuOpen(false); }}
              className={`w-full flex items-center gap-3 px-3 py-2 mb-0.5 text-xs font-mono uppercase tracking-wider transition rounded-sm ${
                view === n.k
                  ? "bg-amber-500/10 text-amber-400 border-l-2 border-amber-500"
                  : "text-stone-500 hover:text-stone-200 hover:bg-stone-900/40 border-l-2 border-transparent"
              }`}
            >
              <n.icon size={13} />
              {n.label}
            </button>
          ))}
          <div className="mt-8 px-3">
            <div className="text-[9px] font-mono uppercase tracking-wider text-stone-700 mb-1">Resumo</div>
            <div className="text-[10px] font-mono text-stone-500 space-y-0.5">
              <div className="flex justify-between"><span>Pendentes</span><span>{orders.filter(o => o.status === "pendente").length}</span></div>
              <div className="flex justify-between"><span>Em corte</span><span>{orders.filter(o => o.status === "cortando").length}</span></div>
              <div className="flex justify-between"><span>Montagem</span><span>{orders.filter(o => o.status === "montando").length}</span></div>
              <div className="flex justify-between"><span>Prontos</span><span>{orders.filter(o => o.status === "pronto").length}</span></div>
              <div className="border-t border-stone-800 mt-1 pt-1 flex justify-between">
                <span>Estoque</span><span>{Object.keys(estoque).length}</span>
              </div>
              <div className="flex justify-between"><span>Apontamentos</span><span>{Object.keys(apontamentos).length}</span></div>
            </div>
          </div>
        </aside>

        {/* MAIN */}
        <main className="flex-1 p-4 sm:p-6 w-full min-w-0 md:max-w-[calc(100vw-13rem)]">
          {loading ? (
            <div className="flex items-center justify-center py-32 text-stone-600 text-sm font-mono">
              <Clock size={14} className="animate-pulse mr-2" /> Carregando dados...
            </div>
          ) : (
            <>
              {view === "pedidos" && (
                <>
                  {editingOrder ? (
                    <div>
                      <header className="flex items-center justify-between pb-4 border-b border-stone-800 mb-6">
                        <h2 className="text-xl font-bold text-stone-100">
                          {editingOrder === "new" ? "Novo Pedido" : `Editar Pedido #${editingOrder.orderNumber}`}
                        </h2>
                      </header>
                      <OrderForm
                        existing={editingOrder === "new" ? null : editingOrder}
                        onSave={saveOrder}
                        onCancel={() => setEditingOrder(null)}
                        config={config}
                      />
                    </div>
                  ) : viewingOrder ? (
                    <OrderDetail
                      order={viewingOrder}
                      onBack={() => setViewingOrder(null)}
                      onEdit={(o) => { setEditingOrder(o); setViewingOrder(null); }}
                      onChangeStatus={changeStatus}
                      onDelete={deleteOrder}
                    />
                  ) : (
                    <OrderList
                      orders={orders}
                      onOpen={setViewingOrder}
                      onNew={() => setEditingOrder("new")}
                    />
                  )}
                </>
              )}
              {view === "producao" && <ProductionPanel orders={orders} />}
              {view === "apontamento" && <ApontamentoView orders={orders} onSave={saveApontamento} />}
              {view === "suprimentos" && <SupplyPanel orders={orders} estoque={estoque} skuMap={skuMap} />}
              {view === "estoque" && <EstoqueView estoque={estoque} skuMap={skuMap} onSave={saveEstoqueItem} onDelete={deleteEstoqueItem} onMovimento={registrarMovimento} orders={orders} />}
              {view === "plano" && <PlanoMestreView orders={orders} config={config} />}
              {view === "indicadores" && <IndicadoresView orders={orders} apontamentos={apontamentos} config={config} />}
              {view === "catalogo" && <CatalogView />}
              {view === "config" && <ConfigView config={config} onSave={saveConfig} />}
              {view === "usuarios" && currentUser?.role === "admin" && <UsersView currentUser={currentUser} />}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
