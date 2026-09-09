<?php
/**
 * GoHarv.® — Defensas del formulario.
 *
 * Capas, en orden de aplicación:
 *   1. Método + Origin/Referer   → bloquea POST cross-site
 *   2. Token CSRF de sesión      → bloquea envíos sin haber cargado el form
 *   3. Honeypot                  → bots que completan todos los campos
 *   4. Trampa de tiempo          → bots que envían al instante
 *   5. Rate limiting por IP      → floods
 *   6. Cloudflare Turnstile      → bots avanzados
 *   7. Validación estricta       → tipos, longitudes y formatos
 *   8. Filtro de spam            → exceso de enlaces y patrones conocidos
 */

declare(strict_types=1);

if (!defined('GOHARV')) {
    http_response_code(403);
    exit('Acceso directo no permitido.');
}

/* ══════════════ 1. Origen ══════════════ */
function gh_origen_valido(array $permitidos): bool
{
    $origen = $_SERVER['HTTP_ORIGIN'] ?? '';

    // Si no hay Origin, caemos a Referer (algunos navegadores lo omiten).
    if ($origen === '' && !empty($_SERVER['HTTP_REFERER'])) {
        $partes = parse_url($_SERVER['HTTP_REFERER']);
        if (isset($partes['scheme'], $partes['host'])) {
            $origen = $partes['scheme'] . '://' . $partes['host']
                . (isset($partes['port']) ? ':' . $partes['port'] : '');
        }
    }

    if ($origen === '') {
        return false;
    }

    foreach ($permitidos as $permitido) {
        if (hash_equals(rtrim($permitido, '/'), rtrim($origen, '/'))) {
            return true;
        }
    }
    return false;
}

/* ══════════════ 2. CSRF ══════════════ */
function gh_csrf_token(): string
{
    if (empty($_SESSION['csrf_token'])) {
        $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        $_SESSION['csrf_emitido'] = time();
    }
    return $_SESSION['csrf_token'];
}

function gh_csrf_valido(string $recibido): bool
{
    if (empty($_SESSION['csrf_token']) || $recibido === '') {
        return false;
    }
    // hash_equals: comparación en tiempo constante, sin filtrar información por timing.
    return hash_equals($_SESSION['csrf_token'], $recibido);
}

/* ══════════════ 4. Trampa de tiempo ══════════════ */
function gh_tiempo_suficiente(int $segundosMinimos): bool
{
    $emitido = $_SESSION['csrf_emitido'] ?? 0;
    if ($emitido === 0) {
        return false;
    }
    return (time() - $emitido) >= $segundosMinimos;
}

/* ══════════════ 5. Rate limiting por IP ══════════════ */

/**
 * Ruta del contador de una IP. La IP se hashea: el archivo no expone
 * direcciones si alguien llegara a listar el directorio.
 */
function gh_rate_archivo(string $ip): string
{
    $dir = gh_dir_logs() . '/rate';
    if (!is_dir($dir)) {
        @mkdir($dir, 0750, true);
    }
    return $dir . '/' . hash('sha256', $ip) . '.txt';
}

/**
 * ¿Esta IP puede enviar? Cuenta los envíos dentro de la ventana.
 * Almacenamiento en archivo: sin base de datos, sin dependencias.
 */
function gh_rate_limit_ok(string $ip, int $max, int $minutos): bool
{
    $archivo = gh_rate_archivo($ip);
    if (!is_file($archivo)) {
        return true;
    }

    $limite = time() - ($minutos * 60);
    $sellos = array_filter(
        array_map('intval', file($archivo, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: []),
        static fn(int $t): bool => $t > $limite
    );

    return count($sellos) < $max;
}

/**
 * Registra un envío. Reescribe el archivo solo con los sellos vigentes,
 * así nunca crece de forma indefinida.
 */
function gh_registrar_intento(string $ip, int $minutos): void
{
    $archivo = gh_rate_archivo($ip);
    $ahora   = time();
    $limite  = $ahora - ($minutos * 60);

    $sellos = is_file($archivo)
        ? array_filter(
            array_map('intval', file($archivo, FILE_IGNORE_NEW_LINES | FILE_SKIP_EMPTY_LINES) ?: []),
            static fn(int $t): bool => $t > $limite
        )
        : [];

    $sellos[] = $ahora;

    // LOCK_EX evita que dos envíos simultáneos se pisen el archivo.
    @file_put_contents($archivo, implode("\n", $sellos) . "\n", LOCK_EX);

    gh_limpiar_rate();
}

/**
 * Borra contadores sin actividad en 24 h. Se ejecuta de forma oportunista
 * (1 de cada 20 envíos) para no recorrer el directorio en cada request.
 */
function gh_limpiar_rate(): void
{
    if (random_int(1, 20) !== 1) {
        return;
    }
    $dir = gh_dir_logs() . '/rate';
    $limite = time() - 86400;
    foreach (glob($dir . '/*.txt') ?: [] as $archivo) {
        if (@filemtime($archivo) < $limite) {
            @unlink($archivo);
        }
    }
}

/* ══════════════ 5b. Respaldo local de contactos ══════════════ */

/**
 * Archiva el CSV cuando supera el tamaño maximo y empieza uno nuevo.
 *
 * El archivo crece con cada contacto y nunca se limpia solo. En vez de
 * esperar a que alguien lo note, al pasar el limite se renombra con la
 * fecha y el siguiente contacto arranca uno limpio: no se pierde nada y
 * el archivo activo se mantiene manejable.
 *
 * Es silencioso a proposito: solo deja constancia en app.log. Es una tarea
 * de mantenimiento, no algo que quien recibe los contactos deba atender.
 */
function gh_rotar_csv(string $archivo, float $maxMB): void
{
    if ($maxMB <= 0 || !is_file($archivo)) {
        return;
    }

    /* PHP cachea el resultado de filesize(): si el archivo cambio de tamaño
       durante esta misma peticion, devolveria el valor viejo y el archivado
       no se dispararia cuando corresponde. */
    clearstatcache(true, $archivo);

    if (filesize($archivo) < $maxMB * 1048576) {
        return;
    }

    $destino = dirname($archivo) . '/contactos-' . date('Y-m-d_His') . '.csv';

    if (@rename($archivo, $destino)) {
        gh_log('Respaldo de contactos archivado: ' . basename($destino));
        return;
    }

    gh_log('No se pudo archivar el respaldo de contactos.');
}

/**
 * Guarda el contacto en un CSV local ANTES de intentar el envío.
 *
 * Sin base de datos, el email es el único registro que queda: si Gmail está
 * caído o la App Password vence, el contacto se pierde y nadie se entera.
 * Este CSV es la red de seguridad. Se puede desactivar en config.php.
 */
function gh_respaldar_contacto(array $campos, string $ip): void
{
    $archivo = gh_dir_logs() . '/contactos.csv';

    /* Se comprueba ANTES de escribir: si toca archivar, esta fila ya
       inaugura el archivo nuevo. */
    gh_rotar_csv($archivo, gh_config_csv_max());

    $nuevo = !is_file($archivo);

    $fh = @fopen($archivo, 'a');
    if ($fh === false) {
        gh_log('No se pudo abrir el respaldo de contactos.');
        return;
    }

    if (flock($fh, LOCK_EX)) {
        if ($nuevo) {
            // BOM para que Excel abra los acentos correctamente.
            fwrite($fh, "\xEF\xBB\xBF");
            fputcsv($fh, ['fecha', 'nombre', 'apellido', 'empresa', 'email',
                          'telefono', 'pais', 'mensaje', 'ip']);
        }
        fputcsv($fh, [
            date('Y-m-d H:i:s'),
            $campos['nombre'], $campos['apellido'], $campos['empresa'],
            $campos['email'],  $campos['telefono'], $campos['pais'],
            $campos['mensaje'], $ip,
        ]);
        flock($fh, LOCK_UN);
    }
    fclose($fh);
}

/* ══════════════ 6. Cloudflare Turnstile ══════════════ */
function gh_turnstile_ok(string $secret, string $token, string $ip): bool
{
    // Sin secret configurado (entorno local) se omite la verificación.
    if ($secret === '') {
        return true;
    }
    if ($token === '') {
        return false;
    }

    $ch = curl_init('https://challenges.cloudflare.com/turnstile/v0/siteverify');
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_TIMEOUT        => 10,
        CURLOPT_POST           => true,
        CURLOPT_POSTFIELDS     => http_build_query([
            'secret'   => $secret,
            'response' => $token,
            'remoteip' => $ip,
        ]),
    ]);
    $respuesta = curl_exec($ch);
    $error     = curl_error($ch);
    curl_close($ch);

    if ($respuesta === false) {
        gh_log("Turnstile inaccesible: $error");
        return false;   // ante la duda, rechazar
    }

    $datos = json_decode($respuesta, true);
    return ($datos['success'] ?? false) === true;
}

/* ══════════════ 7. Validación ══════════════ */

/**
 * Rechaza texto que no sea UTF-8 válido.
 *
 * Imprescindible: preg_replace() con el modificador /u devuelve NULL ante
 * bytes mal formados, y sin este control el script moría con un fatal error.
 * Un atacante podía forzar un 500 mandando bytes inválidos a propósito.
 */
function gh_utf8_valido(string $valor): bool
{
    return $valor === '' || mb_check_encoding($valor, 'UTF-8');
}

/**
 * Valida un campo de texto. Devuelve el valor limpio o null si es inválido.
 * IMPORTANTE: NO aplica htmlspecialchars — el escapado va en la salida,
 * no en la entrada. Así se conserva "O'Brien", no "O&#039;Brien".
 */
function gh_texto(string $valor, int $min, int $max, ?string $patron = null): ?string
{
    if (!gh_utf8_valido($valor)) {
        return null;
    }

    // Normaliza espacios y elimina caracteres de control (incl. saltos de línea
    // usados para header injection).
    $valor = trim(preg_replace('/[\x00-\x1F\x7F]+/u', ' ', $valor) ?? '');
    $valor = preg_replace('/\s+/u', ' ', $valor) ?? '';

    $largo = mb_strlen($valor, 'UTF-8');
    if ($largo < $min || $largo > $max) {
        return null;
    }
    if ($patron !== null && !preg_match($patron, $valor)) {
        return null;
    }
    return $valor;
}

function gh_texto_largo(string $valor, int $min, int $max): ?string
{
    if (!gh_utf8_valido($valor)) {
        return null;
    }

    // Igual que gh_texto pero conserva los saltos de línea del mensaje.
    $valor = trim(preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]+/u', '', $valor) ?? '');

    $largo = mb_strlen($valor, 'UTF-8');
    if ($largo < $min || $largo > $max) {
        return null;
    }
    return $valor;
}

function gh_email(string $valor): ?string
{
    $valor = trim($valor);

    // Un email jamás contiene saltos de línea: cortan header injection de raíz.
    if (preg_match('/[\r\n]/', $valor)) {
        return null;
    }
    if (mb_strlen($valor) > 254) {
        return null;
    }
    $valor = filter_var($valor, FILTER_SANITIZE_EMAIL);
    if (!filter_var($valor, FILTER_VALIDATE_EMAIL)) {
        return null;
    }
    return $valor;
}

/* ══════════════ 8. Filtro de spam ══════════════ */
function gh_parece_spam(string $mensaje, string $nombre, int $maxEnlaces): bool
{
    // Exceso de enlaces: la firma más fiable de spam en formularios.
    $enlaces = preg_match_all('#https?://|www\.#i', $mensaje);
    if ($enlaces > $maxEnlaces) {
        return true;
    }

    // BBCode/HTML: ningún humano lo escribe en un formulario de contacto.
    if (preg_match('/\[url[=\]]|<a\s+href/i', $mensaje)) {
        return true;
    }

    $patrones = [
        '/\b(viagra|cialis|casino|porn|xxx|crypto\s*giveaway)\b/i',
        '/\b(seo\s+services|backlinks?|guest\s+post|link\s+building)\b/i',
        '/\b(loan|bitcoin\s+invest|forex\s+signal)\b/i',
    ];
    foreach ($patrones as $patron) {
        if (preg_match($patron, $mensaje) || preg_match($patron, $nombre)) {
            return true;
        }
    }

    // Cirílico en un sitio ES/EN/PT: casi siempre spam automatizado.
    if (preg_match('/\p{Cyrillic}{4,}/u', $mensaje)) {
        return true;
    }

    return false;
}
