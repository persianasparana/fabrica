<?php
/**
 * Configuração — Backend do PCP (Persianas Paraná)
 *
 * 1. Copie para config.php (cp config.example.php config.php) — ou rode scripts/install.php
 * 2. Ajuste conforme o ambiente
 * 3. NUNCA versione config.php
 *
 * @version 1.0.0
 * @license Proprietary
 */

return [
    'app' => [
        'name'        => 'PCP - Persianas Paraná',
        'version'     => '1.0.0',
        'environment' => 'production',
        'timezone'    => 'America/Sao_Paulo',
        'debug'       => false,
    ],

    'database' => [
        'driver' => 'sqlite', // 'sqlite' ou 'mysql'

        'sqlite' => [
            'path' => __DIR__ . '/../data/pcp.db',
        ],

        'mysql' => [
            'host'     => 'localhost',
            'port'     => 3306,
            'database' => 'persianas_pcp',
            'username' => 'pcp_user',
            'password' => 'CHANGE_ME_STRONG_PASSWORD',
            'charset'  => 'utf8mb4',
        ],
    ],

    'security' => [
        // Gere uma chave: php -r "echo bin2hex(random_bytes(32));"
        'secret_key'             => 'TROCAR_POR_CHAVE_ALEATORIA_DE_64_CARACTERES_HEX',
        'session_lifetime'       => 3600 * 8, // 8 horas
        'session_secure_cookie'  => true,     // true em produção (HTTPS)
        'max_login_attempts'     => 5,
        'lockout_duration'       => 900,      // 15 minutos
    ],
];
