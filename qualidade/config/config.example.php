<?php
/**
 * Arquivo de Configuração - Sistema de Gestão de Não Conformidades
 * Persianas Paraná
 *
 * INSTRUÇÕES:
 * 1. Copie este arquivo para config.php (cp config.example.php config.php)
 * 2. Ajuste as configurações conforme o ambiente
 * 3. NUNCA versione o config.php em repositórios públicos
 *
 * @author  Equipe TI Persianas Paraná
 * @version 1.0.0
 * @license Proprietary
 */

return [
    // ========================================================================
    // AMBIENTE
    // ========================================================================
    'app' => [
        'name'        => 'Sistema de Gestão de NCs - Persianas Paraná',
        'version'     => '1.0.0',
        'environment' => 'production', // 'production' | 'development'
        'timezone'    => 'America/Sao_Paulo',
        'debug'       => false,        // true apenas em desenvolvimento
    ],

    // ========================================================================
    // BANCO DE DADOS
    // Suporta SQLite (padrão, sem instalação) ou MySQL/MariaDB
    // ========================================================================
    'database' => [
        'driver' => 'sqlite', // 'sqlite' ou 'mysql'

        // SQLite (padrão recomendado para até ~50 usuários)
        'sqlite' => [
            'path' => __DIR__ . '/../data/qualidade.db',
        ],

        // MySQL/MariaDB (para volumes maiores)
        'mysql' => [
            'host'     => 'localhost',
            'port'     => 3306,
            'database' => 'persianas_qualidade',
            'username' => 'qualidade_user',
            'password' => 'CHANGE_ME_STRONG_PASSWORD',
            'charset'  => 'utf8mb4',
        ],
    ],

    // ========================================================================
    // SEGURANÇA
    // ========================================================================
    'security' => [
        // Chave secreta para tokens CSRF e sessão. GERE UMA NOVA NA INSTALAÇÃO!
        // Comando: php -r "echo bin2hex(random_bytes(32));"
        'secret_key' => 'TROCAR_POR_CHAVE_ALEATORIA_DE_64_CARACTERES_HEX',

        // Tempo de inatividade da sessão (segundos)
        'session_lifetime' => 3600 * 8, // 8 horas

        // Cookie de sessão apenas via HTTPS (true em produção)
        'session_secure_cookie' => true,

        // Tentativas de login antes de bloqueio temporário
        'max_login_attempts' => 5,
        'lockout_duration'   => 900, // 15 minutos
    ],

    // ========================================================================
    // LOGS
    // ========================================================================
    'logging' => [
        'enabled'   => true,
        'path'      => __DIR__ . '/../data/logs',
        'level'     => 'info', // 'debug' | 'info' | 'warning' | 'error'
        'max_files' => 30,     // dias de retenção
    ],

    // ========================================================================
    // SETORES DA EMPRESA (customizável)
    // ========================================================================
    'setores' => [
        'Comercial',
        'Fábrica',
        'Instalação',
        'Produto',
        'Fornecedor',
        'Logística',
        'PCP',
        'Expedição',
        'Compras/Almox',
    ],
];
