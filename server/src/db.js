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
      cod_barras    VARCHAR(64),
      created_by    BIGINT,
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
  await q(`CREATE INDEX IF NOT EXISTS idx_itens_pedido ON pcp_itens (pedido)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_itens_data_cliente ON pcp_itens (data_cliente)`);
  await q(`CREATE INDEX IF NOT EXISTS idx_itens_cod_barras ON pcp_itens (cod_barras)`);

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
}
