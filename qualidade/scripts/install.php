<?php
/**
 * Script de instalação CLI.
 *
 * Uso:
 *   php scripts/install.php
 *
 * Este script:
 *   1. Verifica requisitos (PHP 8.0+, extensões)
 *   2. Copia config.example.php para config.php (se não existir)
 *   3. Gera secret_key aleatório
 *   4. Cria o banco de dados (SQLite) e schema
 *   5. Cria usuário administrador inicial
 *   6. Define permissões corretas
 *
 * @package PersianasParana\Qualidade
 */

declare(strict_types=1);

if (PHP_SAPI !== 'cli') {
    die("Este script deve ser executado via linha de comando.\n");
}

const BASE = __DIR__ . '/..';

function info(string $msg): void { echo "\033[36m[INFO]\033[0m $msg\n"; }
function ok(string $msg): void { echo "\033[32m[ OK ]\033[0m $msg\n"; }
function warn(string $msg): void { echo "\033[33m[WARN]\033[0m $msg\n"; }
function err(string $msg): void { echo "\033[31m[ERR ]\033[0m $msg\n"; exit(1); }

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

echo "\n";
echo "╔════════════════════════════════════════════════════════════╗\n";
echo "║  Persianas Paraná - Instalação do Sistema de Qualidade    ║\n";
echo "║  v1.0.0                                                    ║\n";
echo "╚════════════════════════════════════════════════════════════╝\n\n";

// ----------------------------------------------------------------------------
// 1. VERIFICA REQUISITOS
// ----------------------------------------------------------------------------
info('Verificando requisitos do sistema...');

if (version_compare(PHP_VERSION, '8.0.0', '<')) {
    err('PHP 8.0+ obrigatório. Versão atual: ' . PHP_VERSION);
}
ok('PHP ' . PHP_VERSION);

$extensoes = ['pdo', 'json', 'mbstring', 'session'];
foreach ($extensoes as $ext) {
    if (!extension_loaded($ext)) {
        err("Extensão PHP obrigatória ausente: $ext");
    }
}
ok('Extensões: ' . implode(', ', $extensoes));

// ----------------------------------------------------------------------------
// 2. CONFIGURAÇÃO
// ----------------------------------------------------------------------------
$configFile = BASE . '/config/config.php';
$exampleFile = BASE . '/config/config.example.php';

if (file_exists($configFile)) {
    warn("config.php já existe. Para reconfigurar, remova-o manualmente primeiro.");
    $resp = ask('Continuar mesmo assim? (s/N)', 'n');
    if (strtolower($resp) !== 's') {
        echo "Instalação cancelada.\n";
        exit(0);
    }
} else {
    info('Criando config.php a partir do exemplo...');
    if (!copy($exampleFile, $configFile)) {
        err("Não foi possível copiar config.example.php para config.php");
    }

    // Gera secret_key seguro
    $secret = bin2hex(random_bytes(32));
    $content = file_get_contents($configFile);
    $content = str_replace('TROCAR_POR_CHAVE_ALEATORIA_DE_64_CARACTERES_HEX', $secret, $content);
    file_put_contents($configFile, $content);
    ok('config.php criado com secret_key gerado aleatoriamente');
}

// ----------------------------------------------------------------------------
// 3. BANCO DE DADOS
// ----------------------------------------------------------------------------
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
    ok('Banco de dados conectado e schema criado');
} catch (Throwable $e) {
    err('Falha ao conectar ao banco: ' . $e->getMessage());
}

// ----------------------------------------------------------------------------
// 4. USUÁRIO ADMINISTRADOR
// ----------------------------------------------------------------------------
$existingUsers = $db->fetchOne('SELECT COUNT(*) AS c FROM users')['c'];

if ((int) $existingUsers > 0) {
    warn("Já existem usuários cadastrados. Pulando criação de admin inicial.");
} else {
    echo "\n";
    info('Vamos criar o usuário administrador inicial.');
    echo "\n";

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
    $confirmPassword = askPassword('Confirme a senha');

    if ($password !== $confirmPassword) {
        err('As senhas não coincidem.');
    }

    $auth = new Auth($db, $config['security']);
    $userId = $auth->createUser($username, $password, $fullName, 'admin');
    ok("Usuário '$username' criado (ID: $userId, role: admin)");
}

// ----------------------------------------------------------------------------
// 5. PERMISSÕES (Linux/macOS)
// ----------------------------------------------------------------------------
if (PHP_OS_FAMILY !== 'Windows') {
    info('Ajustando permissões de arquivos...');
    @chmod($configFile, 0640);
    @chmod($dataDir, 0750);

    $dbFile = $config['database']['sqlite']['path'] ?? null;
    if ($dbFile && file_exists($dbFile)) {
        @chmod($dbFile, 0640);
    }
    ok('Permissões ajustadas (config.php=640, data/=750, db=640)');
}

// ----------------------------------------------------------------------------
// FINAL
// ----------------------------------------------------------------------------
echo "\n";
echo "╔════════════════════════════════════════════════════════════╗\n";
echo "║  Instalação concluída com sucesso!                        ║\n";
echo "╚════════════════════════════════════════════════════════════╝\n\n";
echo "Próximos passos:\n";
echo "  1. Configure o Apache para servir o diretório 'public/'\n";
echo "  2. Garanta que o usuário do Apache (www-data) tenha leitura/escrita em data/\n";
echo "     sudo chown -R www-data:www-data data/\n";
echo "  3. Acesse http://seu-servidor/ no navegador\n";
echo "  4. Faça login com as credenciais cadastradas acima\n";
echo "\n";
echo "Documentação completa: docs/\n\n";
