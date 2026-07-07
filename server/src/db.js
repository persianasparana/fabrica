/**
 * Camada de banco (PostgreSQL) — backend unificado fabrica.
 *
 * Pool de conexões `pg` + criação idempotente do schema.
 * Conexão configurada por ambiente (DATABASE_URL ou PG*).
 */
import pg from 'pg';

const { Pool } = pg;

export const pool = new Pool(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL }
    : {
        host: process.env.PGHOST || '127.0.0.1',
        port: Number(process.env.PGPORT || 5432),
        user: process.env.PGUSER || 'fabrica_user',
        password: process.env.PGPASSWORD || '',
        database: process.env.PGDATABASE || 'fabrica_db',
      }
);

/** Helper de query. */
export function q(text, params) {
  return pool.query(text, params);
}

/** Cria o schema, se necessário (idempotente). */
export async function migrate() {
  await q(`
    CREATE TABLE IF NOT EXISTS users (
      id            BIGSERIAL PRIMARY KEY,
      username      VARCHAR(64) UNIQUE NOT NULL,
      password_hash VARCHAR(255) NOT NULL,
      full_name     VARCHAR(128) NOT NULL,
      role          VARCHAR(32) NOT NULL DEFAULT 'user',
      active        BOOLEAN NOT NULL DEFAULT TRUE,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      last_login    TIMESTAMPTZ
    )
  `);

  // Rate limiting de login persistido (por usuário + IP)
  await q(`
    CREATE TABLE IF NOT EXISTS login_attempts (
      id           BIGSERIAL PRIMARY KEY,
      username     VARCHAR(64) NOT NULL,
      ip_address   VARCHAR(45),
      attempted_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_attempts ON login_attempts (username, attempted_at)`);

  // Auditoria comum aos dois apps
  await q(`
    CREATE TABLE IF NOT EXISTS audit_log (
      id          BIGSERIAL PRIMARY KEY,
      user_id     BIGINT,
      app         VARCHAR(16),
      action      VARCHAR(64) NOT NULL,
      entity_type VARCHAR(32),
      entity_id   BIGINT,
      details     TEXT,
      ip_address  VARCHAR(45),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // PCP: limpeza do modelo antigo (kv-store substituído por tabelas reais)
  await q(`DROP TABLE IF EXISTS pcp_kv_store`);

  // PCP: estrutura do produto (catálogo oficial — fórmulas de corte + BOM)
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_produtos (
      id          BIGSERIAL PRIMARY KEY,
      chave       VARCHAR(64) UNIQUE NOT NULL,
      nome        VARCHAR(160) NOT NULL,
      familia     VARCHAR(40) NOT NULL,
      tubo        VARCHAR(40),
      unidade     VARCHAR(10) NOT NULL DEFAULT 'cm',
      cortes      JSONB NOT NULL DEFAULT '[]',
      componentes JSONB NOT NULL DEFAULT '[]',
      calculo_extra_fonte TEXT,
      ativo       BOOLEAN NOT NULL DEFAULT TRUE,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_prod_familia ON pcp_produtos (familia)`);

  // PCP: fila de produção (itens de pedido — modelo de negócio do planejamento)
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_itens (
      id            BIGSERIAL PRIMARY KEY,
      produto       VARCHAR(160) NOT NULL,
      produto_id    BIGINT REFERENCES pcp_produtos(id) ON DELETE SET NULL,
      pedido        VARCHAR(64) NOT NULL,
      qnt           INTEGER NOT NULL DEFAULT 1,
      chegada_pcp   DATE,
      prev_inicial  DATE,
      prev_producao DATE,
      conclusao     DATE,
      data_cliente  DATE,
      tipo          VARCHAR(40) NOT NULL DEFAULT 'Produção nova',
      motivo_atraso VARCHAR(80) NOT NULL DEFAULT '',
      observacoes   TEXT NOT NULL DEFAULT '',
      especial      BOOLEAN NOT NULL DEFAULT FALSE,
      created_by    BIGINT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_itens_pedido ON pcp_itens (pedido)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_itens_data_cliente ON pcp_itens (data_cliente)`);
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS especial BOOLEAN NOT NULL DEFAULT FALSE`);

  // PCP: status de produção configuráveis (admin cadastra/exclui). Atribuídos
  // manualmente pelo PCP por item ou no pedido inteiro — distinto do indicador
  // de prazo (vencido/atenção) e da baixa por peça.
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_status (
      id         BIGSERIAL PRIMARY KEY,
      nome       VARCHAR(40) UNIQUE NOT NULL,
      cor        VARCHAR(7) NOT NULL DEFAULT '#606060',
      ordem      INTEGER NOT NULL DEFAULT 0,
      ativo      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS status_id BIGINT REFERENCES pcp_status(id) ON DELETE SET NULL`);
  await q(`CREATE INDEX IF NOT EXISTS idx_itens_status ON pcp_itens (status_id)`);

  // PCP: tipos de entrada de pedido (configuráveis pelo admin). Antes era uma
  // lista fixa no código; agora o admin cadastra/edita/exclui e define a cor do
  // badge, a ordem e qual é o tipo padrão. O item guarda o tipo como TEXTO
  // (pcp_itens.tipo) — a renomeação de um tipo reflete nos itens existentes.
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_tipos (
      id         BIGSERIAL PRIMARY KEY,
      nome       VARCHAR(40) UNIQUE NOT NULL,
      cor        VARCHAR(7) NOT NULL DEFAULT '#3949AB',
      ordem      INTEGER NOT NULL DEFAULT 0,
      padrao     BOOLEAN NOT NULL DEFAULT FALSE,
      ativo      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Seed idempotente: preserva os tipos atuais e suas cores (não altera nada já
  // existente; ON CONFLICT evita duplicar quando rodar de novo).
  await q(`
    INSERT INTO pcp_tipos (nome, cor, ordem, padrao) VALUES
      ('Produção nova',    '#3949AB', 10, TRUE),
      ('Retrabalho',       '#E65100', 20, FALSE),
      ('Higienização',     '#0D47A1', 30, FALSE),
      ('Carry-over 2025',  '#C1212D', 40, FALSE),
      ('Showroom',         '#7B1FA2', 50, FALSE)
    ON CONFLICT (nome) DO NOTHING
  `);

  // PCP: peças individuais — cada peça tem etiqueta própria (gerada pelo
  // sistema de pedidos) e baixa de produção própria. O item agrega qnt peças.
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_pecas (
      id           BIGSERIAL PRIMARY KEY,
      item_id      BIGINT NOT NULL REFERENCES pcp_itens(id) ON DELETE CASCADE,
      numero       INTEGER NOT NULL,
      cod_barras   VARCHAR(64) UNIQUE,
      conclusao    DATE,
      concluida_por BIGINT,
      vinculada_em TIMESTAMPTZ,
      created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
      UNIQUE (item_id, numero)
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_pecas_item ON pcp_pecas (item_id)`);

  // Upgrade do modelo anterior (etiqueta ficava no item): move o código para a
  // peça 1 e gera as peças de itens que ainda não têm. Idempotente.
  const { rows: temCodBarras } = await q(`
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'pcp_itens' AND column_name = 'cod_barras'
  `);
  if (temCodBarras.length) {
    await q(`
      INSERT INTO pcp_pecas (item_id, numero, cod_barras, conclusao)
      SELECT i.id, gs.n,
             CASE WHEN gs.n = 1 AND m.id IS NOT NULL THEN i.cod_barras END,
             i.conclusao
      FROM pcp_itens i
      LEFT JOIN (
        SELECT DISTINCT ON (cod_barras) id, cod_barras
        FROM pcp_itens WHERE cod_barras IS NOT NULL ORDER BY cod_barras, id
      ) m ON m.id = i.id
      CROSS JOIN LATERAL generate_series(1, GREATEST(i.qnt, 1)) AS gs(n)
      WHERE NOT EXISTS (SELECT 1 FROM pcp_pecas p WHERE p.item_id = i.id)
    `);
    await q(`ALTER TABLE pcp_itens DROP COLUMN cod_barras`);
  } else {
    await q(`
      INSERT INTO pcp_pecas (item_id, numero, conclusao)
      SELECT i.id, gs.n, i.conclusao
      FROM pcp_itens i
      CROSS JOIN LATERAL generate_series(1, GREATEST(i.qnt, 1)) AS gs(n)
      WHERE NOT EXISTS (SELECT 1 FROM pcp_pecas p WHERE p.item_id = i.id)
    `);
  }

  // PCP: status pode ser marcado como "final" (o 'fim' nesse status dá baixa)
  await q(`ALTER TABLE pcp_status ADD COLUMN IF NOT EXISTS final BOOLEAN NOT NULL DEFAULT FALSE`);

  // PCP: setores de produção (admin). Cada setor é associado a um status —
  // ao bipar 'início' do setor, a peça assume esse status.
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_setores (
      id         BIGSERIAL PRIMARY KEY,
      nome       VARCHAR(60) UNIQUE NOT NULL,
      cor        VARCHAR(7) NOT NULL DEFAULT '#606060',
      ordem      INTEGER NOT NULL DEFAULT 0,
      status_id  BIGINT REFERENCES pcp_status(id) ON DELETE SET NULL,
      ativo      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  // Permissões por aba (JSONB: { aba: 'none'|'ver'|'editar' }) no usuário
  await q(`ALTER TABLE users ADD COLUMN IF NOT EXISTS permissoes JSONB NOT NULL DEFAULT '{}'`);

  // Associação usuário ↔ setores (N:N)
  await q(`
    CREATE TABLE IF NOT EXISTS usuario_setores (
      user_id  BIGINT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      setor_id BIGINT NOT NULL REFERENCES pcp_setores(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, setor_id)
    )
  `);

  // Roteiro de produção por produto: setores + dependências entre eles.
  // JSONB: [ { setor_id, depende_de: [setor_id, ...] }, ... ]
  await q(`ALTER TABLE pcp_produtos ADD COLUMN IF NOT EXISTS roteiro JSONB NOT NULL DEFAULT '[]'`);

  // Etapas de produção por peça (bipagem por setor: início/fim)
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_peca_etapas (
      id          BIGSERIAL PRIMARY KEY,
      peca_id     BIGINT NOT NULL REFERENCES pcp_pecas(id) ON DELETE CASCADE,
      setor_id    BIGINT NOT NULL REFERENCES pcp_setores(id) ON DELETE CASCADE,
      inicio      TIMESTAMPTZ,
      fim         TIMESTAMPTZ,
      inicio_por  BIGINT,
      fim_por     BIGINT,
      UNIQUE (peca_id, setor_id)
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_peca_etapas_peca ON pcp_peca_etapas (peca_id)`);

  // Qualidade: não conformidades
  await q(`
    CREATE TABLE IF NOT EXISTS nao_conformidades (
      id              BIGSERIAL PRIMARY KEY,
      pedido          VARCHAR(64),
      data_ocorrencia DATE NOT NULL,
      descricao       TEXT NOT NULL,
      causa_raiz      TEXT,
      acao_imediata   TEXT,
      acao_corretiva  TEXT,
      impacto         VARCHAR(16) NOT NULL DEFAULT 'Médio',
      status          VARCHAR(32) NOT NULL DEFAULT 'Aberta',
      responsavel     VARCHAR(128),
      prazo           DATE,
      setores         JSONB NOT NULL DEFAULT '[]',
      origens         JSONB NOT NULL DEFAULT '[]',
      created_by      BIGINT,
      created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_nc_data ON nao_conformidades (data_ocorrencia)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_nc_status ON nao_conformidades (status)`);

  // ─── Corte / Ordem de Produção ──────────────────────────────────────────
  // Medidas por peça que alimentam o cálculo de cortes. Híbrido: chegam na
  // importação quando existirem e são editáveis no PCP. `medidas` (JSONB)
  // guarda entradas extras específicas de alguns produtos.
  await q(`ALTER TABLE pcp_pecas ADD COLUMN IF NOT EXISTS largura NUMERIC(8,2)`);
  await q(`ALTER TABLE pcp_pecas ADD COLUMN IF NOT EXISTS altura  NUMERIC(8,2)`);
  await q(`ALTER TABLE pcp_pecas ADD COLUMN IF NOT EXISTS medidas JSONB`);

  // Setor que imprime ordem de produção de corte (parâmetro marcado pelo admin).
  // Cada corte do produto aponta para um setor via cortes[].setor_id (JSONB).
  await q(`ALTER TABLE pcp_setores ADD COLUMN IF NOT EXISTS ordem_corte BOOLEAN NOT NULL DEFAULT FALSE`);

  // Log de impressão/reimpressão das ordens de corte (rastreabilidade).
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_ordem_corte_log (
      id         BIGSERIAL PRIMARY KEY,
      pedido     VARCHAR(64),
      setor_id   BIGINT REFERENCES pcp_setores(id) ON DELETE SET NULL,
      modo       VARCHAR(16) NOT NULL DEFAULT 'individual',
      tipo       VARCHAR(16) NOT NULL DEFAULT 'impressao',
      pedidos    JSONB NOT NULL DEFAULT '[]',
      por        BIGINT,
      por_nome   VARCHAR(128),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_ordem_corte_pedido ON pcp_ordem_corte_log (pedido)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_ordem_corte_setor ON pcp_ordem_corte_log (setor_id)`);

  // Config chave/valor do PCP (ex.: modo padrão da ordem de corte: individual|lote)
  await q(`CREATE TABLE IF NOT EXISTS pcp_config (chave VARCHAR(64) PRIMARY KEY, valor TEXT)`);
  await q(`INSERT INTO pcp_config (chave, valor) VALUES ('ordem_corte_modo_padrao', 'individual') ON CONFLICT (chave) DO NOTHING`);

  // ─── Spec estruturada do item (F1 — etiquetas/estrutura automática) ───────
  // A importação do Comercial (rota /api/comercial/.../liberar) preenche estes
  // campos; antes a spec chegava achatada em `observacoes`. Aditivo.
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS cliente     VARCHAR(160)`);
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS colecao     VARCHAR(120)`);
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS cor_tecido  VARCHAR(120)`);
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS cor_perfil  VARCHAR(120)`);
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS acionamento VARCHAR(120)`);
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS ambiente    VARCHAR(120)`);
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS atributos   JSONB NOT NULL DEFAULT '{}'`);
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS comercial_item_id VARCHAR(64)`);

  // ─── Etiquetas próprias (F2) ──────────────────────────────────────────────
  // Modelos parametrizáveis pelo admin: formato físico (mm), setores que usam,
  // campos exibidos (dicionário + atributos custom) e tipo de código impresso.
  // `setores = []` significa "vale para todos os setores" (fallback); um modelo
  // com o setor listado explicitamente tem prioridade sobre o fallback.
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_etiqueta_modelos (
      id         BIGSERIAL PRIMARY KEY,
      nome       VARCHAR(80) UNIQUE NOT NULL,
      largura_mm NUMERIC(6,1) NOT NULL DEFAULT 100,
      altura_mm  NUMERIC(6,1) NOT NULL DEFAULT 24,
      setores    JSONB NOT NULL DEFAULT '[]',
      campos     JSONB NOT NULL DEFAULT '[]',
      codigo     VARCHAR(10) NOT NULL DEFAULT 'AMBOS',
      padrao     BOOLEAN NOT NULL DEFAULT FALSE,
      ativo      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  // Seed: modelo 100×24mm (térmica contínua Argox iX4-250 — formato atual do
  // cliente, "Etiqueta Produção 10.40 x 2.50" do SYSOP), campos espelhando a
  // etiqueta de referência. Idempotente; o admin edita depois.
  await q(`
    INSERT INTO pcp_etiqueta_modelos (nome, largura_mm, altura_mm, setores, campos, codigo, padrao)
    VALUES ('Produção 100×24 (padrão)', 100, 24, '[]', $1::jsonb, 'AMBOS', TRUE)
    ON CONFLICT (nome) DO NOTHING
  `, [JSON.stringify([
    { chave: 'pedido',       rotulo: 'Pedido',   tam: 'G', negrito: true },
    { chave: 'peca',         rotulo: 'Peça',     tam: 'G', negrito: true },
    { chave: 'produto',      rotulo: '',         tam: 'G', negrito: true },
    { chave: 'medidas',      rotulo: 'Med',      tam: 'G', negrito: true },
    { chave: 'colecao',      rotulo: 'Col',      tam: 'M', negrito: false },
    { chave: 'cor_tecido',   rotulo: 'Cor Tec',  tam: 'M', negrito: false },
    { chave: 'acionamento',  rotulo: 'Acion',    tam: 'M', negrito: false },
    { chave: 'ambiente',     rotulo: 'Amb',      tam: 'M', negrito: false },
    { chave: 'data_cliente', rotulo: 'Prazo',    tam: 'M', negrito: false },
    { chave: 'cliente',      rotulo: 'Cliente',  tam: 'P', negrito: false },
    { chave: 'marca',        rotulo: '',         tam: 'P', negrito: false },
  ])]);

  // Log de impressão/reimpressão de etiquetas (rastreabilidade, igual à ordem
  // de corte). `pecas` = [{ id, codigo }] impressas na tacada.
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_etiqueta_log (
      id         BIGSERIAL PRIMARY KEY,
      pedido     VARCHAR(64),
      pedidos    JSONB NOT NULL DEFAULT '[]',
      setor_id   BIGINT REFERENCES pcp_setores(id) ON DELETE SET NULL,
      modelo_id  BIGINT REFERENCES pcp_etiqueta_modelos(id) ON DELETE SET NULL,
      pecas      JSONB NOT NULL DEFAULT '[]',
      tipo       VARCHAR(16) NOT NULL DEFAULT 'impressao',
      por        BIGINT,
      por_nome   VARCHAR(128),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_etiqueta_log_pedido ON pcp_etiqueta_log (pedido)`);

  // ─── Regras de seleção automática da Estrutura do Produto (F3) ───────────
  // Cada regra aponta para UMA estrutura (pcp_produtos) e tem condições em E
  // sobre a spec estruturada do item (F1): [{ campo, operador, valor, valor2? }].
  // Menor prioridade avalia primeiro; a primeira que casar vence. Item sem
  // regra que case fica com produto_id NULL = "estrutura pendente" na fila.
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_estrutura_regras (
      id         BIGSERIAL PRIMARY KEY,
      descricao  VARCHAR(160) NOT NULL,
      produto_id BIGINT NOT NULL REFERENCES pcp_produtos(id) ON DELETE CASCADE,
      prioridade INTEGER NOT NULL DEFAULT 100,
      condicoes  JSONB NOT NULL DEFAULT '[]',
      ativo      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_estrutura_regras_prio ON pcp_estrutura_regras (prioridade, id)`);

  // ─── Expedição: gavetas (Fase C do ciclo do pedido) ───────────────────────
  // Peça embalada (baixa) é GUARDADA numa gaveta bipando a etiqueta; a
  // logística consulta onde cada peça está (via /api/integracao) e RETIRA na
  // hora da instalação. Quando todas as peças de um PED-… estão guardadas, o
  // pedido federado avança sozinho para NA_EXPEDICAO no Comercial.
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_gavetas (
      id         BIGSERIAL PRIMARY KEY,
      nome       VARCHAR(60) UNIQUE NOT NULL,
      descricao  VARCHAR(160) NOT NULL DEFAULT '',
      ordem      INTEGER NOT NULL DEFAULT 0,
      ativo      BOOLEAN NOT NULL DEFAULT TRUE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`ALTER TABLE pcp_pecas ADD COLUMN IF NOT EXISTS gaveta_id BIGINT REFERENCES pcp_gavetas(id) ON DELETE SET NULL`);
  await q(`ALTER TABLE pcp_pecas ADD COLUMN IF NOT EXISTS guardada_em TIMESTAMPTZ`);
  await q(`ALTER TABLE pcp_pecas ADD COLUMN IF NOT EXISTS guardada_por BIGINT`);
  await q(`CREATE INDEX IF NOT EXISTS idx_pecas_gaveta ON pcp_pecas (gaveta_id)`);

  // Movimentações da expedição (entrada/transferência/saída por peça)
  await q(`
    CREATE TABLE IF NOT EXISTS pcp_expedicao_log (
      id          BIGSERIAL PRIMARY KEY,
      peca_id     BIGINT REFERENCES pcp_pecas(id) ON DELETE SET NULL,
      codigo      VARCHAR(64),
      pedido      VARCHAR(64),
      gaveta_id   BIGINT REFERENCES pcp_gavetas(id) ON DELETE SET NULL,
      gaveta_nome VARCHAR(60),
      acao        VARCHAR(16) NOT NULL,
      por         BIGINT,
      por_nome    VARCHAR(128),
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_expedicao_log_pedido ON pcp_expedicao_log (pedido)`);
}
