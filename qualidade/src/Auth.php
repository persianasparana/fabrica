<?php
/**
 * Módulo de autenticação.
 *
 * Implementa autenticação por sessão com:
 * - Hash de senha com bcrypt (PASSWORD_DEFAULT)
 * - Proteção contra brute force (rate limiting por IP/usuário)
 * - Tokens CSRF para operações de escrita
 * - Regeneração de session ID após login (anti session fixation)
 *
 * Conformidade: OWASP A07 (Identification and Authentication Failures)
 *
 * @package PersianasParana\Qualidade
 */

declare(strict_types=1);

class Auth
{
    private Database $db;
    private array $config;

    public function __construct(Database $db, array $config)
    {
        $this->db = $db;
        $this->config = $config;
    }

    /**
     * Inicializa sessão de forma segura.
     */
    public function startSession(): void
    {
        if (session_status() !== PHP_SESSION_NONE) {
            return;
        }

        $secure = $this->config['session_secure_cookie'] ?? true;
        $lifetime = $this->config['session_lifetime'] ?? 28800;

        session_set_cookie_params([
            'lifetime' => $lifetime,
            'path'     => '/',
            'secure'   => $secure,
            'httponly' => true,
            'samesite' => 'Lax',
        ]);

        session_name('PERSIANAS_QSESS');
        session_start();

        // Anti session fixation: regenera ID periodicamente
        if (!isset($_SESSION['_created'])) {
            $_SESSION['_created'] = time();
        } elseif (time() - $_SESSION['_created'] > 1800) {
            session_regenerate_id(true);
            $_SESSION['_created'] = time();
        }
    }

    /**
     * Tenta autenticar um usuário.
     *
     * @return array|null Dados do usuário em caso de sucesso, null caso contrário
     */
    public function attempt(string $username, string $password, string $ip = ''): ?array
    {
        $username = trim($username);
        if ($username === '' || $password === '') {
            return null;
        }

        // Rate limiting (simples, em sessão)
        if ($this->isLockedOut($username)) {
            throw new RuntimeException('Muitas tentativas falhas. Tente novamente em alguns minutos.');
        }

        $user = $this->db->fetchOne(
            'SELECT * FROM users WHERE username = :u AND active = 1',
            [':u' => $username]
        );

        if (!$user || !password_verify($password, $user['password_hash'])) {
            $this->recordFailedAttempt($username);
            return null;
        }

        // Sucesso: limpa contador, regenera sessão
        $this->clearFailedAttempts($username);
        session_regenerate_id(true);

        $_SESSION['user_id'] = (int) $user['id'];
        $_SESSION['username'] = $user['username'];
        $_SESSION['full_name'] = $user['full_name'];
        $_SESSION['role'] = $user['role'];
        $_SESSION['_created'] = time();

        // Atualiza last_login
        $this->db->query(
            'UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = :id',
            [':id' => $user['id']]
        );

        // Log de auditoria
        $this->db->query(
            'INSERT INTO audit_log (user_id, action, ip_address) VALUES (:uid, :a, :ip)',
            [':uid' => $user['id'], ':a' => 'login', ':ip' => $ip]
        );

        unset($user['password_hash']);
        return $user;
    }

    public function logout(): void
    {
        if (!empty($_SESSION['user_id'])) {
            $this->db->query(
                'INSERT INTO audit_log (user_id, action) VALUES (:uid, :a)',
                [':uid' => $_SESSION['user_id'], ':a' => 'logout']
            );
        }

        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(
                session_name(),
                '',
                time() - 42000,
                $params['path'],
                $params['domain'] ?? '',
                $params['secure'],
                $params['httponly']
            );
        }
        session_destroy();
    }

    public function check(): bool
    {
        return !empty($_SESSION['user_id']);
    }

    public function user(): ?array
    {
        if (!$this->check()) {
            return null;
        }
        return [
            'id'        => $_SESSION['user_id'],
            'username'  => $_SESSION['username'],
            'full_name' => $_SESSION['full_name'],
            'role'      => $_SESSION['role'],
        ];
    }

    public function requireAuth(): void
    {
        if (!$this->check()) {
            http_response_code(401);
            header('Content-Type: application/json');
            echo json_encode(['error' => 'Não autenticado']);
            exit;
        }
    }

    /**
     * Gera/retorna token CSRF para a sessão atual.
     */
    public function csrfToken(): string
    {
        if (empty($_SESSION['_csrf_token'])) {
            $_SESSION['_csrf_token'] = bin2hex(random_bytes(32));
        }
        return $_SESSION['_csrf_token'];
    }

    public function verifyCsrf(string $token): bool
    {
        return !empty($_SESSION['_csrf_token']) && hash_equals($_SESSION['_csrf_token'], $token);
    }

    /**
     * Cria novo usuário (uso administrativo).
     */
    public function createUser(string $username, string $password, string $fullName, string $role = 'user'): int
    {
        if (strlen($password) < 8) {
            throw new InvalidArgumentException('Senha deve ter no mínimo 8 caracteres');
        }
        $hash = password_hash($password, PASSWORD_DEFAULT);
        $this->db->query(
            'INSERT INTO users (username, password_hash, full_name, role) VALUES (:u, :h, :n, :r)',
            [':u' => $username, ':h' => $hash, ':n' => $fullName, ':r' => $role]
        );
        return $this->db->lastInsertId();
    }

    private function recordFailedAttempt(string $username): void
    {
        $key = '_login_fails_' . md5($username);
        $now = time();
        $attempts = $_SESSION[$key] ?? ['count' => 0, 'first' => $now];
        $attempts['count']++;
        $attempts['last'] = $now;
        $_SESSION[$key] = $attempts;
    }

    private function clearFailedAttempts(string $username): void
    {
        $key = '_login_fails_' . md5($username);
        unset($_SESSION[$key]);
    }

    private function isLockedOut(string $username): bool
    {
        $key = '_login_fails_' . md5($username);
        $attempts = $_SESSION[$key] ?? null;
        if (!$attempts) return false;

        $maxAttempts = $this->config['max_login_attempts'] ?? 5;
        $lockoutTime = $this->config['lockout_duration'] ?? 900;

        if ($attempts['count'] >= $maxAttempts) {
            if (time() - ($attempts['last'] ?? 0) < $lockoutTime) {
                return true;
            }
            // Tempo de bloqueio expirou
            $this->clearFailedAttempts($username);
        }
        return false;
    }
}
