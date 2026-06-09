<?php
/**
 * Endpoint: /api/ncs.php
 *
 * Operações:
 *   GET    /api/ncs.php          - Lista NCs (com filtros via query string)
 *   GET    /api/ncs.php?id=N     - Retorna uma NC específica
 *   POST   /api/ncs.php          - Cria nova NC
 *   PUT    /api/ncs.php?id=N     - Atualiza NC existente
 *   DELETE /api/ncs.php?id=N     - Remove NC
 *
 * Parâmetros de filtro (GET):
 *   ?status=Aberta|Em andamento|Encerrada
 *   ?impacto=Baixo|Médio|Alto
 *   ?data_inicio=YYYY-MM-DD&data_fim=YYYY-MM-DD
 *
 * @package PersianasParana\Qualidade\Api
 */

declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

$auth->requireAuth();

$repo = new NCRepository($db);
$method = $_SERVER['REQUEST_METHOD'];
$id = isset($_GET['id']) ? (int)$_GET['id'] : 0;
$user = $auth->user();

switch ($method) {
    case 'GET':
        if ($id > 0) {
            $nc = $repo->find($id);
            if (!$nc) respondError('NC não encontrada', 404);
            respondJson($nc);
        }

        $filters = [
            'status'      => $_GET['status'] ?? null,
            'impacto'     => $_GET['impacto'] ?? null,
            'data_inicio' => $_GET['data_inicio'] ?? null,
            'data_fim'    => $_GET['data_fim'] ?? null,
        ];
        respondJson(['data' => $repo->findAll(array_filter($filters))]);
        break;

    case 'POST':
        requireCsrf($auth);
        $body = readJsonBody();
        try {
            $newId = $repo->create($body, $user['id']);
            respondJson(['id' => $newId, 'message' => 'NC criada com sucesso'], 201);
        } catch (InvalidArgumentException $e) {
            respondError($e->getMessage(), 422);
        }
        break;

    case 'PUT':
        requireCsrf($auth);
        if ($id <= 0) respondError('ID obrigatório', 400);
        $body = readJsonBody();
        try {
            if ($repo->update($id, $body, $user['id'])) {
                respondJson(['message' => 'NC atualizada com sucesso']);
            }
            respondError('NC não encontrada', 404);
        } catch (InvalidArgumentException $e) {
            respondError($e->getMessage(), 422);
        }
        break;

    case 'DELETE':
        requireCsrf($auth);
        if ($id <= 0) respondError('ID obrigatório', 400);
        if ($repo->delete($id, $user['id'])) {
            respondJson(['message' => 'NC excluída com sucesso']);
        }
        respondError('NC não encontrada', 404);
        break;

    default:
        header('Allow: GET, POST, PUT, DELETE');
        respondError('Método não permitido', 405);
}
