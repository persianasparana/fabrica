<?php
/**
 * Repositório de Não Conformidades.
 *
 * Encapsula todas as operações de persistência relacionadas às NCs.
 * Implementa o padrão Repository (separação de domínio e persistência).
 *
 * @package PersianasParana\Qualidade
 */

declare(strict_types=1);

class NCRepository
{
    private Database $db;

    public function __construct(Database $db)
    {
        $this->db = $db;
    }

    /**
     * Lista todas as NCs com filtros opcionais.
     */
    public function findAll(array $filters = []): array
    {
        $sql = 'SELECT * FROM nao_conformidades WHERE 1=1';
        $params = [];

        if (!empty($filters['status'])) {
            $sql .= ' AND status = :status';
            $params[':status'] = $filters['status'];
        }
        if (!empty($filters['impacto'])) {
            $sql .= ' AND impacto = :impacto';
            $params[':impacto'] = $filters['impacto'];
        }
        if (!empty($filters['data_inicio'])) {
            $sql .= ' AND data_ocorrencia >= :di';
            $params[':di'] = $filters['data_inicio'];
        }
        if (!empty($filters['data_fim'])) {
            $sql .= ' AND data_ocorrencia <= :df';
            $params[':df'] = $filters['data_fim'];
        }

        $sql .= ' ORDER BY data_ocorrencia DESC, id DESC';

        $rows = $this->db->fetchAll($sql, $params);
        return array_map([$this, 'hydrate'], $rows);
    }

    public function find(int $id): ?array
    {
        $row = $this->db->fetchOne('SELECT * FROM nao_conformidades WHERE id = :id', [':id' => $id]);
        return $row ? $this->hydrate($row) : null;
    }

    public function create(array $data, int $userId): int
    {
        $this->validate($data);

        $sql = 'INSERT INTO nao_conformidades
                (pedido, data_ocorrencia, descricao, causa_raiz, acao_imediata, acao_corretiva,
                 impacto, status, responsavel, prazo, setores, origens, created_by)
                VALUES
                (:pedido, :data, :desc, :causa, :ai, :ac, :imp, :st, :resp, :prazo, :set, :ori, :uid)';

        $this->db->query($sql, [
            ':pedido' => $data['pedido'] ?? null,
            ':data'   => $data['data_ocorrencia'],
            ':desc'   => $data['descricao'],
            ':causa'  => $data['causa_raiz'] ?? null,
            ':ai'     => $data['acao_imediata'] ?? null,
            ':ac'     => $data['acao_corretiva'] ?? null,
            ':imp'    => $data['impacto'] ?? 'Médio',
            ':st'     => $data['status'] ?? 'Aberta',
            ':resp'   => $data['responsavel'] ?? null,
            ':prazo'  => $data['prazo'] ?? null,
            ':set'    => json_encode($data['setores'] ?? [], JSON_UNESCAPED_UNICODE),
            ':ori'    => json_encode($data['origens'] ?? [], JSON_UNESCAPED_UNICODE),
            ':uid'    => $userId,
        ]);

        $id = $this->db->lastInsertId();
        $this->logAudit($userId, 'nc.create', $id);
        return $id;
    }

    public function update(int $id, array $data, int $userId): bool
    {
        $existing = $this->find($id);
        if (!$existing) {
            return false;
        }

        $this->validate($data, true);

        $sql = 'UPDATE nao_conformidades SET
                pedido = COALESCE(:pedido, pedido),
                data_ocorrencia = COALESCE(:data, data_ocorrencia),
                descricao = COALESCE(:desc, descricao),
                causa_raiz = COALESCE(:causa, causa_raiz),
                acao_imediata = COALESCE(:ai, acao_imediata),
                acao_corretiva = COALESCE(:ac, acao_corretiva),
                impacto = COALESCE(:imp, impacto),
                status = COALESCE(:st, status),
                responsavel = COALESCE(:resp, responsavel),
                prazo = COALESCE(:prazo, prazo),
                setores = COALESCE(:set, setores),
                origens = COALESCE(:ori, origens),
                updated_at = CURRENT_TIMESTAMP
                WHERE id = :id';

        $this->db->query($sql, [
            ':id'     => $id,
            ':pedido' => $data['pedido'] ?? null,
            ':data'   => $data['data_ocorrencia'] ?? null,
            ':desc'   => $data['descricao'] ?? null,
            ':causa'  => $data['causa_raiz'] ?? null,
            ':ai'     => $data['acao_imediata'] ?? null,
            ':ac'     => $data['acao_corretiva'] ?? null,
            ':imp'    => $data['impacto'] ?? null,
            ':st'     => $data['status'] ?? null,
            ':resp'   => $data['responsavel'] ?? null,
            ':prazo'  => $data['prazo'] ?? null,
            ':set'    => isset($data['setores']) ? json_encode($data['setores'], JSON_UNESCAPED_UNICODE) : null,
            ':ori'    => isset($data['origens']) ? json_encode($data['origens'], JSON_UNESCAPED_UNICODE) : null,
        ]);

        $this->logAudit($userId, 'nc.update', $id);
        return true;
    }

    public function delete(int $id, int $userId): bool
    {
        $stmt = $this->db->query('DELETE FROM nao_conformidades WHERE id = :id', [':id' => $id]);
        if ($stmt->rowCount() > 0) {
            $this->logAudit($userId, 'nc.delete', $id);
            return true;
        }
        return false;
    }

    /**
     * Calcula KPIs agregados.
     */
    public function getKpis(): array
    {
        $total = (int) $this->db->fetchOne('SELECT COUNT(*) AS c FROM nao_conformidades')['c'];
        $abertas = (int) $this->db->fetchOne("SELECT COUNT(*) AS c FROM nao_conformidades WHERE status = 'Aberta'")['c'];
        $andamento = (int) $this->db->fetchOne("SELECT COUNT(*) AS c FROM nao_conformidades WHERE status = 'Em andamento'")['c'];
        $encerradas = (int) $this->db->fetchOne("SELECT COUNT(*) AS c FROM nao_conformidades WHERE status = 'Encerrada'")['c'];
        $alto = (int) $this->db->fetchOne("SELECT COUNT(*) AS c FROM nao_conformidades WHERE impacto = 'Alto'")['c'];
        $medio = (int) $this->db->fetchOne("SELECT COUNT(*) AS c FROM nao_conformidades WHERE impacto = 'Médio'")['c'];
        $baixo = (int) $this->db->fetchOne("SELECT COUNT(*) AS c FROM nao_conformidades WHERE impacto = 'Baixo'")['c'];

        // Origens (precisa percorrer pois é JSON)
        $origens = [];
        $rows = $this->db->fetchAll('SELECT origens FROM nao_conformidades');
        foreach ($rows as $row) {
            $list = json_decode($row['origens'] ?? '[]', true) ?: [];
            foreach ($list as $o) {
                $origens[$o] = ($origens[$o] ?? 0) + 1;
            }
        }
        arsort($origens);

        // Evolução semanal
        $evolucao = $this->db->fetchAll(
            "SELECT data_ocorrencia, COUNT(*) AS c FROM nao_conformidades
             GROUP BY data_ocorrencia ORDER BY data_ocorrencia"
        );

        return [
            'total'      => $total,
            'abertas'    => $abertas,
            'andamento'  => $andamento,
            'encerradas' => $encerradas,
            'taxa_resolucao' => $total > 0 ? round(($encerradas / $total) * 100, 1) : 0,
            'impacto'    => ['Alto' => $alto, 'Médio' => $medio, 'Baixo' => $baixo],
            'origens'    => $origens,
            'evolucao'   => $evolucao,
        ];
    }

    /**
     * Hidrata um registro do banco para o formato da aplicação.
     */
    private function hydrate(array $row): array
    {
        $row['setores'] = json_decode($row['setores'] ?? '[]', true) ?: [];
        $row['origens'] = json_decode($row['origens'] ?? '[]', true) ?: [];
        return $row;
    }

    /**
     * Valida dados de entrada antes de persistir.
     */
    private function validate(array $data, bool $partial = false): void
    {
        if (!$partial) {
            if (empty($data['data_ocorrencia'])) {
                throw new InvalidArgumentException('Data da ocorrência é obrigatória');
            }
            if (empty($data['descricao']) || trim($data['descricao']) === '') {
                throw new InvalidArgumentException('Descrição é obrigatória');
            }
        }

        if (isset($data['data_ocorrencia']) && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['data_ocorrencia'])) {
            throw new InvalidArgumentException('Formato de data inválido (use YYYY-MM-DD)');
        }
        if (isset($data['prazo']) && $data['prazo'] !== '' && !preg_match('/^\d{4}-\d{2}-\d{2}$/', $data['prazo'])) {
            throw new InvalidArgumentException('Formato de prazo inválido');
        }
        if (isset($data['impacto']) && !in_array($data['impacto'], ['Baixo', 'Médio', 'Alto'], true)) {
            throw new InvalidArgumentException('Impacto deve ser Baixo, Médio ou Alto');
        }
        if (isset($data['status']) && !in_array($data['status'], ['Aberta', 'Em andamento', 'Encerrada'], true)) {
            throw new InvalidArgumentException('Status inválido');
        }
        if (isset($data['descricao']) && strlen($data['descricao']) > 5000) {
            throw new InvalidArgumentException('Descrição muito longa (máx 5000 caracteres)');
        }
    }

    private function logAudit(int $userId, string $action, int $entityId): void
    {
        $this->db->query(
            'INSERT INTO audit_log (user_id, action, entity_type, entity_id) VALUES (:u, :a, :t, :e)',
            [':u' => $userId, ':a' => $action, ':t' => 'nc', ':e' => $entityId]
        );
    }
}
