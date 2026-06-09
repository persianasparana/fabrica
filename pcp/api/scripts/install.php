<?php
/**
 * Instalador CLI — Backend do PCP.
 *
 * Uso: php scripts/install.php
 *
 *   1. Verifica requisitos (PHP 8.0+, extensões)
 *   2. Cria config.php a partir do exemplo + secret_key aleatório
 *   3. Cria o banco e o schema
 *   4. Cria o usuário administrador inicial
 *   5. Ajusta permissões
 *
 * @package PersianasParana\PCP
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    die("Este script deve ser executado via linha de comando.\n");
}

const BASE = __DIR__ . '/..';

function info(string $m): void { echo "\033[36m[INFO]\033[0m $m\n"; }
function ok(string $m): void { echo "\033[32m[ OK ]\033[0m $m\n"; }
function warn(string $m): void { echo "\033[33m[WARN]\033[0m $m\n"; }
function err(string $m): void { echo "\033[31m[ERR ]\033[0m $m\n"; exit(1); }

function ask(string $prompt, string $default = ''): string
{
    echo $prompt . ($default ? " [$default]" : '') . ': ';
    $line = trim((string) fgets(STDIN));
    return $line === '' ? $default : $line;
}

function askPassword(string $prompt): string
{
    echo $prompt . ': ';
    if (PHP_OS_FAMILY === 'Windows') {
        $pwd = trim((string) fgets(STDIN));
    } else {
        system('stty -echo');
        $pwd = trim((string) fgets(STDIN));
        system('stty echo');
        echo "\n";
    }
    return $pwd;
}

echo "\n== Persianas Paraná — Instalação do Backend do PCP (v1.0.0) ==\n\n";

info('Verificando requisitos...');
if (version_compare(PHP_VERSION, '8.0.0', '<')) {
    err('PHP 8.0+ obrigatório. Versão atual: ' . PHP_VERSION);
}
ok('PHP ' . PHP_VERSION);

foreach (['pdo', 'json', 'mbstring', 'session'] as $ext) {
    if (!extension_loaded($ext)) {
        err("Extensão PHP obrigatória ausente: $ext");
    }
}
ok('Extensões necessárias presentes');

$configFile  = BASE . '/config/config.php';
$exampleFile = BASE . '/config/config.example.php';

if (file_exists($configFile)) {
    warn('config.php já existe — pulando criação.');
} else {
    if (!copy($exampleFile, $configFile)) {
        err('Não foi possível criar config.php');
    }
    $secret = bin2hex(random_bytes(32));
    $content = str_replace('TROCAR_POR_CHAVE_ALEATORIA_DE_64_CARACTERES_HEX', $secret, file_get_contents($configFile));
    file_put_contents($configFile, $content);
    ok('config.php criado com secret_key aleatório');
}

info('Inicializando banco de dados...');
$dataDir = BASE . '/data';
if (!is_dir($dataDir)) {
    mkdir($dataDir, 0750, true);
}

require_once BASE . '/src/Database.php';
require_once BASE . '/src/Auth.php';

$config = require $configFile;
try {
    $db = Database::getInstance($config['database']);
    ok('Banco conectado e schema criado');
} catch (Throwable $e) {
    err('Falha ao conectar: ' . $e->getMessage());
}

$existing = (int) $db->fetchOne('SELECT COUNT(*) AS c FROM users')['c'];
if ($existing > 0) {
    warn('Já existem usuários — pulando criação de admin.');
} else {
    echo "\n";
    info('Criação do usuário administrador inicial.');
    $username = '';
    while ($username === '') {
        $username = ask('Nome de usuário (login)');
    }
    $fullName = ask('Nome completo', $username);

    $password = '';
    while (strlen($password) < 8) {
        $password = askPassword('Senha (mínimo 8 caracteres)');
        if (strlen($password) < 8) {
            warn('A senha deve ter pelo menos 8 caracteres');
        }
    }
    if ($password !== askPassword('Confirme a senha')) {
        err('As senhas não coincidem.');
    }

    $auth = new Auth($db, $config['security']);
    $id = $auth->createUser($username, $password, $fullName, 'admin');
    ok("Usuário '$username' criado (ID: $id, role: admin)");
}

if (PHP_OS_FAMILY !== 'Windows') {
    @chmod($configFile, 0640);
    @chmod($dataDir, 0750);
    $dbFile = $config['database']['sqlite']['path'] ?? null;
    if ($dbFile && file_exists($dbFile)) {
        @chmod($dbFile, 0640);
    }
    ok('Permissões ajustadas');
}

echo "\n== Instalação concluída! ==\n";
echo "Configure o servidor web para servir 'public/' e garanta escrita em 'data/'.\n";
echo "O frontend (pcp/frontend) deve acessar este backend em /api/ na mesma origem.\n\n";
