# Manual do Usuário

Sistema de Gestão de Não Conformidades — **Persianas Paraná**

> **Público-alvo:** Equipe de Qualidade, Logística, líderes de setor e gestores que registram ou consultam não conformidades.

---

## 1. Acessando o Sistema

1. Abra o navegador (Chrome, Firefox ou Edge)
2. Acesse o endereço fornecido pela TI (ex: `https://qualidade.persianasparana.local`)
3. Informe seu **usuário** e **senha**
4. Clique em **Entrar**

> 💡 Após 5 tentativas com senha errada, o acesso é bloqueado por 15 minutos. Procure a TI se isso acontecer.

---

## 2. Aba "Registrar NC" — Lançamento de uma ocorrência

Esta é a aba principal usada no **acerto diário**. Cada não conformidade identificada deve gerar um registro.

### Campos:

| Campo | Como preencher |
|---|---|
| **Data da ocorrência** | Data em que o problema aconteceu (não a data de hoje, se for diferente) |
| **Nº pedido / referência** | Número do pedido afetado (ex: `18363`) |
| **Setor(es) envolvido(s)** | Todos os setores que tiveram participação — **clique para marcar mais de um**. Botão fica destacado em vermelho quando ativo |
| **Origem do erro** | **Onde nasceu o problema** — pode ser mais de um. Esta é a informação chave para análise de KPIs |
| **Impacto** | `Baixo` (atraso pequeno), `Médio` (retrabalho parcial), `Alto` (reagendamento, retorno ao cliente) |
| **Status** | `Aberta` (recém-identificada), `Em andamento` (sendo tratada), `Encerrada` (resolvida) |
| **Descrição** | Conte o que aconteceu em detalhes |
| **Causa raiz** | Por que o erro ocorreu (não confundir com sintoma) |
| **Ação imediata** | O que foi feito no momento — reagendamento, retrabalho, contato com cliente |
| **Responsável** | Quem está cuidando da resolução |
| **Prazo** | Data limite para encerrar a NC |

### Exemplo prático:

> *Pedido 18363 chegou ao cliente sem as ripas de afastamento. Vendedor não solicitou no pedido. Técnico não pôde concluir a instalação.*

- **Setores envolvidos:** Comercial, Fábrica, Expedição, Logística, Instalação
- **Origem do erro:** Comercial (foi onde o erro nasceu — ele depois passou batido pelas demais conferências)
- **Impacto:** Alto
- **Status:** Em andamento
- **Causa raiz:** Vendedor não pediu o acessório obrigatório para o produto
- **Ação imediata:** Reagendamento da instalação para 03/05; produção das ripas iniciada
- **Responsável:** João (Qualidade)
- **Prazo:** 06/05/2026

> 📌 **Importante:** Marque na **Origem do erro** apenas o(s) setor(es) onde o problema **nasceu**. Outros setores que deixaram passar entram em **Setores envolvidos**, não em Origem. Essa distinção é crucial para os KPIs.

---

## 3. Aba "Histórico"

Lista todas as NCs registradas, da mais recente para a mais antiga.

### Filtros disponíveis:

- **Todos** — mostra tudo
- **Abertas** — apenas NCs com status `Aberta`
- **Em andamento** — em tratamento
- **Encerradas** — finalizadas
- **Alto impacto** — apenas NCs marcadas como impacto Alto

### Em cada registro você pode:

- **Atualizar status** — quando a NC progride (ex: de `Aberta` para `Em andamento` ou `Encerrada`)
- **Excluir** — remove o registro permanentemente (a operação fica registrada no log de auditoria)

---

## 4. Aba "Planos de Ação"

Mostra automaticamente todas as NCs com status `Aberta` ou `Em andamento` — ou seja, **as que ainda precisam de tratamento**.

Use esta aba como sua "lista de tarefas" diária da qualidade.

---

## 5. Aba "KPIs" — Indicadores

Visão executiva da qualidade operacional.

### Indicadores numéricos:

- **Total NCs** — quantas foram registradas no histórico
- **Abertas** — quantas ainda não foram tratadas
- **Encerradas** — quantas já foram resolvidas
- **Taxa de resolução** — percentual de NCs encerradas (idealmente > 80%)

### Gráficos:

| Gráfico | O que mostra | Como interpretar |
|---|---|---|
| **NCs por origem de erro** | Ranking dos setores que mais geram problemas | O setor no topo é prioridade para treinamento |
| **Evolução temporal** | Quantidade de NCs por dia | Picos podem indicar causas específicas (ex: mudança de processo, troca de fornecedor) |
| **Distribuição por impacto** | Proporção entre Alto/Médio/Baixo | Muitos `Alto` = sintoma de processo crítico falhando |

---

## 6. Aba "Treinamentos"

Esta aba é gerada automaticamente a partir das NCs registradas.

Para cada setor que apareceu como **Origem do erro**, o sistema lista:
- Quantas NCs aquele setor originou
- Os temas sugeridos de treinamento

### Como usar:

1. Os setores aparecem **ordenados por frequência** — o primeiro é onde o treinamento gera mais retorno
2. Os temas são **pré-definidos** com base nas falhas mais comuns por setor
3. Use os temas como **insumo para o RH e gestores** na hora de planejar capacitações

---

## 7. Boas Práticas no Uso Diário

### O que fazer

- ✅ Registrar **toda** ocorrência identificada no acerto, mesmo as pequenas
- ✅ Distinguir **Origem do erro** vs **Setores envolvidos**
- ✅ Preencher **Causa raiz** sempre — é o que diferencia gestão profissional de "só apagar incêndio"
- ✅ Atualizar o **Status** quando a NC for resolvida (não deixar tudo como `Aberta`)
- ✅ Revisar a aba **Planos de Ação** semanalmente

### O que evitar

- ❌ Apontar culpados ("Fulano errou") — descreva o **fato**, não a pessoa
- ❌ Misturar várias ocorrências em um único registro — uma NC por evento
- ❌ Deixar campos críticos em branco (descrição, origem, impacto)
- ❌ Excluir NCs antigas para "limpar" o histórico — perde-se análise temporal

---

## 8. Perguntas Frequentes

**P: Esqueci minha senha, o que fazer?**
R: Procure a TI. Eles podem redefini-la via terminal.

**P: O sistema travou ou está lento.**
R: Recarregue a página (F5). Se persistir, comunique a TI com horário e ação que estava executando.

**P: Posso editar uma NC depois de salvar?**
R: Status pode ser atualizado a qualquer momento. Outros campos atualmente exigem suporte da TI (em versões futuras será possível editar).

**P: Posso usar pelo celular?**
R: Sim — o sistema é responsivo. Recomenda-se Chrome ou Safari atualizados.

**P: Quem pode ver as NCs que registro?**
R: Todos os usuários com acesso ao sistema. Não há perfis de "privacidade individual" nesta versão.

**P: Os dados são salvos automaticamente?**
R: Apenas após clicar em **Salvar não conformidade**. Se fechar o navegador antes, perderá o que digitou.

---

## 9. Suporte

- **Dúvidas de uso:** [Setor de Qualidade]
- **Problemas técnicos:** [Setor de TI]
- **Sugestões de melhoria:** registre no próprio sistema com setor "Produto" e origem "Produto" — isso entra na pauta de evoluções

---

**Versão deste manual:** 1.0.0 — Maio/2026
