<?php
/**
 * GoHarv.® — Arranque común: configuración, sesión y conexión a DB.
 */

declare(strict_types=1);

if (!defined('GOHARV')) {
    define('GOHARV', true);
}

/* ─────────── Configuración ─────────── */
$rutaConfig = __DIR__ . '/../config.php';
if (!is_file($rutaConfig)) {
    http_response_code(500);
    exit('Falta config.php — copiá config.example.php y completá los valores.');
}
$config = require $rutaConfig;

$esProd = ($config['entorno'] ?? 'prod') === 'prod';

/* En producción los errores van al log, nunca a la respuesta. */
ini_set('display_errors', $esProd ? '0' : '1');
error_reporting(E_ALL);

/* ─────────── Sesión endurecida ─────────── */
if (session_status() === PHP_SESSION_NONE) {
    $https = (!empty($_SERVER['HTTPS']) && $_SERVER['HTTPS'] !== 'off')
        || (($_SERVER['HTTP_X_FORWARDED_PROTO'] ?? '') === 'https');

    session_set_cookie_params([
        'lifetime' => 0,
        'path'     => '/',
        'secure'   => $https,   // solo por HTTPS cuando está disponible
        'httponly' => true,     // inaccesible desde JavaScript
        'samesite' => 'Lax',    // el navegador no la manda en POST cross-site
    ]);
    session_start();
}

/* ─────────── Log de errores propio ─────────── */
/**
 * Devuelve la carpeta de logs, creándola con su propio .htaccess.
 *
 * El .htaccess local es imprescindible: logs/contactos.csv guarda datos
 * personales y la carpeta se crea sola en tiempo de ejecución. Sin esto,
 * quedaría descargable por URL si el .htaccess raíz falla o Apache corre
 * con AllowOverride limitado.
 */
function gh_dir_logs(): string
{
    $dir = __DIR__ . '/../logs';

    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    if (!is_file($dir . '/.htaccess')) {
        @file_put_contents($dir . '/.htaccess',
            "<IfModule mod_authz_core.c>\n    Require all denied\n</IfModule>\n" .
            "<IfModule !mod_authz_core.c>\n    Order allow,deny\n    Deny from all\n</IfModule>\n"
        );
    }

    return $dir;
}

function gh_log(string $mensaje): void
{
    @file_put_contents(
        gh_dir_logs() . '/app.log',
        sprintf("[%s] %s\n", date('Y-m-d H:i:s'), $mensaje),
        FILE_APPEND | LOCK_EX
    );
}

/* ─────────── Respuesta JSON y fin ─────────── */
function gh_json(array $datos, int $codigo = 200): never
{
    http_response_code($codigo);
    header('Content-Type: application/json; charset=utf-8');
    header('X-Content-Type-Options: nosniff');
    echo json_encode($datos, JSON_UNESCAPED_UNICODE);
    exit;
}

/* ─────────── IP real del cliente ─────────── */
function gh_ip(): string
{
    // Detrás de Cloudflare / proxy inverso de confianza.
    foreach (['HTTP_CF_CONNECTING_IP', 'HTTP_X_REAL_IP'] as $cabecera) {
        if (!empty($_SERVER[$cabecera]) && filter_var($_SERVER[$cabecera], FILTER_VALIDATE_IP)) {
            return $_SERVER[$cabecera];
        }
    }
    return $_SERVER['REMOTE_ADDR'] ?? '0.0.0.0';
}

/**
 * Tamaño maximo del CSV de contactos, en MB, leido de config.php.
 * 0 desactiva el archivado.
 */
function gh_config_csv_max(): float
{
    static $valor = null;
    if ($valor === null) {
        $cfg = require __DIR__ . '/../config.php';
        $valor = (float)($cfg['antispam']['max_csv_mb'] ?? 5);
    }
    return $valor;
}
