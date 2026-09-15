/**
 * GoHarv.® — Símbolo de marca registrada
 *
 * Envuelve cada ® en un <sup> para poder achicarlo y subirlo por CSS.
 *
 * Se hace por JS y no editando el marcado porque el símbolo aparece 156
 * veces entre las páginas y los tres archivos de traducción: mantenerlo a
 * mano sería frágil, y además i18next reemplaza el innerHTML al cambiar de
 * idioma, con lo que cualquier marcado escrito a mano se perdería.
 */

(function () {
    'use strict';

    var SIMBOLO = '®';
    var observador = null;

    /** Envuelve los ® que encuentre bajo una raíz dada. */
    function envolver(raiz) {
        var recorrido = document.createTreeWalker(
            raiz,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode: function (nodo) {
                    if (nodo.nodeValue.indexOf(SIMBOLO) === -1) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    var padre = nodo.parentElement;
                    if (!padre) return NodeFilter.FILTER_REJECT;

                    // Ya procesado
                    if (padre.classList.contains('marca-reg')) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    // Nada de tocar código ni campos de formulario
                    if (/^(SCRIPT|STYLE|TEXTAREA|OPTION)$/.test(padre.tagName)) {
                        return NodeFilter.FILTER_REJECT;
                    }
                    return NodeFilter.FILTER_ACCEPT;
                }
            }
        );

        var nodos = [];
        while (recorrido.nextNode()) {
            nodos.push(recorrido.currentNode);
        }

        nodos.forEach(function (nodo) {
            var partes = nodo.nodeValue.split(SIMBOLO);
            var fragmento = document.createDocumentFragment();

            partes.forEach(function (texto, i) {
                if (texto) {
                    fragmento.appendChild(document.createTextNode(texto));
                }
                // Un ® entre cada par de partes, menos después de la última
                if (i < partes.length - 1) {
                    var sup = document.createElement('sup');
                    sup.className = 'marca-reg';
                    sup.textContent = SIMBOLO;
                    fragmento.appendChild(sup);
                }
            });

            nodo.parentNode.replaceChild(fragmento, nodo);
        });
    }

    /* El observador se desconecta mientras se procesa: si no, los <sup>
       que crea esta misma función dispararían otra pasada, en bucle. */
    function procesar() {
        if (observador) observador.disconnect();
        envolver(document.body);
        if (observador) vigilar();
    }

    function vigilar() {
        observador.observe(document.body, {
            childList: true,
            subtree: true,
            characterData: true
        });
    }

    document.addEventListener('DOMContentLoaded', function () {
        procesar();

        /* i18next reescribe el innerHTML de cada elemento traducido al
           cambiar de idioma, y ahí los ® vuelven a quedar sueltos. En vez
           de depender de la API interna del motor de traducción, se vigila
           el DOM y se reprocesa cuando algo cambia. */
        if (!('MutationObserver' in window)) return;

        var pendiente = null;
        observador = new MutationObserver(function () {
            clearTimeout(pendiente);
            pendiente = setTimeout(procesar, 120);   // agrupa ráfagas de cambios
        });
        vigilar();
    });
})();
