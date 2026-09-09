<?php
/**
 * GoHarv.® — Procesamiento del formulario de contacto.
 *
 * Responde SIEMPRE en JSON: { ok: bool, codigo: string, mensaje: string }
 *
 * No usa base de datos: el contacto se envía por email y queda respaldado en
 * logs/contactos.csv (red de seguridad por si falla el SMTP).
 *
 * Seguridad:
 *   · XSS      → se valida el dato crudo y se escapa al construir el email
 *   · Headers  → saltos de línea rechazados en email y campos de texto
 *   · CSRF     → token de sesión + validación de Origin/Referer
 *   · Spam     → honeypot, trampa de tiempo, rate limit por IP, Turnstile,
 *                filtro de enlaces y patrones
 */

declare(strict_types=1);

use PHPMailer\PHPMailer\PHPMailer;
use PHPMailer\PHPMailer\Exception as PHPMailerException;

define('GOHARV', true);
require __DIR__ . '/includes/bootstrap.php';
require __DIR__ . '/includes/seguridad.php';
require __DIR__ . '/vendor/autoload.php';

$anti = $config['antispam'];
$ip   = gh_ip();

/* ══════════ 1. Método ══════════ */
if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    gh_json(['ok' => false, 'codigo' => 'METODO',
        'mensaje' => 'Método no permitido.'], 405);
}

/* ══════════ 2. Origen (CSRF) ══════════ */
if (!gh_origen_valido($config['origenes_permitidos'])) {
    gh_log("Origen rechazado desde $ip: " . ($_SERVER['HTTP_ORIGIN'] ?? 'sin Origin'));
    gh_json(['ok' => false, 'codigo' => 'ORIGEN',
        'mensaje' => 'Solicitud rechazada.'], 403);
}

/* ══════════ 3. Token CSRF ══════════ */
if (!gh_csrf_valido((string)($_POST['csrf_token'] ?? ''))) {
    gh_json(['ok' => false, 'codigo' => 'CSRF',
        'mensaje' => 'Tu sesión expiró. Recargá la página e intentá de nuevo.'], 403);
}

/* ══════════ 4. Honeypot ══════════ */
// Campo invisible: un humano no lo ve, un bot lo completa.
if (!empty($_POST['website'])) {
    gh_log("Honeypot activado desde $ip");
    // Respondemos "ok" a propósito: el bot cree que funcionó y no reintenta.
    gh_json(['ok' => true, 'codigo' => 'OK', 'mensaje' => 'Mensaje enviado.']);
}

/* ══════════ 5. Trampa de tiempo ══════════ */
if (!gh_tiempo_suficiente((int)$anti['segundos_minimos'])) {
    gh_log("Envío demasiado rápido desde $ip");
    gh_json(['ok' => false, 'codigo' => 'RAPIDO',
        'mensaje' => 'Tomate un momento para completar el formulario.'], 429);
}

/* ══════════ 6. Rate limiting ══════════ */
if (!gh_rate_limit_ok($ip, (int)$anti['max_por_ip'], (int)$anti['ventana_minutos'])) {
    gh_log("Rate limit alcanzado por $ip");
    gh_json(['ok' => false, 'codigo' => 'LIMITE',
        'mensaje' => 'Ya enviaste varios mensajes. Probá de nuevo en un rato.'], 429);
}

/* ══════════ 7. Turnstile ══════════ */
if (!gh_turnstile_ok(
    (string)($config['turnstile']['secret_key'] ?? ''),
    (string)($_POST['cf-turnstile-response'] ?? ''),
    $ip
)) {
    gh_json(['ok' => false, 'codigo' => 'CAPTCHA',
        'mensaje' => 'No pudimos verificar que seas humano. Recargá e intentá de nuevo.'], 403);
}

/* ══════════ 8. Validación de campos ══════════ */
// Letras (con acentos), espacios, apóstrofos y guiones: cubre nombres reales.
$PATRON_NOMBRE  = "/^[\\p{L}\\p{M}\\s'\u{2019}.-]+$/u";
$PATRON_EMPRESA = "/^[\\p{L}\\p{M}\\p{N}\\s'\u{2019}.,&()\\/-]+$/u";
$PATRON_TEL     = '/^[0-9+()\s.-]{8,20}$/';

$campos = [
    'nombre'   => gh_texto((string)($_POST['nombre']   ?? ''), 2, 40, $PATRON_NOMBRE),
    'apellido' => gh_texto((string)($_POST['apellido'] ?? ''), 2, 40, $PATRON_NOMBRE),
    'empresa'  => gh_texto((string)($_POST['empresa']  ?? ''), 2, 60, $PATRON_EMPRESA),
    'email'    => gh_email((string)($_POST['email']    ?? '')),
    'telefono' => gh_texto((string)($_POST['telefono'] ?? ''), 8, 20, $PATRON_TEL),
    'pais'     => gh_texto((string)($_POST['pais']     ?? ''), 2, 56, $PATRON_NOMBRE),
    'mensaje'  => gh_texto_largo((string)($_POST['mensaje'] ?? ''), 10, 500),
];

$invalidos = array_keys($campos, null, true);
if ($invalidos !== []) {
    gh_json([
        'ok'      => false,
        'codigo'  => 'VALIDACION',
        'mensaje' => 'Revisá los campos marcados.',
        'campos'  => $invalidos,
    ], 422);
}

/* Consentimientos: antes se validaban solo en el navegador, o sea que no se validaban. */
foreach (['legal', 'privacidad'] as $consentimiento) {
    if (empty($_POST[$consentimiento])) {
        gh_json([
            'ok'      => false,
            'codigo'  => 'CONSENTIMIENTO',
            'mensaje' => 'Debés aceptar el Aviso Legal y la Política de Privacidad.',
            'campos'  => [$consentimiento],
        ], 422);
    }
}

/* ══════════ 9. Filtro de spam ══════════ */
if (gh_parece_spam($campos['mensaje'], $campos['nombre'], (int)$anti['max_enlaces'])) {
    gh_log("Spam filtrado desde $ip <{$campos['email']}>");
    // Igual que el honeypot: no le damos pistas al spammer.
    gh_json(['ok' => true, 'codigo' => 'OK', 'mensaje' => 'Mensaje enviado.']);
}

/* ══════════ 10. Respaldo y registro del envío ══════════ */
if (!empty($anti['respaldo_csv'])) {
    gh_respaldar_contacto($campos, $ip);
}

gh_registrar_intento($ip, (int)$anti['ventana_minutos']);

/* Token de un solo uso: evita reenvíos por doble clic o replay. */
unset($_SESSION['csrf_token'], $_SESSION['csrf_emitido']);

/* ══════════ 11. Enviar el email ══════════ */
$smtp = $config['smtp'];
$mail = new PHPMailer(true);

/* Escapado en la SALIDA: acá es donde corresponde, no al guardar. */
$esc = static function (string $v): string {
    return htmlspecialchars($v, ENT_QUOTES | ENT_HTML5, 'UTF-8');
};

try {
    $mail->isSMTP();
    $mail->Host       = $smtp['host'];
    $mail->SMTPAuth   = true;
    $mail->Username   = $smtp['user'];
    $mail->Password   = $smtp['pass'];
    $mail->SMTPSecure = PHPMailer::ENCRYPTION_STARTTLS;
    $mail->Port       = (int)$smtp['port'];
    $mail->CharSet    = 'UTF-8';
    $mail->Timeout    = 15;

    $mail->setFrom($smtp['from_email'], $smtp['from_name']);
    $mail->addAddress($smtp['to_email'], $smtp['to_name']);
    // "Responder" va directo al contacto. PHPMailer valida la dirección y
    // rechaza saltos de línea, así que no hay header injection posible.
    $mail->addReplyTo($campos['email'], $campos['nombre'] . ' ' . $campos['apellido']);

    $mail->isHTML(true);
    $mail->Subject = 'Nuevo contacto web — ' . $campos['nombre'] . ' ' . $campos['apellido'];

    $mail->Body =
        '<h2 style="font-family:sans-serif">Nuevo contacto desde la web</h2>'
        . '<table style="font-family:sans-serif;border-collapse:collapse" cellpadding="6">'
        . '<tr><td><strong>Nombre</strong></td><td>'   . $esc($campos['nombre'] . ' ' . $campos['apellido']) . '</td></tr>'
        . '<tr><td><strong>Empresa</strong></td><td>'  . $esc($campos['empresa'])  . '</td></tr>'
        . '<tr><td><strong>Email</strong></td><td>'    . $esc($campos['email'])    . '</td></tr>'
        . '<tr><td><strong>Teléfono</strong></td><td>' . $esc($campos['telefono']) . '</td></tr>'
        . '<tr><td><strong>País</strong></td><td>'     . $esc($campos['pais'])     . '</td></tr>'
        . '</table>'
        . '<p style="font-family:sans-serif"><strong>Mensaje:</strong></p>'
        . '<p style="font-family:sans-serif;white-space:pre-wrap">' . $esc($campos['mensaje']) . '</p>'
        . '<hr><p style="font-family:sans-serif;font-size:12px;color:#777">Recibido el '
        . date('d/m/Y H:i') . ' — IP ' . $esc($ip) . '</p>';

    $mail->AltBody = "Nuevo contacto de {$campos['nombre']} {$campos['apellido']}\n"
        . "Empresa: {$campos['empresa']}\nEmail: {$campos['email']}\n"
        . "Teléfono: {$campos['telefono']}\nPaís: {$campos['pais']}\n\n"
        . "Mensaje:\n{$campos['mensaje']}";

    $mail->send();

} catch (PHPMailerException $ex) {
    // El contacto YA está en logs/contactos.csv: no se pierde aunque falle el mail.
    gh_log('Error de envío SMTP: ' . $mail->ErrorInfo);
    gh_json([
        'ok'      => true,
        'codigo'  => 'OK_SIN_MAIL',
        'mensaje' => 'Recibimos tu mensaje! Gracias por ponernos en contacto.',
    ]);
}

gh_json(['ok' => true, 'codigo' => 'OK',
    'mensaje' => '¡Gracias! Recibimos tu mensaje y te responderemos a la brevedad.']);
