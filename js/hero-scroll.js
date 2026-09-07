/**
 * GoHarv.® — Hero que se contrae al scrollear
 *
 * Al entrar a la página el video ocupa toda la pantalla. Al empezar a
 * scrollear se reduce hasta su altura mínima, y la sección siguiente sube
 * por encima tapando su borde inferior.
 *
 * El scroll NO se escucha para hacer cálculos pesados: solo marca que hay
 * trabajo pendiente y el dibujo ocurre en requestAnimationFrame, una vez
 * por frame. Sin eso, un listener de scroll que toca el layout provoca
 * saltos en el desplazamiento.
 */

(function () {
    'use strict';

    var hero = document.querySelector('.home');
    if (!hero) return;

    // Si el visitante pidió reducir movimiento, el CSS ya fija una altura
    // intermedia: no hay nada que animar.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var pendiente = false;
    var ultimoValor = -1;

    /** Lee un valor en px desde las variables CSS, resolviendo svh/vh. */
    function medir(nombre, respaldo) {
        var crudo = getComputedStyle(document.documentElement)
            .getPropertyValue(nombre).trim();
        if (!crudo) return respaldo;

        var num = parseFloat(crudo);
        if (isNaN(num)) return respaldo;

        if (crudo.indexOf('vh') !== -1) {          // cubre vh y svh
            return window.innerHeight * (num / 100);
        }
        return num;                                 // px
    }

    var altoMax, altoMin, recorrido;

    function recalcular() {
        altoMax   = medir('--hero-alto-max', window.innerHeight);
        altoMin   = medir('--hero-alto-min', window.innerHeight * 0.55);
        recorrido = medir('--hero-recorrido', 420);
    }

    function dibujar() {
        pendiente = false;

        var y = window.scrollY || window.pageYOffset || 0;

        // Progreso de 0 (arriba de todo) a 1 (contracción completa)
        var t = Math.min(Math.max(y / recorrido, 0), 1);

        /* Curva ease-out: responde desde el primer pixel y frena al final.
           Antes se usaba ease-in-out, que arranca casi plana: a 100px de
           scroll el hero se habia contraido apenas un 5% y el efecto
           parecia no existir. */
        var suave = 1 - Math.pow(1 - t, 2);

        var alto = Math.round(altoMax - (altoMax - altoMin) * suave);

        // Escribir en el DOM solo cuando el valor cambió de verdad.
        if (alto !== ultimoValor) {
            hero.style.setProperty('--hero-alto', alto + 'px');
            ultimoValor = alto;
        }

        hero.classList.toggle('contraido', t > 0.02);
    }

    function alScrollear() {
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(dibujar);
    }

    recalcular();
    dibujar();

    // passive: el navegador no espera a este handler para desplazar la
    // página, así el scroll se mantiene fluido.
    window.addEventListener('scroll', alScrollear, { passive: true });

    window.addEventListener('resize', function () {
        recalcular();
        ultimoValor = -1;   // fuerza reescritura con las medidas nuevas
        alScrollear();
    });

    /* ── Repasos después de la carga ──
       El header y el footer se inyectan con fetch, y las tipografías llegan
       del CDN: el layout sigue moviéndose un rato después del load. Si un
       repintado cae justo en medio, el hero puede quedar con la altura de
       un scroll que ya no es el actual (se veía 1 de cada 5 recargas, con
       el hero sin contraer aunque la página estuviera scrolleada).

       Estos repasos vuelven a medir cuando el layout ya se asentó. */
    function repasar() {
        recalcular();
        ultimoValor = -1;   // fuerza reescritura aunque el valor coincida
        dibujar();
    }

    window.addEventListener('load', repasar);
    [120, 600, 1500].forEach(function (ms) { setTimeout(repasar, ms); });

    /* Si algo cambia la altura del documento (header inyectado, imágenes,
       fuentes), se vuelve a calcular. */
    if ('ResizeObserver' in window) {
        var observador = new ResizeObserver(function () { alScrollear(); });
        observador.observe(document.body);
    }
})();
