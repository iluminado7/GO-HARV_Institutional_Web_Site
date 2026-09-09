<?php
/**
 * GoHarv.® — Configuración
 *
 * Copiá este archivo a `config.php` y completá los valores reales.
 * `config.php` está en .gitignore y NUNCA debe subirse al repositorio.
 *
 *   cp config.example.php config.php
 */

return [

    /* ─────────── SMTP ─────────── */
    'smtp' => [
        'host'       => 'smtp.gmail.com',
        'port'       => 587,
        'user'       => 'tucuenta@gmail.com',
        // App Password de Gmail (16 caracteres). Generar en:
        // https://myaccount.google.com/apppasswords
        'pass'       => '',
        'from_email' => 'tucuenta@gmail.com',
        'from_name'  => 'Web GoHarv.',
        // Destinatario de los contactos del formulario
        'to_email'   => 'tucuenta@gmail.com',
        'to_name'    => 'GoHarv.',
    ],

    /* ─────────── Cloudflare Turnstile ─────────── */
    // Claves en: https://dash.cloudflare.com  →  Turnstile  →  Add site
    // Si 'secret_key' queda vacío, la verificación se OMITE (útil en local).
    // En producción NUNCA la dejes vacía.
    'turnstile' => [
        'site_key'   => '',
        'secret_key' => '',
    ],

    /* ─────────── Anti-spam ─────────── */
    'antispam' => [
        // Máximo de envíos por IP dentro de la ventana
        'max_por_ip'        => 3,
        'ventana_minutos'   => 60,
        // Segundos mínimos entre que se carga el form y se envía.
        // Un humano nunca completa 7 campos en menos de 4 segundos; un bot sí.
        'segundos_minimos'  => 4,
        // Máximo de URLs permitidas dentro del mensaje
        'max_enlaces'       => 2,

        // Guarda cada contacto en logs/contactos.csv antes de enviar el mail.
        // Sin base de datos, es lo único que evita perder un contacto si el
        // SMTP falla. Poné false para desactivarlo.
        'respaldo_csv'      => true,

        // Al superar este tamaño, el CSV se archiva con la fecha en el
        // nombre y se empieza uno nuevo, en silencio. Los archivados quedan
        // en la carpeta logs. 0 = no archivar nunca.
        'max_csv_mb'        => 5,
    ],

    /* ─────────── Entorno ─────────── */
    // 'dev'  → muestra errores detallados en la respuesta
    // 'prod' → respuestas genéricas, detalles solo al log
    'entorno' => 'dev',

    // Orígenes permitidos para enviar el formulario (defensa CSRF).
    // Agregá tu dominio real de producción.
    'origenes_permitidos' => [
        'http://localhost',
        'https://goharvey.com',
        'https://www.goharvey.com',
    ],
];
