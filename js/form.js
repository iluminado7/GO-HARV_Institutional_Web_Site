/**
 * GoHarv.® — Formulario de contacto
 *
 * · Pide el token CSRF a token.php antes de enviar
 * · Monta el widget de Cloudflare Turnstile si hay site key configurada
 * · Muestra el resultado en la página (sin alert()) y marca los campos con error
 */

(function () {
  'use strict';

  const form = document.getElementById('formContacto');
  if (!form) return;

  const boton   = form.querySelector('[type="submit"]');
  const aviso   = document.getElementById('formAviso');
  const widget  = document.getElementById('turnstileWidget');
  const textoBoton = boton ? boton.textContent : 'Enviar';

  let csrfToken = '';
  let turnstileId = null;

  /* ─────────── Mensajes en la página ─────────── */
  function mostrar(texto, tipo) {
    if (!aviso) return;
    aviso.textContent = texto;
    aviso.className = 'form-aviso form-aviso--' + tipo;
    aviso.hidden = false;
    // Los lectores de pantalla anuncian el cambio gracias a role="status".
    aviso.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }

  function limpiarErrores() {
    form.querySelectorAll('.campo-error').forEach(function (el) {
      el.classList.remove('campo-error');
      el.removeAttribute('aria-invalid');
    });
    if (aviso) aviso.hidden = true;
  }

  function marcarCampos(nombres) {
    (nombres || []).forEach(function (nombre) {
      const campo = form.querySelector('[name="' + nombre + '"]');
      if (campo) {
        campo.classList.add('campo-error');
        campo.setAttribute('aria-invalid', 'true');
      }
    });
    const primero = form.querySelector('.campo-error');
    if (primero) primero.focus();
  }

  function bloquear(estado) {
    if (!boton) return;
    boton.disabled = estado;
    boton.textContent = estado ? 'Enviando…' : textoBoton;
  }

  /* ─────────── Token CSRF + site key de Turnstile ─────────── */
  function pedirToken() {
    return fetch('token.php', { credentials: 'same-origin' })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        csrfToken = data.csrf_token || '';
        montarTurnstile(data.turnstile_sitekey);
      })
      .catch(function (err) {
        /* No se avisa acá: mostrar() desplaza la página hasta el aviso, y
           como esto corre al CARGAR, cada recarga terminaba en el formulario
           aunque el visitante no lo hubiera tocado. Sin token el envío queda
           bloqueado y el aviso aparece recién si intenta enviar (ver submit).
           Pasa siempre donde no hay PHP: GitHub Pages, Live Server, file://. */
        console.warn('[form] No se pudo obtener el token:', err);
      });
  }

  /* ─────────── Cloudflare Turnstile ─────────── */
  function montarTurnstile(siteKey) {
    // Sin site key (entorno local) el formulario funciona igual.
    if (!siteKey || !widget) return;

    const render = function () {
      if (!window.turnstile) { setTimeout(render, 100); return; }
      turnstileId = window.turnstile.render(widget, {
        sitekey: siteKey,
        theme: 'light',
        language: document.documentElement.lang || 'es'
      });
    };

    if (!document.getElementById('cf-turnstile-script')) {
      const s = document.createElement('script');
      s.id = 'cf-turnstile-script';
      s.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    render();
  }

  /* ─────────── Envío ─────────── */
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    limpiarErrores();

    // Validación nativa del navegador antes de molestar al servidor.
    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    if (!csrfToken) {
      mostrar('No pudimos preparar el formulario. Recargá la página.', 'error');
      return;
    }

    const datos = new FormData(form);
    datos.append('csrf_token', csrfToken);

    bloquear(true);

    fetch('form.php', {
      method: 'POST',
      body: datos,
      credentials: 'same-origin'
    })
      .then(function (r) { return r.json(); })
      .then(function (res) {
        if (res.ok) {
          mostrar(res.mensaje, 'exito');
          form.reset();
          if (turnstileId !== null && window.turnstile) {
            window.turnstile.reset(turnstileId);
          }
          // El token se consume en el servidor: pedimos uno nuevo para el
          // siguiente envío.
          csrfToken = '';
          pedirToken();
        } else {
          mostrar(res.mensaje || 'No pudimos enviar el mensaje.', 'error');
          marcarCampos(res.campos);
          if (res.codigo === 'CSRF') pedirToken();
          if (turnstileId !== null && window.turnstile) {
            window.turnstile.reset(turnstileId);
          }
        }
      })
      .catch(function () {
        mostrar('Error de conexión. Revisá tu red e intentá de nuevo.', 'error');
      })
      .finally(function () {
        bloquear(false);
      });
  });

  /* Se pide al cargar: así la trampa de tiempo del servidor mide desde que el
     usuario realmente vio el formulario. */
  pedirToken();
})();
