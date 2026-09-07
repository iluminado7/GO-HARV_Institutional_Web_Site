/**
 * GoHarv.® — Parallax de la banda de Historia
 *
 * El fondo se desplaza más lento que el contenido mientras la sección
 * cruza la pantalla. Da profundidad sin el salto que producía
 * background-attachment: fixed, que además varios navegadores móviles
 * directamente ignoran.
 *
 * Igual que el hero: el scroll solo marca trabajo pendiente y el dibujo
 * ocurre una vez por frame en requestAnimationFrame.
 */

(function () {
    'use strict';

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    var banda = document.querySelector('.historia');
    if (!banda) return;

    var pendiente = false;
    var ultimo = null;

    /* Cuánto se corre el fondo, en puntos porcentuales a cada lado del
       centro. Más que esto empieza a verse el borde de la imagen. */
    var RECORRIDO = 14;

    function dibujar() {
        pendiente = false;

        var caja = banda.getBoundingClientRect();
        var alto = window.innerHeight;

        // Fuera de pantalla no hay nada que calcular
        if (caja.bottom < 0 || caja.top > alto) return;

        /* progreso: 0 cuando la sección entra por abajo, 1 cuando termina
           de salir por arriba. Se centra en 0.5 para repartir el recorrido
           hacia ambos lados. */
        var progreso = (alto - caja.top) / (alto + caja.height);
        var pos = 50 + (progreso - 0.5) * RECORRIDO * 2;

        var valor = pos.toFixed(2) + '%';
        if (valor !== ultimo) {
            banda.style.setProperty('--parallax', valor);
            ultimo = valor;
        }
    }

    function alScrollear() {
        if (pendiente) return;
        pendiente = true;
        requestAnimationFrame(dibujar);
    }

    dibujar();
    window.addEventListener('scroll', alScrollear, { passive: true });
    window.addEventListener('resize', alScrollear);

    /* El header y el footer se inyectan con fetch: cuando llegan, la
       sección cambia de posición y hay que recalcular. */
    window.addEventListener('load', alScrollear);
    setTimeout(alScrollear, 600);
})();
