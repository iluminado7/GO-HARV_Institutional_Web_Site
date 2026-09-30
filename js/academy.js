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

    /* ── Aparicion ligada al scroll (solo academy.html) ──
       Cada bloque entra a medida que el usuario scrollea: el avance del
       scroll, no un temporizador, decide cuanto se ve. Sube unos pixeles y
       se asienta cuando su borde superior llega al 62% del alto de la
       pantalla. El avance solo crece: volver a subir no esconde nada.

       Los bloques son los hijos de cada .container; en las grillas y listas
       (DESCENDER) se baja un nivel y cada tarjeta o item va por su cuenta.
       En una misma fila, la columna de la derecha llega un poco despues. */
    var DESCENDER = '.stagger, .academy-dos-col, .academy-intro-grid, .academy-intro-text, ' +
                    '.academy-valor-grid, .academy-programas-intro, .alianza-wca';
    var RECORRIDO = 36;   // px que sube cada bloque (el mismo valor esta en el CSS)
    var FIN = .62;        // se asienta con su borde superior al 62% de la pantalla
    var TRAMO = .36;      // la entrada dura 0.36 altos de pantalla de scroll
    var CASCADA = .12;    // demora de la ultima columna respecto de la primera

    function suave(p) { return 1 - Math.pow(1 - p, 3); }   // frena al llegar

    document.addEventListener('DOMContentLoaded', function () {
        var body = document.body;
        if (!body.classList.contains('academy-page') || RAPIDO) return;

        var items = [];
        function juntar(el, grupo) {
            if (el.matches(DESCENDER)) {
                Array.prototype.forEach.call(el.children, function (hijo) { juntar(hijo, el); });
            } else {
                items.push({ el: el, grupo: grupo, p: 0, desfase: 0 });
            }
        }
        document.querySelectorAll('.academy-page .main > section:not(.academy-hero) > .container')
            .forEach(function (c) {
                Array.prototype.forEach.call(c.children, function (hijo) { juntar(hijo, null); });
            });
        if (!items.length) return;

        items.forEach(function (it) {
            it.el.style.setProperty('--p', '0');
            it.el.classList.add('sr');
        });
        body.classList.add('sr-activo');

        // Cuanto mas a la derecha dentro de su grilla, mas tarde llega (0 a 1)
        function medirDesfases() {
            items.forEach(function (it) {
                if (!it.grupo) return;
                var g = it.grupo.getBoundingClientRect();
                var r = it.el.getBoundingClientRect();
                it.desfase = g.width ? Math.max(0, Math.min(1, (r.left - g.left) / g.width)) : 0;
            });
        }

        var pendiente = false;
        function actualizar() {
            pendiente = false;
            var alto = window.innerHeight;
            // Scroll que falta hasta el final de la pagina
            var falta = Math.max(0, document.documentElement.scrollHeight - alto - window.scrollY);

            items = items.filter(function (it) {
                // La posicion sin el desplazamiento que le aplicamos nosotros
                var top = it.el.getBoundingClientRect().top - (1 - suave(it.p)) * RECORRIDO;
                // Lo que esta al pie de la pagina nunca llega al 62%: se asienta
                // justo cuando el usuario llega al final.
                var fin = Math.max(alto * (FIN - CASCADA * it.desfase), top - falta);
                var inicio = fin + alto * TRAMO;
                var p = Math.max(0, Math.min(1, (inicio - top) / (inicio - fin)));

                if (p > it.p) {
                    it.p = p;
                    it.el.style.setProperty('--p', suave(p).toFixed(4));
                }
                if (it.p < 1) return true;

                // Llego: se suelta cuando termina la transicion del CSS
                var el = it.el;
                setTimeout(function () {
                    el.classList.remove('sr');
                    el.style.removeProperty('--p');
                }, 350);
                return false;
            });

            if (!items.length) {
                window.removeEventListener('scroll', pedir);
                window.removeEventListener('resize', alCambiarTamano);
            }
        }

        function pedir() {
            if (pendiente) return;
            pendiente = true;
            requestAnimationFrame(actualizar);
        }

        function alCambiarTamano() {
            medirDesfases();
            pedir();
        }

        window.addEventListener('scroll', pedir, { passive: true });
        window.addEventListener('resize', alCambiarTamano);
        // Header, footer y traducciones llegan despues y mueven todo
        window.addEventListener('load', alCambiarTamano);
        medirDesfases();
        actualizar();
    });

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
