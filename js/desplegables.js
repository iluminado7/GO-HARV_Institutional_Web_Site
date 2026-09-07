/**
 * GoHarv.® — Bloques que se despliegan
 *
 * Un botón muestra u oculta el bloque que indica su aria-controls.
 * Sirve para cualquier par botón/contenido de la página: no hay ids
 * escritos a mano acá dentro.
 *
 * Reemplaza a toggleLeerMas/toggleLeerMas2, que eran dos funciones casi
 * idénticas con los elementos fijos en el código.
 */

(function () {
    'use strict';

    document.addEventListener('DOMContentLoaded', function () {

        var botones = document.querySelectorAll('.btn-desplegar[aria-controls]');
        if (!botones.length) return;

        botones.forEach(function (boton) {
            var destino = document.getElementById(boton.getAttribute('aria-controls'));
            if (!destino) return;

            boton.addEventListener('click', function () {
                var abierto = boton.getAttribute('aria-expanded') === 'true';

                boton.setAttribute('aria-expanded', String(!abierto));
                destino.classList.toggle('abierto', !abierto);

                /* El texto del botón cambia entre "Leer más" y "Leer menos".
                   Se actualiza también data-i18n para que al cambiar de idioma
                   se traduzca el estado en el que quedó, y no el otro. */
                var etiqueta = boton.querySelector('[data-i18n]');
                if (!etiqueta) return;

                var clave = abierto ? 'about.readmore' : 'about.readless';
                etiqueta.setAttribute('data-i18n', clave);

                if (window.i18next && typeof window.i18next.t === 'function') {
                    var texto = window.i18next.t(clave);
                    if (texto && texto !== clave) etiqueta.textContent = texto;
                }
            });
        });
    });
})();
