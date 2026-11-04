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

  // Medidas da peça (na unidade do produto: cm, ou m nas PH) — usadas na
  // Ordem de Corte para avaliar as fórmulas e otimizar as barras.
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS largura NUMERIC(10,3)`);
  await q(`ALTER TABLE pcp_itens ADD COLUMN IF NOT EXISTS altura  NUMERIC(10,3)`);

  // Backfill: recupera medidas registradas nas observações no formato
  // "0,985 x 2,37 m" (importações antigas). Idempotente (só onde está NULL).
  await q(`
    UPDATE pcp_itens SET
      largura = REPLACE((regexp_match(observacoes, '(\\d+[.,]\\d+)\\s*x\\s*(\\d+[.,]\\d+)\\s*m', 'i'))[1], ',', '.')::numeric,
      altura  = REPLACE((regexp_match(observacoes, '(\\d+[.,]\\d+)\\s*x\\s*(\\d+[.,]\\d+)\\s*m', 'i'))[2], ',', '.')::numeric
    WHERE largura IS NULL
      AND observacoes ~* '\\d+[.,]\\d+\\s*x\\s*\\d+[.,]\\d+\\s*m'
  `);

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

  // Data-fix PH 25mm: cabeçalho e base vêm em BARRAS de 4,90 m (informado pela
  // fábrica). Marca a barra no corte do cabeçalho e garante o corte da base.
  // Idempotente; o admin pode ajustar depois pela Estrutura do Produto.
  const { rows: ph } = await q(`SELECT id, cortes FROM pcp_produtos WHERE chave = 'ph-25mm'`);
  if (ph[0]) {
    const cortes = ph[0].cortes || [];
    let mudou = false;
    for (const c of cortes) {
      if (/cabe[cç]alho/i.test(c.nome || '') && c.barra == null) { c.barra = 4.9; mudou = true; }
    }
    if (!cortes.some((c) => /base/i.test(c.nome || ''))) {
      const iCab = cortes.findIndex((c) => /cabe[cç]alho/i.test(c.nome || ''));
      cortes.splice(iCab + 1, 0, { nome: 'Base 25mm', formula: 'L', dim: 'L', barra: 4.9 });
      mudou = true;
    }
    if (mudou) {
      await q('UPDATE pcp_produtos SET cortes = $2::jsonb, updated_at = now() WHERE id = $1', [
        ph[0].id, JSON.stringify(cortes),
      ]);
    }
  }
}
