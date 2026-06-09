<?php
/**
 * Endpoint: /api/auth.php — PCP
 *
 *   POST   - Login            { username, password }
 *   DELETE - Logout
 *   GET    - Sessão atual + token CSRF
 *
 * @package PersianasParana\PCP\Api
 */

declare(strict_types=1);

require __DIR__ . '/../../src/bootstrap.php';

$method = $_SERVER['REQUEST_METHOD'];

switch ($method) {
    case 'POST':
        $body = readJsonBody();
        $username = trim((string)($body['username'] ?? ''));
        $password = (string)($body['password'] ?? '');

        if ($username === '' || $password === '') {
            respondError('Usuário e senha são obrigatórios', 400);
        }

        try {
            $user = $auth->attempt($username, $password, clientIp());
        } catch (RuntimeException $e) {
            respondError($e->getMessage(), 429);
        }

        if (!$user) {
            respondError('Credenciais inválidas', 401);
        }

        respondJson(['user' => $user, 'csrf_token' => $auth->csrfToken()]);
        break;

    case 'DELETE':
        $auth->logout();
        respondJson(['ok' => true]);
        break;

    case 'GET':
        if (!$auth->check()) {
            respondError('Não autenticado', 401);
        }
        respondJson(['user' => $auth->user(), 'csrf_token' => $auth->csrfToken()]);
        break;

    default:
        header('Allow: GET, POST, DELETE');
        respondError('Método não permitido', 405);
}
