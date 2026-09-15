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


/**
 * Atajos: Perfil · Menciones · Contenido
 *
 * Las tres partes están una debajo de la otra en la misma página; la barra
 * de arriba solo lleva a cada una y marca en cuál se está leyendo.
 * Menciones y contenidos se cargan a mano en el HTML (hay un modelo
 * comentado en cada página); acá solo se cuentan para el número de la barra.
 */
(function () {
    'use strict';

    var barra = document.querySelector('.perfil-tabs');
    if (!barra) return;

    var raiz = document.documentElement;
    var atajos = Array.prototype.slice.call(barra.querySelectorAll('.perfil-tab'));
    var bloques = atajos.map(function (a) { return document.getElementById(a.hash.slice(1)); });

    /* La barra se pega justo debajo del header. Su alto no es fijo (73px en
       desktop, 57px en móvil) y además llega tarde, inyectado por
       layout.js: se mide y se pasa a CSS en vez de adivinarlo. */
    function medirHeader() {
        var h = document.getElementById('header');
        if (h) raiz.style.setProperty('--perfil-header-alto', h.offsetHeight + 'px');
        return h;
    }

    var contenedorHeader = document.getElementById('header-container');
    if (!medirHeader() && contenedorHeader && 'MutationObserver' in window) {
        new MutationObserver(function (_, obs) {
            var h = medirHeader();
            if (!h) return;
            obs.disconnect();
            if ('ResizeObserver' in window) new ResizeObserver(medirHeader).observe(h);
        }).observe(contenedorHeader, { childList: true });
    }
    window.addEventListener('resize', medirHeader);

    /* ── Cantidad de menciones y de contenidos ── */
    atajos.forEach(function (a, i) {
        var num = a.querySelector('.perfil-tab-num');
        if (!num || !bloques[i]) return;
        var n = bloques[i].querySelectorAll('.perfil-mencion, .perfil-card').length;
        num.textContent = n;
        num.hidden = n === 0;
    });

    /* ── Salto ──
       Por JS porque la página usa <base href="../">: entrando por la URL
       sin ".html" el href ya no coincide con la dirección actual y el
       navegador recargaría en vez de desplazarse. */
    atajos.forEach(function (a, i) {
        a.addEventListener('click', function (e) {
            if (!bloques[i]) return;
            e.preventDefault();
            bloques[i].scrollIntoView({ block: 'start' });
            // Ruta absoluta: un '#id' suelto se resolvería contra <base>
            history.replaceState(null, '', location.pathname + location.search + a.hash);
        });
    });

    /* ── Cuál se está leyendo ──
       El último bloque cuyo inicio ya pasó por debajo de la barra. */
    function marcar() {
        var limite = barra.getBoundingClientRect().bottom + window.innerHeight * 0.25;
        var actual = 0;
        bloques.forEach(function (b, i) {
            if (b && b.getBoundingClientRect().top <= limite) actual = i;
        });
        if (window.innerHeight + window.scrollY >= raiz.scrollHeight - 4) actual = bloques.length - 1;

        atajos.forEach(function (a, i) {
            var activo = i === actual;
            a.classList.toggle('is-activa', activo);
            if (activo) a.setAttribute('aria-current', 'location');
            else a.removeAttribute('aria-current');
        });
    }

    var pendiente = false;
    window.addEventListener('scroll', function () {
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(function () { pendiente = false; marcar(); });
    }, { passive: true });
    marcar();

    /* ── Entrar con #ancla (ej. .../horacio-cacciatore.html#menciones) ──
       El salto nativo ocurre antes de que terminen de cargar fuentes,
       header y traducciones (que reescriben textos y cambian alturas), y
       con scroll-behavior:smooth es una animación que puede terminar
       después y dejar la sección desfasada. Mientras tanto el desplazamiento
       es instantáneo, y se repite el salto cuando todo asentó. */
    if (location.hash) {
        raiz.style.scrollBehavior = 'auto';

        window.addEventListener('load', function () {
            var fuentes = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
            fuentes.then(function () {
                var intentos = 0;
                (function esperarTraducciones() {
                    if (window.i18nReady || intentos++ > 40) setTimeout(saltar, 150);
                    else setTimeout(esperarTraducciones, 50);
                })();
            });
        });
    }

    function saltar() {
        var destino = document.getElementById(location.hash.slice(1));
        if (destino) destino.scrollIntoView({ block: 'start', behavior: 'instant' });
        raiz.style.scrollBehavior = '';
        marcar();
    }
})();
