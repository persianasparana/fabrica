<?php
/**
 * Endpoint: /api/storage.php — PCP
 *
 * Armazenamento chave-valor compartilhado (multiusuário). Requer autenticação.
 *
 *   GET    /api/storage.php?prefix=pedido:   -> { "keys": [...] }
 *   GET    /api/storage.php?key=pedido:123   -> { "value": "<json>" | null }
 *   PUT    /api/storage.php?key=pedido:123   body { "value": "<json>" }  (set)
 *   POST   /api/storage.php?key=pedido:123   body { "value": "<json>" }  (alias de PUT)
 *   DELETE /api/storage.php?key=pedido:123   -> { "ok": true }
 *
 * @package PersianasParana\PCP\Api
 */

declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

$auth->requireAuth();

$store  = new KvStore($db);
$method = $_SERVER['REQUEST_METHOD'];
$user   = $auth->user();
$key    = isset($_GET['key']) ? (string) $_GET['key'] : '';

switch ($method) {
    case 'GET':
        if (array_key_exists('key', $_GET)) {
            respondJson(['value' => $store->get($key)]);
        }
        $prefix = isset($_GET['prefix']) ? (string) $_GET['prefix'] : '';
        respondJson(['keys' => $store->listKeys($prefix)]);
        break;

    case 'PUT':
    case 'POST':
        requireCsrf($auth);
        if ($key === '') {
            respondError('Parâmetro "key" obrigatório', 400);
        }
        $body = readJsonBody();
        if (!array_key_exists('value', $body) || !is_string($body['value'])) {
            respondError('Campo "value" (string) obrigatório', 422);
        }
        // Limite defensivo de tamanho do documento (1 MB).
        if (strlen($body['value']) > 1048576) {
            respondError('Documento muito grande (máx. 1 MB)', 413);
        }
        $store->set($key, $body['value'], (int) $user['id']);
        respondJson(['ok' => true]);
        break;

    case 'DELETE':
        requireCsrf($auth);
        if ($key === '') {
            respondError('Parâmetro "key" obrigatório', 400);
        }
        respondJson(['ok' => $store->delete($key)]);
        break;

    default:
        header('Allow: GET, PUT, POST, DELETE');
        respondError('Método não permitido', 405);
}
