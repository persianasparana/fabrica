<?php
/**
 * Bootstrap da aplicação.
 *
 * Carregado por todos os endpoints da API. Configura ambiente,
 * autoload, conexão de banco, autenticação e cabeçalhos HTTP.
 *
 * @package PersianasParana\Qualidade
 */

declare(strict_types=1);

// Configuração regional
date_default_timezone_set('America/Sao_Paulo');
mb_internal_encoding('UTF-8');

// Caminho base do projeto
define('BASE_PATH', dirname(__DIR__, 2));

// Carrega configuração
$configFile = BASE_PATH . '/config/config.php';
if (!file_exists($configFile)) {
    http_response_code(500);
    header('Content-Type: application/json');
    echo json_encode(['error' => 'Sistema não configurado. Execute o instalador.']);
    exit;
}

$config = require $configFile;

// Tratamento de erros
if (($config['app']['debug'] ?? false) === true) {
    error_reporting(E_ALL);
    ini_set('display_errors', '1');
} else {
    error_reporting(E_ALL);
    ini_set('display_errors', '0');
    ini_set('log_errors', '1');
}

// Autoload simples (sem composer)
spl_autoload_register(function ($class) {
    $file = BASE_PATH . '/src/' . $class . '.php';
    if (file_exists($file)) {
        require_once $file;
    }
});

// Cabeçalhos de segurança (OWASP)
header('X-Content-Type-Options: nosniff');
header('X-Frame-Options: DENY');
header('Referrer-Policy: strict-origin-when-cross-origin');
header('Permissions-Policy: geolocation=(), microphone=(), camera=()');
header('Content-Type: application/json; charset=utf-8');

// Inicializa banco e autenticação
try {
    $db = Database::getInstance($config['database']);
    $auth = new Auth($db, $config['security']);
    $auth->startSession();
} catch (Throwable $e) {
    error_log('[BOOTSTRAP] ' . $e->getMessage());
    http_response_code(500);
    echo json_encode(['error' => 'Erro interno do servidor']);
    exit;
}

/**
 * Lê o corpo JSON da requisição.
 */
function readJsonBody(): array
{
    $raw = file_get_contents('php://input');
    if ($raw === false || $raw === '') {
        return [];
    }
    $data = json_decode($raw, true);
    if (json_last_error() !== JSON_ERROR_NONE) {
        respondError('JSON inválido no corpo da requisição', 400);
    }
    return is_array($data) ? $data : [];
}

/**
 * Resposta JSON padronizada.
 */
function respondJson(mixed $data, int $code = 200): void
{
    http_response_code($code);
    echo json_encode($data, JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    exit;
}

function respondError(string $message, int $code = 400, array $extra = []): void
{
    respondJson(array_merge(['error' => $message], $extra), $code);
}

/**
 * Verifica método HTTP esperado.
 */
function requireMethod(string|array $methods): void
{
    $methods = is_array($methods) ? $methods : [$methods];
    $current = $_SERVER['REQUEST_METHOD'] ?? 'GET';
    if (!in_array($current, $methods, true)) {
        header('Allow: ' . implode(', ', $methods));
        respondError('Método não permitido', 405);
    }
}

/**
 * Verifica token CSRF para operações que alteram estado.
 */
function requireCsrf(Auth $auth): void
{
    $token = $_SERVER['HTTP_X_CSRF_TOKEN'] ?? '';
    if (!$auth->verifyCsrf($token)) {
        respondError('Token CSRF inválido ou ausente', 403);
    }
}

/**
 * IP do cliente (considerando proxies confiáveis).
 */
function clientIp(): string
{
    return $_SERVER['REMOTE_ADDR'] ?? '';
}
