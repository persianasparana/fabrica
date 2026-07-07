# Proposta — Etiquetas próprias + Estrutura do Produto automática (PCP)

> **Status: PROPOSTA (07/07/2026)** — desenho organizado do fluxo, aguardando as
> decisões do cliente no final. Substitui a dependência das etiquetas do SYSOP e
> automatiza a escolha da Estrutura do Produto por regras condicionais.
>
> Pedido do cliente: _"precisamos adaptar para criar uma etiqueta própria [...]
> campos parametrizáveis de forma flexível [...] diferentes setores [...] impressão
> facilitada para a profissional do PCP [...] seria possível criar regras tipo,
> condicionais das especificações para selecionar sozinho a estrutura do produto?"_

---

## O que já existe (base que vamos aproveitar)

| Peça | Onde | Estado |
|---|---|---|
| Estrutura do Produto (fórmulas de corte + BOM por família) | `pcp_produtos` (cortes/componentes JSONB) + motor `corte.js` (SE/E/OU/ARRED…) | ✅ |
| Peças individuais com medidas | `pcp_pecas` (largura/altura por peça, `cod_barras` único) | ✅ |
| Bipagem por setor (início/fim, roteiro, baixa) | `/api/pcp/bip` | ✅ (lê etiqueta SYSOP) |
| Ordem de Corte por setor (ficha impressa + log) | `ordem-corte.js`, `pcp_ordem_corte_log` | ✅ |
| Setores parametrizáveis | `pcp_setores` | ✅ |
| Pedido do Comercial entra na fila ao liberar | rota `/api/comercial` (Fase B do ciclo) | ✅ (spec vira TEXTO em observações) |

**O elo fraco hoje:** a spec da peça chega do Comercial achatada em texto
(`observacoes`) e a etiqueta é externa (SYSOP, vinculada à mão). Sem spec
estruturada não há regra automática nem etiqueta rica.

---

## Fluxo proposto (ponta a ponta na fábrica)

```
Pedido LIBERADO no PCP (Fase B)
  │ 1. importa itens com SPEC ESTRUTURADA (coleção, cor, medidas por peça,
  │    acionamento, atributos custom) — não mais só texto
  ▼
MOTOR DE REGRAS seleciona a Estrutura do Produto de cada item
  │    (regras condicionais por prioridade; sem match → item fica
  │    "ESTRUTURA PENDENTE" destacado pra escolha manual — nada trava)
  ▼
ETIQUETAS geradas na hora, UMA POR PEÇA, código PRÓPRIO
  │    (a peça já NASCE vinculada — some o passo "vincular etiqueta")
  ▼
PCP imprime EM LOTE: botão no pedido → páginas agrupadas POR SETOR,
  │    cada setor com SEU MODELO de etiqueta (campos parametrizáveis)
  ▼
Fábrica produz bipando as NOSSAS etiquetas (bipagem atual, sem mudança)
  │    → cortes calculados pela estrutura selecionada (Ordem de Corte)
  ▼
Baixa da última peça → EMBALADO → NA_EXPEDICAO (gaveta = Fase C do ciclo)
```

---

## Bloco 1 — Spec estruturada na importação (pré-requisito de tudo)

Colunas novas em `pcp_itens` (aditivo): `colecao`, `cor_tecido`, `cor_perfil`,
`acionamento`, `ambiente`, `atributos JSONB`, `comercial_item_id` (rastreio até o
item do Comercial). A rota `/api/comercial/.../liberar` passa a preencher tudo
(e as medidas por PEÇA em `pcp_pecas.largura/altura`). O cadastro manual da fila
ganha os mesmos campos (opcionais).

## Bloco 2 — Etiquetas próprias parametrizáveis

**Código da peça (nosso):** gerado na criação da peça — `PP<item>-<n>`
(ex.: `PP1042-3`), curto, único, gravado em `pcp_pecas.cod_barras`. A bipagem
atual já funciona com qualquer código — zero mudança no chão de fábrica.

**Modelos de etiqueta** (`pcp_etiqueta_modelos`): o admin monta N modelos:
- **Setores** que usam o modelo (um modelo pode servir vários; setor sem modelo não imprime).
- **Formato físico**: largura × altura em mm (térmica 80×50, 100×50, A4 em grade
  2×5 pra folha adesiva…), parametrizável — não fixamos hardware.
- **Campos**, escolhidos de um dicionário (mesma ideia do editor de campos do
  Comercial): pedido, cliente, tipo da peça, coleção, cor do tecido, medidas
  (L×A), peça N de TOTAL, ambiente/janela, data do cliente, observações técnicas,
  setor, e **qualquer atributo custom** vindo do formulário do Comercial. Cada
  campo com tamanho (P/M/G) e negrito.
- **Código impresso**: barras (Code128), QR, ambos ou nenhum.

**Impressão em lote (o dia a dia da profissional do PCP):** no pedido, botão
**"Imprimir etiquetas"** → prévia agrupada por setor (na ordem dos setores),
cada grupo já no formato do seu modelo → imprime tudo numa tacada (CSS `@page`
por formato) ou um setor por vez. Log de quem imprimiu o quê
(`pcp_etiqueta_log`, igual à ordem de corte). Reimpressão avulsa por peça.

## Bloco 3 — Estrutura do Produto automática (regras condicionais)

Tabela `pcp_estrutura_regras`: cada regra aponta pra UMA estrutura
(`pcp_produtos`) e tem:
- **prioridade** (menor número avalia primeiro; a primeira que casar vence);
- **condições** (linhas com E entre elas): `campo · operador · valor` —
  campos: tipo da peça, coleção, cor do tecido, largura, altura, área, qtd,
  acionamento e atributos custom; operadores: é / não é / contém / começa com
  (texto) e = ≠ < ≤ > ≥ entre (número);
- ativo + descrição.

**Exemplo (o seu):**
| Prior. | Condições | Estrutura |
|---|---|---|
| 10 | tipo é "Persiana Rolô Premium" **E** cor do tecido contém "Sheer" | Rolô Premium Sheer |
| 20 | tipo é "Persiana Rolô Premium" **E** largura ≤ 250 cm | Rolô Premium Padrão |
| 30 | tipo é "Persiana Rolô Premium" **E** largura > 250 cm | Rolô Premium Reforçada |

Aplicação: ao importar do Comercial (e num botão "reaplicar regras" pra fila
existente). Sem regra que case → **"Estrutura pendente"** destacado na fila,
escolha manual como hoje. Editor de regras no admin com **"testar com uma peça
de exemplo"** (digita as specs e vê qual regra venceria — tira o medo de errar).
Com a estrutura selecionada, os **planejamentos de corte** saem sozinhos na
Ordem de Corte (fórmulas existentes já usam largura/altura da peça).

Evolução futura: marcar a coleção como "Sheer" por **tag no catálogo do
Comercial** (em vez de "contém" no nome) — mais robusto quando os nomes variarem.

---

## Fases e estimativas

| Fase | Entrega | Estimativa |
|---|---|---|
| **F1** | Spec estruturada na importação + colunas novas | 0,5–1 dia |
| **F2** | Etiquetas: código próprio por peça + modelos por setor + impressão em lote + log | 2–3 dias |
| **F3** | Regras de estrutura automática + editor + "testar" + pendências | 2–3 dias |
| **F4** | Amarração fina com Ordem de Corte / RTC + ajustes de uso real | 1 dia |

## Decisões do cliente (responder pra eu começar)

1. **Impressora das etiquetas**: térmica (qual tamanho da etiqueta — 80×50mm?
   100×50?) e/ou folha A4 adesiva em grade? (O formato é parametrizável, mas
   quero criar os modelos iniciais no tamanho REAL de vocês.)
2. **Leitor de código**: o leitor atual da bipagem lê código de barras 1D
   (Code128) normal? Ou prefere QR?
3. **RTC**: me explica em uma frase o que é o RTC no processo de vocês (não
   achei no código) — pra eu amarrar no lugar certo.
4. **Mesmo código em todas as etiquetas da peça** (recomendo: o conteúdo muda
   por setor, o código é o mesmo — a bipagem sabe a peça) — ok?

_Criado em 07/07/2026 · Relacionado: agenda-consultores/docs/CICLO-DO-PEDIDO.md
(Fases B/C) e PROPOSTA-v2.28-OPCOES-PRECIFICADAS.md (specs que alimentam as regras)._
