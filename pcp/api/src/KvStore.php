<?php
/**
 * Repositório chave-valor compartilhado do PCP.
 *
 * O frontend persiste documentos JSON por chave (ex.: "pedido:<id>",
 * "estoque:<sku>", "apontamento:<id>", "config:default"). Este repositório
 * fornece as operações list/get/set/delete usadas pela API de storage.
 *
 * @package PersianasParana\PCP
 */

declare(strict_types=1);

class KvStore
{
    private Database $db;

    public function __construct(Database $db)
    {
        $this->db = $db;
    }

    /**
     * Lista as chaves que começam com o prefixo informado.
     *
     * @return string[]
     */
    public function listKeys(string $prefix): array
    {
        if ($prefix === '') {
            return $this->db->fetchColumn('SELECT k FROM kv_store ORDER BY k');
        }
        // Escapa curingas de LIKE no prefixo (defensivo).
        $escaped = str_replace(['\\', '%', '_'], ['\\\\', '\\%', '\\_'], $prefix);
        return $this->db->fetchColumn(
            "SELECT k FROM kv_store WHERE k LIKE :p ESCAPE '\\' ORDER BY k",
            [':p' => $escaped . '%']
        );
    }

    /**
     * Retorna o valor (string JSON) de uma chave, ou null.
     */
    public function get(string $key): ?string
    {
        $row = $this->db->fetchOne('SELECT v FROM kv_store WHERE k = :k', [':k' => $key]);
        return $row === null ? null : (string) $row['v'];
    }

    /**
     * Define (upsert) o valor de uma chave.
     */
    public function set(string $key, string $value, int $userId): void
    {
        // UPSERT compatível com SQLite 3.24+ e MySQL 8 / MariaDB 10.3+.
        $driver = $this->db->pdo()->getAttribute(PDO::ATTR_DRIVER_NAME);
        if ($driver === 'mysql') {
            $sql = 'INSERT INTO kv_store (k, v, updated_at, updated_by)
                    VALUES (:k, :v, CURRENT_TIMESTAMP, :uid)
                    ON DUPLICATE KEY UPDATE v = VALUES(v), updated_at = CURRENT_TIMESTAMP, updated_by = :uid2';
            $this->db->query($sql, [':k' => $key, ':v' => $value, ':uid' => $userId, ':uid2' => $userId]);
        } else {
            $sql = 'INSERT INTO kv_store (k, v, updated_at, updated_by)
                    VALUES (:k, :v, CURRENT_TIMESTAMP, :uid)
                    ON CONFLICT(k) DO UPDATE SET v = excluded.v, updated_at = CURRENT_TIMESTAMP, updated_by = excluded.updated_by';
            $this->db->query($sql, [':k' => $key, ':v' => $value, ':uid' => $userId]);
        }
    }

    /**
     * Remove uma chave. Retorna true se algo foi removido.
     */
    public function delete(string $key): bool
    {
        return $this->db->query('DELETE FROM kv_store WHERE k = :k', [':k' => $key])->rowCount() > 0;
    }
}
