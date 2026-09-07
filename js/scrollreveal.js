/**
 * GoHarv.® — Animaciones de entrada por scroll
 *
 *  · .reveal   → el bloque entero entra (fade + desplazamiento corto)
 *  · .stagger  → sus hijos entran en cascada, uno detrás de otro
 *
 * Los estilos que ocultan los elementos se activan con la clase js-stagger,
 * que agrega este script. Si el JS no corre, nada queda invisible.
 */

document.addEventListener('DOMContentLoaded', function () {

  var soportaObserver = 'IntersectionObserver' in window;
  var prefiereQuieto = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  /* Marca en el <html> que las animaciones de entrada estan activas.
     El CSS engancha a esta clase los efectos que OCULTAN contenido, asi
     que si este script no llega a correr nada queda invisible: los
     titulos con clip-path, por ejemplo, se verian recortados para
     siempre. Se agrega solo cuando de verdad se va a animar. */
  if (soportaObserver && !prefiereQuieto) {
      document.documentElement.classList.add('js-anim');
  }

  /* ── Cascada: numerar los hijos ──
     Cada hijo recibe --i (su posición). El CSS convierte ese número en
     un retardo, de modo que entran escalonados sin importar cuántos sean. */
  var grillas = document.querySelectorAll('.stagger');

  grillas.forEach(function (grilla) {
    // Sin animación posible: se deja visible y no se toca nada más.
    if (!soportaObserver || prefiereQuieto) return;

    Array.prototype.forEach.call(grilla.children, function (hijo, i) {
      hijo.style.setProperty('--i', i);
    });
    // Recién ahora se ocultan: si el script fallara antes de esta línea,
    // el contenido seguiría visible.
    grilla.classList.add('js-stagger');
  });

  if (!soportaObserver || prefiereQuieto) {
    // Fallback: mostrar todo de una, sin animación.
    document.querySelectorAll('.reveal').forEach(function (el) {
      el.classList.add('active');
    });
    return;
  }

  /* ── Observador ── */
  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('active');
      observer.unobserve(entry.target);   // se anima una sola vez
    });
  }, {
    threshold: 0.15,
    // Empieza un poco antes de que el bloque toque el borde inferior:
    // la animación llega completa cuando el usuario lo está mirando.
    rootMargin: '0px 0px -10% 0px'
  });

  document.querySelectorAll('.reveal, .stagger').forEach(function (el) {
    observer.observe(el);
  });
});
