<?php
/**
 * Camada de acesso a banco de dados — Backend do PCP.
 *
 * Encapsula PDO com suporte a SQLite e MySQL (padrão singleton).
 *
 * Boas práticas:
 * - Prepared statements obrigatórios (anti SQL Injection — OWASP A03)
 * - PDO::ERRMODE_EXCEPTION, sem emulação de prepares
 * - Conexão lazy + schema idempotente
 *
 * @package PersianasParana\PCP
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
        $isMysql  = $this->config['driver'] === 'mysql';
        $autoInc  = $isMysql ? 'BIGINT AUTO_INCREMENT PRIMARY KEY' : 'INTEGER PRIMARY KEY AUTOINCREMENT';
        $tsType   = $isMysql ? 'TIMESTAMP DEFAULT CURRENT_TIMESTAMP' : 'TEXT DEFAULT CURRENT_TIMESTAMP';
        $longText = $isMysql ? 'LONGTEXT' : 'TEXT';

        // Usuários
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS users (
                id $autoInc,
                username VARCHAR(64) UNIQUE NOT NULL,
                password_hash VARCHAR(255) NOT NULL,
                full_name VARCHAR(128) NOT NULL,
                role VARCHAR(32) NOT NULL DEFAULT 'user',
                active INTEGER NOT NULL DEFAULT 1,
                created_at $tsType,
                last_login TEXT
            )
        ");

        // Armazenamento chave-valor compartilhado (dados do PCP).
        // O frontend grava blobs JSON por chave (ex.: "pedido:<id>", "estoque:<sku>").
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS kv_store (
                k VARCHAR(255) PRIMARY KEY,
                v $longText NOT NULL,
                updated_at $tsType,
                updated_by INTEGER
            )
        ");

        // Tentativas de login (rate limiting persistido — OWASP A04/A07)
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS login_attempts (
                id $autoInc,
                username VARCHAR(64) NOT NULL,
                ip_address VARCHAR(45),
                attempted_at $tsType
            )
        ");

        // Auditoria de operações sensíveis
        $this->pdo->exec("
            CREATE TABLE IF NOT EXISTS audit_log (
                id $autoInc,
                user_id INTEGER,
                action VARCHAR(64) NOT NULL,
                details TEXT,
                ip_address VARCHAR(45),
                created_at $tsType
            )
        ");

        $this->pdo->exec("CREATE INDEX IF NOT EXISTS idx_attempts ON login_attempts(username, attempted_at)");
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

    public function fetchColumn(string $sql, array $params = []): array
    {
        return $this->query($sql, $params)->fetchAll(PDO::FETCH_COLUMN);
    }

    public function lastInsertId(): int
    {
        return (int) $this->pdo->lastInsertId();
    }
}
