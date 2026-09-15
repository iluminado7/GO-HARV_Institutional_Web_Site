/**
 * GoHarv.® — Perfil profesional (team/<nombre>.html)
 *
 * Índice lateral: resalta la sección que se está leyendo y hace el salto
 * sin recargar. El salto va por JS porque la página usa <base href="../">:
 * si se entra por la URL sin ".html" (GitHub Pages lo permite), el href
 * del índice ya no coincide con la dirección actual y el navegador
 * recargaría la página en vez de desplazarse.
 */

(function () {
    'use strict';

    var enlaces = Array.prototype.slice.call(document.querySelectorAll('.perfil-indice a'));
    if (!enlaces.length) return;

    var secciones = enlaces
        .map(function (a) { return document.getElementById(a.hash.slice(1)); })
        .filter(Boolean);

    enlaces.forEach(function (a) {
        a.addEventListener('click', function (e) {
            var destino = document.getElementById(a.hash.slice(1));
            if (!destino) return;
            e.preventDefault();
            destino.scrollIntoView({ block: 'start' });
            // Ruta absoluta: un '#id' suelto se resolvería contra <base>
            history.replaceState(null, '', location.pathname + location.search + a.hash);
        });
    });

    function marcar(id) {
        enlaces.forEach(function (a) {
            var activo = a.hash === '#' + id;
            a.classList.toggle('is-activo', activo);
            if (activo) a.setAttribute('aria-current', 'true');
            else a.removeAttribute('aria-current');
        });
    }

    /* La sección activa es la última cuyo título ya pasó el tercio
       superior de la pantalla. */
    var pendiente = false;
    function actualizar() {
        pendiente = false;
        var limite = window.innerHeight * 0.33;
        var actual = secciones[0];
        secciones.forEach(function (s) {
            if (s.getBoundingClientRect().top <= limite) actual = s;
        });
        // Al fondo de la página, la última aunque sea corta
        if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
            actual = secciones[secciones.length - 1];
        }
        marcar(actual.id);
    }

    window.addEventListener('scroll', function () {
        if (!pendiente) {
            pendiente = true;
            requestAnimationFrame(actualizar);
        }
    }, { passive: true });

    actualizar();
})();
