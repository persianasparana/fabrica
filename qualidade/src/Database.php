<?php
/**
 * Camada de acesso a banco de dados.
 *
 * Encapsula PDO com suporte a SQLite e MySQL.
 * Implementa padrão singleton para reuso da conexão.
 *
 * Boas práticas aplicadas:
 * - Prepared statements obrigatórios (anti SQL Injection - OWASP A03)
 * - Modo de erro PDO::ERRMODE_EXCEPTION
 * - Charset UTF-8 enforced
 * - Conexão lazy (criada apenas quando necessária)
 *
 * @package PersianasParana\Qualidade
 */

declare(strict_types=1);

class Database
{
    private static ?self $instance = null;
    private PDO $pdo;
    private array $config;

    private function __construct(array $config)
    {
        $this->config = $config;
        $this->connect();
        $this->createSchema();
    }

    public static function getInstance(?array $config = null): self
    {
        if (self::$instance === null) {
            if ($config === null) {
                throw new RuntimeException('Configuração obrigatória na primeira chamada');
            }
            self::$instance = new self($config);
        }
        return self::$instance;
    }

    private function connect(): void
    {
        $driver = $this->config['driver'];

        try {
            if ($driver === 'sqlite') {
                $path = $this->config['sqlite']['path'];
                $dir = dirname($path);
                if (!is_dir($dir)) {
                    mkdir($dir, 0750, true);
                }
                $this->pdo = new PDO('sqlite:' . $path);
                $this->pdo->exec('PRAGMA foreign_keys = ON');
                $this->pdo->exec('PRAGMA journal_mode = WAL');
            } elseif ($driver === 'mysql') {
                $cfg = $this->config['mysql'];
                $dsn = sprintf(
                    'mysql:host=%s;port=%d;dbname=%s;charset=%s',
                    $cfg['host'],
                    $cfg['port'],
                    $cfg['database'],
                    $cfg['charset']
                );
                $this->pdo = new PDO($dsn, $cfg['username'], $cfg['password']);
            } else {
                throw new RuntimeException("Driver não suportado: {$driver}");
            }

            $this->pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->pdo->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            $this->pdo->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
        } catch (PDOException $e) {
            error_log('[DB] Falha de conexão: ' . $e->getMessage());
            throw new RuntimeException('Erro ao conectar ao banco de dados', 0, $e);
        }
    }

    /**
     * Cria as tabelas se não existirem (idempotente).
     */
    private function createSchema(): void
    {
        $isMysql = $this->config['driver'] === 'mysql';
        $autoInc = $isMysql ? 'BIGINT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        $textType = $isMysql ? 'TEXT' : 'TEXT';
        $tsType = $isMysql ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : 'TEXT DEFAULT CURRENT_TIMESTAMP';

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id $autoInc,
                username VARCHAR(64) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(128) NOT NULL,
                role VARCHAR(32) NOT NULL DEFAULT 'user',
                active INTEGER NOT NULL DEFAULT 1,
                created_at $tsType,
                last_login $textType
            )
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS nao_conformidades (
                id $autoInc,
                pedido VARCHAR(64),
                data_ocorrencia DATE NOT NULL,
                descricao $textType NOT NULL,
                causa_raiz $textType,
                acao_imediata $textType,
                acao_corretiva $textType,
                impacto VARCHAR(16) NOT NULL DEFAULT 'Médio',
                status VARCHAR(32) NOT NULL DEFAULT 'Aberta',
                responsavel VARCHAR(128),
                prazo DATE,
                setores $textType,
                origens $textType,
                created_by INTEGER,
                created_at $tsType,
                updated_at $tsType,
                FOREIGN KEY (created_by) REFERENCES users(id)
            )
        ");

        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS audit_log (
                id $autoInc,
                user_id INTEGER,
                action VARCHAR(64) NOT NULL,
                entity_type VARCHAR(32),
                entity_id INTEGER,
                details $textType,
                ip_address VARCHAR(45),
                created_at $tsType
            )
        ");

        $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_nc_data ON nao_conformidades(data_ocorrencia)");
        $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_nc_status ON nao_conformidades(status)");
        $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_nc_impacto ON nao_conformidades(impacto)");
    }

    public function pdo(): PDO
    {
        return $this->pdo;
    }

    public function query(string $sql, array $params = []): PDOStatement
    {
        $stmt = $this->pdo->prepare($sql);
        $stmt->execute($params);
        return $stmt;
    }

    public function fetchOne(string $sql, array $params = []): ?array
    {
        $row = $this->query($sql, $params)->fetch();
        return $row === false ? null : $row;
    }

    public function fetchAll(string $sql, array $params = []): array
    {
        return $this->query($sql, $params)->fetchAll();
    }

    public function lastInsertId(): int
    {
        return (int) $this->pdo->lastInsertId();
    }

    public function beginTransaction(): void { $this->pdo->beginTransaction(); }
    public function commit(): void { $this->pdo->commit(); }
    public function rollBack(): void { $this->pdo->rollBack(); }
}
