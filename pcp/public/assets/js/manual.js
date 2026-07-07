/**
 * Manual do usuário do PCP — conteúdo estático renderizado na aba "Manual".
 * Visível pra TODOS os usuários logados (fora do esquema de permissões).
 * Atualize este arquivo sempre que uma função nova entrar no sistema.
 */

function renderManual() {
  const el = document.getElementById('manual-conteudo');
  if (!el || el.dataset.pronto) return;
  el.dataset.pronto = '1';

  const S = (titulo, corpo) => `<div class="card" style="margin-bottom:14px">
    <div class="card-title">${titulo}</div>
    <div style="font-size:13px;line-height:1.65;color:var(--text)">${corpo}</div>
  </div>`;
  const ol = (...itens) => `<ol style="padding-left:20px;margin:6px 0">${itens.map((i) => `<li style="margin-bottom:4px">${i}</li>`).join('')}</ol>`;
  const ul = (...itens) => `<ul style="padding-left:20px;margin:6px 0">${itens.map((i) => `<li style="margin-bottom:4px">${i}</li>`).join('')}</ul>`;
  const b = (t) => `<b>${t}</b>`;

  el.innerHTML = `
  <div style="font-size:12px;color:var(--text3);margin-bottom:14px">
    Manual de uso do PCP — cada seção corresponde a uma aba do menu. O que você
    enxerga depende das suas permissões (concedidas pelo admin em <b>Usuários</b>).
  </div>

  ${S('🏠 Painel', `Visão do dia: pedidos ${b('vencidos')} (prazo passou), em ${b('atenção')}
    (vence em breve) e ${b('em produção')}. Clique num pedido pra abrir os detalhes.`)}

  ${S('📋 Fila de Produção', `Todos os itens em aberto, ordenados por urgência.
    ${ul(
      'Filtros por texto, situação (aberto/concluído), tipo, status de produção, especiais e período.',
      `Selo ${b('estrutura pendente')}: item importado do Comercial sem estrutura definida — abra o item e escolha o produto, ou cadastre uma regra automática (aba Estrutura do Produto).`,
      `${b('Ver')} abre o item (peças, medidas, gaveta de cada peça); ${b('Pedido')} edita o pedido inteiro; ${b('✓')} conclui manualmente.`
    )}`)}

  ${S('📦 Pedidos Comercial (ciclo do pedido)', `Pedidos vindos do Painel Comercial após aprovação do financeiro.
    ${ol(
      `Aba ${b('Para avaliar')}: revise a spec de cada pedido. ${b('Devolver')} exige o motivo (volta ao vendedor; valores continuam travados). ${b('Liberar')} importa os itens automaticamente pra Fila com spec completa, estrutura escolhida pelas regras e etiquetas já geradas.`,
      `Aba ${b('Em produção')}: acompanhe e avance o estado se precisar (normalmente é automático: 1º bip de início → EM PRODUÇÃO; última baixa → EMBALADO; todas as peças guardadas na expedição da Logística → NA EXPEDIÇÃO).`
    )}`)}

  ${S('📟 Bipagem', `Cada setor bipa o ${b('código da peça')} (etiqueta própria PP…):
    ${ol(
      'Selecione o setor e o evento (início ou fim).',
      'Bipe a etiqueta — o sistema valida o roteiro (dependências entre setores) e assume o status do setor.',
      `O ${b('fim')} do setor marcado como final dá ${b('baixa automática')} na peça; quando todas as peças do item têm baixa, o item conclui sozinho.`
    )}
    Erros comuns: "Aguardando concluir antes: X" = o setor anterior do roteiro não deu fim ainda.`)}

  ${S('🏷 Etiquetas', `Etiquetas próprias, uma por peça, com o ${b('mesmo código em todos os setores')} (número de série da peça).
    ${ol(
      'Digite o(s) pedido(s) e Pré-visualizar: os grupos aparecem por setor, cada um com seu modelo.',
      `${b('Imprimir tudo')} abre uma janela por formato (ex.: 100×24 mm na Argox — escolha a impressora térmica no diálogo, sem margens). Peças antigas sem código ganham um na primeira impressão.`,
      'Reimpressão avulsa: botão ↻ em cima da etiqueta na prévia. Todo print fica no histórico.'
    )}
    ${b('Modelos (admin)')}: no fim da página — formato em mm, setores que usam, campos exibidos
    (incluindo atributos do Comercial), código em barras (leitor), QR (celular abre a peça no PCP) ou ambos.`)}

  ${S('✂️ Ordem de Corte', `Calcula os cortes por setor a partir da ${b('Estrutura do Produto')} e das medidas das peças.
    ${ol(
      'Informe os pedidos e Pré-visualizar (confira os avisos — estrutura pendente ou produto sem cortes aparecem aqui).',
      'Modo Individual (uma ordem por pedido) ou Lote. Imprimir registra no histórico; reimpressão é sinalizada.'
    )}`)}

  ${S('🧩 Estrutura do Produto', `Catálogo oficial: fórmulas de corte (L/A em cm, funções SE/E/OU/ARRED…),
    componentes (BOM) e roteiro de setores por produto.
    <br><br>${b('Regras de seleção automática')} (no fim da página): ao liberar um pedido do Comercial, a primeira
    regra (menor prioridade) cujas condições casem define a estrutura do item — cortes saem sozinhos.
    ${ul(
      'Condições em E: tipo da peça, coleção, cor do tecido, medidas, área, quantidade e atributos custom; texto ignora acentos/maiúsculas.',
      `${b('🧪 Testar com uma peça de exemplo')}: digite uma spec e veja qual regra venceria, sem gravar nada.`,
      `${b('Aplicar nos itens sem estrutura')} roda as regras na fila; ${b('Reavaliar tudo')} sobrescreve inclusive escolhas manuais (confirme com cuidado).`
    )}`)}

  ${S('🚚 Expedição (gavetas)', `Peça ${b('embalada')} (com baixa) é guardada numa gaveta bipando a etiqueta.
    ${ol(
      `Modo ${b('Guardar')}: escolha a gaveta e bipe a peça (bipar de novo em outra gaveta = transferência).`,
      `Modo ${b('Retirar')}: saída pra instalação.`,
      'Quando TODAS as peças de um pedido do Comercial estão guardadas, ele vira NA EXPEDIÇÃO sozinho.',
      `${b('Onde está o pedido?')} mostra a gaveta de cada peça; o mapa mostra o conteúdo de cada gaveta.`
    )}
    Obs.: a expedição oficial do dia a dia pode ser feita também pela tela de Expedição da Logística — os dois convivem.`)}

  ${S('🔎 Buscar / ✏️ Editar Pedido / ➕ Novo Pedido', `${ul(
      `${b('Buscar')}: por produto, nº do pedido ou observação (o QR da etiqueta lido no celular cai aqui já filtrado).`,
      `${b('Editar Pedido')}: altera todos os itens/peças de um pedido de uma vez (datas, tipo, status, concluir/reabrir).`,
      `${b('Novo Pedido')}: cadastro manual (fallback de sempre) — produto, quantidade, datas, medidas; importação por Excel/PDF continua no topo.`
    )}`)}

  ${S('📊 Indicadores', 'Números da produção no período: concluídos, atraso médio, distribuição por tipo/status.')}

  ${S('⚙️ Administração (admin)', `${ul(
      `${b('Status de Produção')}: cadastre os status; o marcado como ${b('final')} é o que dá baixa na peça no fim da bipagem.`,
      `${b('Tipos de Produção')}: tipos de entrada (Produção nova, Retrabalho…), cor e padrão.`,
      `${b('Setores')}: cor, ordem, status associado, flag ${b('imprime ordem de corte')} e vínculo usuário↔setor.`,
      `${b('Usuários')}: perfis e permissão por aba (nenhum/ver/editar) — inclui as abas Pedidos Comercial, Etiquetas e Expedição.`
    )}`)}

  ${S('❓ Problemas comuns', `${ul(
      '“O Comercial recusou a chave de serviço” em Pedidos Comercial → problema de integração (avise o admin — conferir COMERCIAL_SERVICE_KEY), sua sessão continua válida.',
      'Voltou pra tela de login → sessão expirou (8h). Entre de novo.',
      'Esqueceu a senha → peça ao admin (reset é feito no servidor).',
      'Etiqueta não bipa → confira se a peça tem código (aba Etiquetas gera na primeira impressão) e se o setor está certo.'
    )}`)}
  `;
}
