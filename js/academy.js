/**
 * GoHarv.® — Academy
 *
 * Acordeones de los Programas Ejecutivos: cada dato del programa
 * (destinatarios, carga horaria, certificación…) se abre al hacer clic en
 * su renglón. Sin JS los paneles quedan visibles, así que el contenido
 * nunca se pierde.
 *
 * La altura se anima desde el alto real del panel, no desde un max-height
 * inventado: con textos tan distintos —dos renglones o el legal completo
 * del certificado— un valor fijo dejaba la animación lenta en los cortos y
 * recortada en los largos.
 */

(function () {
    'use strict';

    var RAPIDO = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    document.addEventListener('DOMContentLoaded', function () {

        var botones = document.querySelectorAll('.acc-btn[aria-controls]');
        if (!botones.length) return;

        // Sin JS los paneles se ven; con JS arrancan cerrados.
        Array.prototype.forEach.call(botones, function (boton) {
            var panel = document.getElementById(boton.getAttribute('aria-controls'));
            if (!panel) return;
            panel.hidden = false;
            panel.style.height = '0px';
            panel.classList.add('is-cerrado');

            boton.addEventListener('click', function () {
                if (boton.getAttribute('aria-expanded') === 'true') cerrar(boton, panel);
                else abrir(boton, panel);
            });
        });

        function abrir(boton, panel) {
            boton.setAttribute('aria-expanded', 'true');
            panel.classList.remove('is-cerrado');
            var alto = panel.firstElementChild.offsetHeight;
            panel.style.height = RAPIDO ? 'auto' : alto + 'px';
            // Al terminar se deja en auto: si cambia el ancho (o el idioma),
            // el texto reflui­do no queda cortado por una altura vieja.
            if (!RAPIDO) esperarTransicion(panel, function () {
                if (boton.getAttribute('aria-expanded') === 'true') panel.style.height = 'auto';
            });
        }

        function cerrar(boton, panel) {
            boton.setAttribute('aria-expanded', 'false');
            // De 'auto' a 0 no hay transición: primero se fija el alto real.
            panel.style.height = panel.firstElementChild.offsetHeight + 'px';
            panel.offsetHeight;   // fuerza el recálculo antes de cambiar
            panel.style.height = '0px';
            panel.classList.add('is-cerrado');
        }

        function esperarTransicion(el, fn) {
            var listo = false;
            var terminar = function () {
                if (listo) return;
                listo = true;
                el.removeEventListener('transitionend', terminar);
                fn();
            };
            el.addEventListener('transitionend', terminar);
            setTimeout(terminar, 600);   // red de seguridad
        }
    });
})();
