# Visão geral — Fábrica / PCP (como funciona, em linguagem simples)

## 1. O problema que resolve

A Persianas Paraná vende persianas e cortinas sob medida: cada pedido tem várias peças, cada
peça tem medida, tecido, cor, acabamento e acionamento próprios, e passa por vários setores da
fábrica (corte, montagem, embalagem…) antes de ir para a expedição e para a instalação. Antes,
o controle era em planilhas: ninguém sabia com certeza em que setor cada peça estava, o que
faltava de material para a semana, nem quando um pedido ia atrasar.

O PCP (Planejamento e Controle da Produção) recebe o pedido **pronto do Comercial** (já
aprovado pelo Financeiro), confere como cada peça será fabricada, libera a produção, acompanha
cada peça por etiqueta e setor, calcula com o Núcleo de Produtos o que vai ser consumido
(tecido por cor, perfis em barras, componentes), pede ao Compras o que falta, programa a carga
por setor e guarda as peças prontas em gavetas para a Logística retirar. O módulo de Qualidade
registra não conformidades e seus indicadores.

## 2. Fluxo principal, ponta a ponta

```
 Comercial (:3010)         FÁBRICA / PCP (:3020)                                   Logística (:3000)
 ┌───────────────┐   ┌───────────┐  ┌─────────┐  ┌───────────┐  ┌──────────┐   ┌──────────────┐
 │ pedido PED-…  │──▶│ Pedidos   │─▶│ Fila de │─▶│ Bipagem   │─▶│ Expedição│──▶│ agenda de    │
 │ EM_ANALISE_PCP│   │ Comercial │  │ produção│  │ por setor │  │ (gavetas)│   │ instalação   │
 └───────────────┘   │ (liberar) │  └─────────┘  └───────────┘  └──────────┘   └──────────────┘
        ▲            └───────────┘       │              │             │
        │                  │             ▼              ▼             ▼
        └── status volta ──┘   Ficha de Produção   1ª bipagem →   todas guardadas →
        (LIBERADO_PRODUCAO,    + plano de corte    baixa no        NA_EXPEDICAO
         EM_PRODUCAO,          (Núcleo :3070)      Compras :3050   no Comercial
         EMBALADO, NA_EXPEDICAO)
```

1. **Pedidos Comercial** — a aba lista os pedidos aguardando o PCP; "Ver" mostra, item a item,
   qual Estrutura do Produto será usada (ou "pelo Núcleo" para cortina/celular/vertical/toldo).
2. **Liberar produção** — o pedido vira `LIBERADO_PRODUCAO` no Comercial e cada peça entra na
   fila com a especificação como foi vendida (`spec_nucleo`); devolver manda de volta ao vendedor.
3. **Fila / Planejamento de carga / Necessidade de materiais** — a fila mostra prazos e alertas;
   a carga programa as peças por setor pela capacidade; a necessidade soma, pelo Núcleo, tecido,
   perfis e componentes do horizonte e compara com o saldo do Compras ("Requisitar ao Compras").
4. **Etiquetas, Ficha de Produção e Plano de Corte** — etiqueta própria por peça; a Ficha traz
   specs, cortes por setor e a lista de materiais; o plano de corte vem do Núcleo.
5. **Bipagem** — cada setor bipa início/fim da peça; o início do primeiro setor avança o pedido
   para `EM_PRODUCAO` e baixa os materiais da peça no Compras; o fim do setor final dá a baixa e,
   quando todas as peças do pedido estão baixadas, o pedido vai a `EMBALADO`.
6. **Expedição** — a peça embalada é guardada numa gaveta; com todas guardadas o pedido vai a
   `NA_EXPEDICAO`; a Logística consulta onde está cada peça e retira na instalação.

## 3. Telas e papéis (quem usa o quê)

| Papel | O que faz | Onde |
|---|---|---|
| **admin** | Tudo; cadastra setores, status, tipos, usuários (permissão por aba), modelos de etiqueta, calendário da carga | abas de admin |
| **usuário com `comercial`** (avaliador do PCP) | Confere a estrutura, libera ou devolve o pedido | Pedidos Comercial |
| **usuário com `fila`/`pedido`** (planejador) | Fila, Editar Pedido, Planejamento de carga, Necessidade de materiais e requisição ao Compras, regras de Estrutura | Fila, Carga, Necessidade, Estrutura |
| **operador de setor** (`bipagem`, `etiquetas`) | Bipa início/fim das peças do seu setor; imprime etiquetas; Ficha e plano de corte | Bipagem, Etiquetas, Plano de Corte |
| **expedição** (`expedicao`) | Guarda/retira peças nas gavetas | Expedição |
| **qualidade** | Registra NCs e vê KPIs | `/qualidade/` |
| **fotógrafo do e-commerce** | Fotografa peças com a spec (celular) | mini-PWA `/pcp/fotos/` |
| **Logística** (sistema) | Lê pedidos, peças e gavetas | `/api/integracao/*` (chave) |

Permissões por aba: `none` / `ver` / `editar` em `users.permissoes`; o backend só gateia as
escritas (`requirePerm`), o frontend esconde as abas.

## 4. Principais tabelas (nome · o que guarda)

- `pcp_itens` · uma linha por produto de um pedido (pedido, produto, qnt, datas, tipo, status, prioridade, spec da venda `spec_nucleo`, `produto_sku` do Núcleo, estrutura `produto_id`).
- `pcp_pecas` · cada peça física do item (etiqueta `cod_barras` única, medidas em cm, baixa, gaveta, `materiais_baixados_em`).
- `pcp_peca_etapas` · início/fim de cada setor por peça (a bipagem).
- `pcp_produtos` · Estrutura do Produto: fórmulas de corte, componentes (BOM), roteiro de setores, `produto_sku`.
- `pcp_estrutura_regras` + `pcp_colecao_categorias` · regras de seleção automática da estrutura.
- `pcp_setores` / `pcp_status` / `pcp_tipos` · cadastros do admin (capacidade por dia, setor de corte, status final, tipo padrão).
- `pcp_pedido_info` · dados de nível de pedido vindos do Comercial (cliente, vendedor, prazo, desenhos).
- `pcp_ciclo_pendencias` / `pcp_compras_pendencias` · **outboxes** (ver glossário) do Comercial e do Compras.
- `pcp_requisicoes` · solicitações de compra feitas pela Necessidade (idempotentes).
- `pcp_gavetas` + `pcp_expedicao_log` · gavetas da expedição e movimentações.
- `pcp_etiqueta_modelos` + `pcp_etiqueta_log` · modelos de etiqueta e impressões.
- `pcp_ordem_corte_log` · impressões do plano de corte.
- `pcp_config` · chave/valor (calendário da carga, roteiro por linha, modo da OC).
- `nao_conformidades` · NCs do Qualidade.
- `users`, `usuario_setores`, `login_attempts`, `audit_log`, `session` · acesso e auditoria.
- `ecommerce_fotos_registros` + `ecommerce_fotos_arquivos` · fotos para o e-commerce.

Lista completa com colunas: `ARCHITECTURE.md`.

## 5. Com quem conversa na federação (e o que acontece se o vizinho cair)

| Vizinho | Para quê | Se estiver fora do ar |
|---|---|---|
| **Comercial** (:3010, `X-Service-Key`) | Listar/avaliar pedidos, liberar/devolver, avançar o ciclo, buscar desenhos | A aba Pedidos Comercial mostra "Comercial inacessível" (502). Os avanços automáticos do ciclo entram na outbox `pcp_ciclo_pendencias` e são reenviados a cada 5 min. A fila interna continua funcionando. |
| **Núcleo de Produtos** (:3070) | Lista de materiais (Ficha, Necessidade), plano de corte, BOM | A Ficha sai sem a lista e a Necessidade diz o motivo; o plano de corte responde 502/503; nada trava a bipagem. |
| **Compras** (:3050) | Saldo/falta, solicitação de compra, saída de produção na 1ª bipagem | Saldo aparece "Compras fora"; requisições e saídas vão para a outbox `pcp_compras_pendencias` e são reenviadas; 4xx definitivo fica "bloqueada" visível na tela. Sem a chave no `.env`, a integração fica desligada. |
| **Logística** (:3000) chama a Fábrica | Pedidos/peças/gavetas por `X-API-Key` | Não afeta a Fábrica; sem `INTEGRACAO_API_KEY` as rotas respondem 503. |

Contrato completo: `PROTOCOLO-FEDERACAO.md` (linhas B, C, D e M da matriz).

## 6. Glossário

- **Peça** — unidade física fabricada; um item com `qnt` 3 tem 3 peças, cada uma com etiqueta.
- **Bipagem** — ler a etiqueta (código de barras/QR) no setor para marcar início ou fim da etapa.
- **Baixa** — a peça está pronta (fim do setor cujo status é "final"); o item conclui quando todas as peças têm baixa.
- **Estrutura do Produto** — cadastro de como fabricar (cortes por setor, componentes, roteiro). "Estrutura pendente" = nenhuma regra casou; "pelo Núcleo" = linha sem estrutura local (cortina, celular, vertical, toldo).
- **Roteiro** — sequência de setores (com dependências) que a peça percorre; sem roteiro, passa por todos.
- **Spec da venda (`spec_nucleo`)** — a peça exatamente como foi vendida (produto, tecido, cor, seleções do motor); alimenta a lista de materiais.
- **Lista de materiais / Necessidade** — o que a produção vai consumir (tecido por coleção × cor × rolo, perfis em barras, componentes), calculado pelo Núcleo sem dinheiro.
- **Outbox** — tabela onde fica guardada uma escrita que falhou num módulo vizinho, reenviada automaticamente até dar certo (nunca derruba a operação local).
- **Idempotente** — pode ser repetido sem efeito duplicado (liberar o mesmo PED- duas vezes não duplica a fila; a mesma requisição não vira duas SCs).
- **Ciclo do pedido** — os estados federados do pedido (`EM_ANALISE_PCP → LIBERADO_PRODUCAO → EM_PRODUCAO → EMBALADO → NA_EXPEDICAO → …`), cuja fonte da verdade é o Comercial.
- **Gaveta** — posição da expedição onde a peça embalada fica guardada até a instalação.
- **X-Service-Key / X-API-Key** — chave compartilhada entre dois módulos para chamadas servidor-a-servidor (a Fábrica usa `X-API-Key` só na rota que a Logística consome).
- **Eco** — campo devolvido pelo Núcleo que outro módulo lê como contrato (ex.: `tubo_efetivo`).
