<?php
/**
 * Autenticação — Backend do PCP.
 *
 * Sessão segura com:
 * - Hash de senha bcrypt (PASSWORD_DEFAULT)
 * - Rate limiting PERSISTIDO em banco por (usuário + IP) — eficaz mesmo sem cookie
 * - Tokens CSRF para operações de escrita
 * - Regeneração de session ID (anti session fixation)
 *
 * Conformidade: OWASP A04 (Insecure Design) e A07 (Auth Failures).
 *
 * @package PersianasParana\PCP
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

        session_name('PERSIANAS_PCPSESS');
        session_start();

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
     * @return array|null Dados do usuário (sem hash) em caso de sucesso.
     */
    public function attempt(string $username, string $password, string $ip = ''): ?array
    {
        $username = trim($username);
        if ($username === '' || $password === '') {
            return null;
        }

        if ($this->isLockedOut($username, $ip)) {
            throw new RuntimeException('Muitas tentativas falhas. Tente novamente em alguns minutos.');
        }

        $user = $this->db->fetchOne(
            'SELECT * FROM users WHERE username = :u AND active = 1',
            [':u' => $username]
        );

        if (!$user || !password_verify($password, $user['password_hash'])) {
            $this->recordFailedAttempt($username, $ip);
            return null;
        }

        // Sucesso: limpa tentativas, regenera sessão
        $this->clearFailedAttempts($username);
        session_regenerate_id(true);

        $_SESSION['user_id']   = (int) $user['id'];
        $_SESSION['username']  = $user['username'];
        $_SESSION['full_name'] = $user['full_name'];
        $_SESSION['role']      = $user['role'];
        $_SESSION['_created']  = time();

        $this->db->query('UPDATE users SET last_login = CURRENT_TIMESTAMP WHERE id = :id', [':id' => $user['id']]);
        $this->audit((int) $user['id'], 'login', $ip);

        unset($user['password_hash']);
        return $user;
    }

    public function logout(): void
    {
        if (!empty($_SESSION['user_id'])) {
            $this->audit((int) $_SESSION['user_id'], 'logout');
        }

        $_SESSION = [];
        if (ini_get('session.use_cookies')) {
            $params = session_get_cookie_params();
            setcookie(session_name(), '', time() - 42000, $params['path'], $params['domain'] ?? '', $params['secure'], $params['httponly']);
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

    // ----------------------------------------------------------------------
    // Rate limiting persistido em banco (por usuário + IP)
    // ----------------------------------------------------------------------

    private function recordFailedAttempt(string $username, string $ip): void
    {
        $this->db->query(
            'INSERT INTO login_attempts (username, ip_address) VALUES (:u, :ip)',
            [':u' => $username, ':ip' => $ip]
        );
    }

    private function clearFailedAttempts(string $username): void
    {
        $this->db->query('DELETE FROM login_attempts WHERE username = :u', [':u' => $username]);
    }

    private function isLockedOut(string $username, string $ip): bool
    {
        $maxAttempts = $this->config['max_login_attempts'] ?? 5;
        $lockout     = $this->config['lockout_duration'] ?? 900;

        // attempted_at é gravado em UTC (CURRENT_TIMESTAMP); compara com limite em UTC.
        $limite = gmdate('Y-m-d H:i:s', time() - $lockout);

        $row = $this->db->fetchOne(
            'SELECT COUNT(*) AS c FROM login_attempts
             WHERE attempted_at >= :lim AND (username = :u OR ip_address = :ip)',
            [':lim' => $limite, ':u' => $username, ':ip' => $ip]
        );
        return ((int) ($row['c'] ?? 0)) >= $maxAttempts;
    }

    private function audit(int $userId, string $action, string $ip = ''): void
    {
        $this->db->query(
            'INSERT INTO audit_log (user_id, action, ip_address) VALUES (:u, :a, :ip)',
            [':u' => $userId, ':a' => $action, ':ip' => $ip]
        );
    }
}
