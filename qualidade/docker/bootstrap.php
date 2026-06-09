<?php
/**
 * Bootstrap de container (Docker) — Sistema de Qualidade.
 *
 * Provisiona config.php e o usuário admin a partir de variáveis de ambiente,
 * de forma idempotente. Executado pelo entrypoint antes do Apache subir.
 *
 * Variáveis:
 *   QUALIDADE_ADMIN_USER, QUALIDADE_ADMIN_PASSWORD, QUALIDADE_ADMIN_NAME
 *   PP_INSECURE_COOKIES=1   -> cookies de sessão sem flag Secure (apenas HTTP/dev)
 */

declare(strict_types=1);

$base = dirname(__DIR__);
$configFile  = "$base/config/config.php";
$exampleFile = "$base/config/config.example.php";

if (!file_exists($configFile)) {
    $content = file_get_contents($exampleFile);
    $content = str_replace(
        'TROCAR_POR_CHAVE_ALEATORIA_DE_64_CARACTERES_HEX',
        bin2hex(random_bytes(32)),
        $content
    );
    if (getenv('PP_INSECURE_COOKIES') === '1') {
        $content = str_replace(
            "'session_secure_cookie' => true,",
            "'session_secure_cookie' => false,",
            $content
        );
    }
    file_put_contents($configFile, $content);
    @chmod($configFile, 0640);
    fwrite(STDERR, "[bootstrap] config.php gerado\n");
}

require_once "$base/src/Database.php";
require_once "$base/src/Auth.php";

$config = require $configFile;
$db = Database::getInstance($config['database']);
$auth = new Auth($db, $config['security']);

$user = getenv('QUALIDADE_ADMIN_USER');
$pass = getenv('QUALIDADE_ADMIN_PASSWORD');
if ($user && $pass) {
    $count = (int) $db->fetchOne('SELECT COUNT(*) AS c FROM users')['c'];
    if ($count === 0) {
        $auth->createUser($user, $pass, getenv('QUALIDADE_ADMIN_NAME') ?: $user, 'admin');
        fwrite(STDERR, "[bootstrap] usuário admin '$user' criado\n");
    }
}
