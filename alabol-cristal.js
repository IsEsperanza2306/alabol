/* Alabol · Cristal Esmeralda
   El estilo de vidrio de la plataforma, en los colores de Alabol (verde profundo + oro).
   Se carga con una línea en cada página y no toca su HTML ni su lógica:
   - fondo ambiental verde con luces doradas desenfocadas
   - superficies verdes → vidrio esmeralda translúcido con canto dorado
   - botones dorados con brillo de metal pulido
   - pestañas y segmentados → indicador que se desliza con resorte
   - tarjetas → entrada escalonada (desenfoque a nítido) al cargar y al cambiar de vista
   - títulos y cifras grandes → serif
   Lee los estilos ya calculados, así que funciona igual en las 35 páginas. Se apaga al imprimir. */
(function () {
  'use strict';
  if (window.__alabolCristal) return; window.__alabolCristal = 1;
  var D = document, H = D.documentElement;
  var QUIETO = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;

  var CSS = '' +
  'html.ac{background:#04100c!important}' +
  'html.ac body{background-color:transparent!important}' +
  '.ac-amb{position:fixed;inset:0;z-index:-1;overflow:hidden;pointer-events:none;background:radial-gradient(120% 90% at 50% 0%,#0b2a21 0%,#061611 55%,#030b08 100%)}' +
  '.ac-amb i{position:absolute;border-radius:50%;filter:blur(80px);will-change:transform;animation:acDeriva 46s ease-in-out infinite alternate}' +
  '.ac-amb i:nth-child(1){width:52vw;height:52vw;right:-14vw;top:-22vw;background:#12644A;opacity:.55}' +
  '.ac-amb i:nth-child(2){width:62vw;height:62vw;left:-22vw;bottom:-32vw;background:#0D3B2E;opacity:.9;animation-duration:54s;animation-direction:alternate-reverse}' +
  '.ac-amb i:nth-child(3){width:26vw;height:26vw;right:16vw;top:46vh;background:#D4AF37;opacity:.13;animation-duration:34s}' +
  '.ac-amb i:nth-child(4){width:30vw;height:18vw;left:24vw;top:-8vw;background:#F4E5B0;opacity:.07;animation-duration:58s}' +
  '.ac-amb::after{content:"";position:absolute;inset:0;opacity:.06;mix-blend-mode:overlay;background-image:url("data:image/svg+xml,%3Csvg xmlns=\'http://www.w3.org/2000/svg\' width=\'160\' height=\'160\'%3E%3Cfilter id=\'n\'%3E%3CfeTurbulence type=\'fractalNoise\' baseFrequency=\'.9\' numOctaves=\'2\' stitchTiles=\'stitch\'/%3E%3C/filter%3E%3Crect width=\'160\' height=\'160\' filter=\'url(%23n)\'/%3E%3C/svg%3E")}' +
  '@keyframes acDeriva{to{transform:translate(-3vw,5vh) scale(1.06)}}' +
  '@media (max-width:900px),(hover:none){.ac-amb i{animation:none}}' +

  /* vidrio esmeralda */
  '.ac-v{background-color:rgba(14,46,37,.46)!important;background-image:linear-gradient(155deg,rgba(255,255,255,.07),rgba(255,255,255,0) 42%)!important;' +
    'border-color:rgba(244,229,176,.13)!important;-webkit-backdrop-filter:blur(22px) saturate(150%);backdrop-filter:blur(22px) saturate(150%);' +
    'box-shadow:inset 0 1px 0 rgba(244,229,176,.12),inset 0 0 0 1px rgba(255,255,255,.02),0 20px 50px rgba(0,0,0,.35)!important}' +
  '.ac-v.ac-sb{border:1px solid rgba(244,229,176,.13)!important}' +
  '.ac-v.ac-hov{transition:transform .35s cubic-bezier(.34,1.32,.5,1),border-color .25s,box-shadow .3s!important}' +
  '.ac-v.ac-hov:hover{transform:translateY(-3px);border-color:rgba(212,175,55,.38)!important;box-shadow:inset 0 1px 0 rgba(244,229,176,.18),0 24px 60px rgba(0,0,0,.45),0 0 40px -12px rgba(212,175,55,.35)!important}' +
  '.ac-m{background-color:rgba(10,31,26,.86)!important;-webkit-backdrop-filter:blur(30px) saturate(160%)!important;backdrop-filter:blur(30px) saturate(160%)!important;' +
    'border-color:rgba(244,229,176,.16)!important;box-shadow:inset 0 1px 0 rgba(244,229,176,.14),0 40px 100px rgba(0,0,0,.6)!important}' +
  '.ac-bar{background-color:rgba(6,22,17,.55)!important;-webkit-backdrop-filter:blur(24px) saturate(160%)!important;backdrop-filter:blur(24px) saturate(160%)!important;border-color:rgba(244,229,176,.10)!important}' +
  '.ac-t{background-color:transparent!important}' +
  '.ac-t2{background-color:rgba(255,255,255,.035)!important}' +
  '.ac-in{background-color:rgba(3,14,11,.42)!important;border-color:rgba(244,229,176,.14)!important;transition:border-color .2s,box-shadow .2s,background-color .2s}' +
  '.ac-in:focus{border-color:rgba(212,175,55,.6)!important;box-shadow:0 0 0 4px rgba(212,175,55,.12)!important;background-color:rgba(3,14,11,.6)!important}' +

  /* oro pulido */
  '.ac-oro{background-image:linear-gradient(180deg,#F9E27B 0%,#E3C04A 46%,#C99B22 100%)!important;color:#0a1f1a!important;border-color:rgba(255,240,180,.6)!important;' +
    'box-shadow:inset 0 1px 0 rgba(255,255,255,.55),inset 0 -1px 0 rgba(120,85,0,.25),0 10px 26px rgba(212,175,55,.28)!important;position:relative;overflow:hidden;' +
    'transition:transform .3s cubic-bezier(.34,1.32,.5,1),box-shadow .3s,filter .2s!important}' +
  '.ac-oro::after{content:"";position:absolute;top:0;bottom:0;left:-60%;width:40%;pointer-events:none;background:linear-gradient(100deg,transparent,rgba(255,255,255,.55),transparent);transform:skewX(-18deg);opacity:0}' +
  '.ac-oro:hover{transform:translateY(-2px);filter:brightness(1.04);box-shadow:inset 0 1px 0 rgba(255,255,255,.6),0 14px 34px rgba(212,175,55,.38)!important}' +
  '.ac-oro:hover::after{animation:acBrillo .9s ease}' +
  '.ac-oro:active{transform:scale(.97)}' +
  '@keyframes acBrillo{from{left:-60%;opacity:1}to{left:130%;opacity:1}}' +

  /* pestañas con indicador */
  '.ac-tabs{position:relative!important;isolation:isolate}' +
  '.ac-tabs>.ac-act{background:transparent!important;background-image:none!important;box-shadow:none!important;border-color:transparent!important}' +
  '.ac-tabs>*{position:relative;z-index:1}' +
  '.ac-tabs>.ac-ind{position:absolute!important;z-index:0!important;left:0;top:0;pointer-events:none;margin:0!important;padding:0!important;' +
    'transition:left .5s cubic-bezier(.34,1.32,.5,1),width .5s cubic-bezier(.34,1.32,.5,1),top .4s,height .4s,opacity .2s}' +

  /* tipografía de display */
  '.ac-num{font-family:"Instrument Serif","Playfair Display",Georgia,serif!important;font-weight:400!important;letter-spacing:-.01em!important;font-variant-numeric:lining-nums tabular-nums}' +
  '.ac-h1 *{font-family:inherit!important;font-weight:400!important}' +
  '.ac-h1 .ac-em{font-style:italic!important;letter-spacing:-.005em!important}' +
  '.ac-h1{font-family:"Instrument Serif","Playfair Display",Georgia,serif!important;font-weight:400!important;letter-spacing:-.012em!important;text-transform:none!important;line-height:1.05!important}' +

  '@media (prefers-reduced-motion:reduce){.ac-amb i{animation:none!important}.ac-tabs>.ac-ind,.ac-v.ac-hov,.ac-oro{transition:none!important}.ac-oro::after{display:none}}' +
  '@media print{html.ac{background:#fff!important}.ac-amb{display:none!important}.ac-v,.ac-m,.ac-bar{-webkit-backdrop-filter:none!important;backdrop-filter:none!important;box-shadow:none!important}}';

  function rgba(s) { var m = s && s.match(/rgba?\(([^)]+)\)/); if (!m) return null; var p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; }
  // verde oscuro de Alabol (#0a1f1a, #0d2921, #0f3329, #05100d…) o negro verdoso
  function verde(c) { return c && c.a > .25 && c.r < 70 && c.g < 90 && c.b < 80 && c.g >= c.r && (c.r + c.g + c.b) > 6; }
  function oro(c) { return c && c.a > .8 && c.r > 180 && c.g > 140 && c.b < 140 && c.r - c.b > 80; }

  var CELDA = /^(TD|TH|TR|THEAD|TBODY|TFOOT|LI|SPAN|LABEL|P|B|I|EM|STRONG|SMALL|H1|H2|H3|H4|H5|H6)$/;
  var nuevos = [];

  function clasificar(el) {
    if (el.nodeType !== 1 || el.__ac) return;
    var tag = el.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'svg' || tag === 'IMG' || tag === 'CANVAS' || tag === 'VIDEO' || tag === 'IFRAME' || tag === 'OPTION') return;
    if (el.closest('svg,.ac-amb,[data-ac-no],.leaflet-container,#custom-alert')) return;
    el.__ac = 1;
    var cs = getComputedStyle(el);
    if (cs.display === 'none') { el.__ac = 0; return; }
    var fs = parseFloat(cs.fontSize);
    if (fs >= 30 && el.childElementCount <= 2 && !el.closest('button,a,select,input,textarea,table,.ac-tabs')) {
      var tx = [].filter.call(el.childNodes, function (n) { return n.nodeType === 3; }).map(function (n) { return n.textContent; }).join('').trim();
      if (tx && tx.length <= 16 && /^[\s$%+−\-–—,.:0-9kKmMxX/]+$/.test(tx) && /\d/.test(tx)) el.classList.add('ac-num');
    }
    if (tag === 'H1' && fs >= 22 && !el.closest('.ac-tabs,nav,header .logo')) {
      el.classList.add('ac-h1');
      el.style.setProperty('font-size', Math.round(fs * 1.2) + 'px', 'important');   // la serif se lee más chica: la compensamos
      // lo resaltado en otro color dentro del título va en serif itálica
      [].forEach.call(el.querySelectorAll('span,em,strong,b,i'), function (x) { var xs = getComputedStyle(x); if (xs.color !== cs.color || xs.webkitBackgroundClip === 'text' || xs.backgroundClip === 'text' || /gold|oro|accent/.test(x.className)) x.classList.add('ac-em'); });
    }

    var bg = rgba(cs.backgroundColor), r;
    if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
      if (bg && bg.a > .05 && (verde(bg) || (bg.r < 60 && bg.g < 60 && bg.b < 60)) && !/checkbox|radio|range|color|file|submit|button/.test(el.type || '')) el.classList.add('ac-in');
      return;
    }
    if ((tag === 'BUTTON' || tag === 'A') && oro(bg) && cs.backgroundImage === 'none') { el.classList.add('ac-oro'); return; }
    if (!verde(bg)) return;
    var dentro = el.parentElement && el.parentElement.closest('.ac-v,.ac-m');
    if (CELDA.test(tag)) { if (dentro) el.classList.add('ac-t'); return; }
    r = el.getBoundingClientRect();
    if (r.width < 8 || r.height < 8) { if (!r.width) el.__ac = 0; return; }
    if (tag === 'BUTTON' || (tag === 'A' && r.height < 56)) { if (dentro) el.classList.add('ac-t2'); return; }
    if (cs.position === 'sticky' || (cs.position === 'fixed' && r.top <= 2 && r.width >= innerWidth * .9)) { el.classList.add('ac-bar'); return; }
    // fondos de página o de sección a lo ancho: se vuelven transparentes para dejar ver el ambiente
    if (r.width >= innerWidth * .92 && parseFloat(cs.borderTopLeftRadius) < 6) { if (cs.backgroundImage === 'none') el.classList.add('ac-t'); return; }
    if (dentro) { el.classList.add('ac-t2'); return; }
    if (el.closest('dialog,[role="dialog"]') || cs.position === 'fixed' || (el.parentElement && getComputedStyle(el.parentElement).position === 'fixed')) { el.classList.add('ac-m'); return; }
    if (cs.backgroundImage !== 'none' && !/gradient/.test(cs.backgroundImage)) return;   // fotos de fondo: se respetan
    el.classList.add('ac-v');
    if (cs.borderTopWidth === '0px') el.classList.add('ac-sb');
    if (tag === 'A' || cs.cursor === 'pointer') el.classList.add('ac-hov');
    nuevos.push(el);
  }

  var ACTIVO = '[aria-current="true"],[aria-current="page"],[aria-pressed="true"],[aria-selected="true"],.active,.on,.sel,.selected,.is-active,.current,.activo,.activa,.act';
  function pestanas(raiz) {
    [].forEach.call((raiz && raiz.querySelectorAll ? raiz : D).querySelectorAll('[role="tablist"],div,nav'), function (c) {
      if (c.__act || c.closest('[data-ac-no]')) return;
      var hijos = [].filter.call(c.children, function (x) { return x.matches('button,a,[role="tab"]'); });
      var reales = [].filter.call(c.children, function (x) { return !x.classList.contains('ac-ind'); });
      if (hijos.length < 2 || hijos.length !== reales.length) return;
      var act = hijos.filter(function (x) { return x.matches(ACTIVO); });
      if (act.length !== 1) return;
      var cs = getComputedStyle(act[0]), bg = rgba(cs.backgroundColor);
      var otro = hijos.filter(function (x) { return x !== act[0]; })[0], bo = otro && rgba(getComputedStyle(otro).backgroundColor);
      var mismo = bo && bg && bo.a > .3 && bo.r === bg.r && bo.g === bg.g && bo.b === bg.b;
      if (!((bg && bg.a > .25 && !mismo) || cs.backgroundImage !== 'none')) return;
      if (!act[0].getBoundingClientRect().width) return;
      c.__act = 1;
      var ind = D.createElement('i'); ind.className = 'ac-ind'; ind.setAttribute('aria-hidden', 'true');
      ['backgroundColor', 'backgroundImage', 'boxShadow', 'borderRadius', 'border'].forEach(function (k) { ind.style[k] = cs[k]; });
      c.classList.add('ac-tabs'); c.insertBefore(ind, c.firstChild);
      var primero = true;
      function mover() {
        var a = [].filter.call(c.children, function (x) { return x !== ind && x.matches(ACTIVO); })[0];
        [].forEach.call(c.children, function (x) { x.classList.toggle('ac-act', x === a); });
        if (!a || !a.offsetWidth) { ind.style.opacity = 0; return; }
        if (primero || QUIETO) ind.style.transition = 'none';
        ind.style.opacity = 1; ind.style.left = a.offsetLeft + 'px'; ind.style.top = a.offsetTop + 'px';
        ind.style.width = a.offsetWidth + 'px'; ind.style.height = a.offsetHeight + 'px';
        if (primero) { void ind.offsetWidth; ind.style.transition = ''; primero = false; }
      }
      mover();
      new MutationObserver(function () { requestAnimationFrame(mover); }).observe(c, { attributes: true, subtree: true, childList: true, attributeFilter: ['class', 'aria-current', 'aria-pressed', 'aria-selected'] });
      if (window.ResizeObserver) new ResizeObserver(function () { primero = true; mover(); }).observe(c);
    });
  }

  function entrar() {
    if (QUIETO || !nuevos.length) { nuevos.length = 0; return; }
    var vis = nuevos.splice(0).filter(function (el) { var r = el.getBoundingClientRect(); return r.bottom > 0 && r.top < innerHeight && r.width > 0; }).slice(0, 18);
    vis.forEach(function (el, i) {
      if (el.animate) el.animate([{ opacity: 0, transform: 'translateY(16px)', filter: 'blur(8px)' }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
        { duration: 700, delay: Math.min(i, 12) * 50, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
    });
  }

  function barrer(raiz) { clasificar(raiz); if (raiz.querySelectorAll) [].forEach.call(raiz.querySelectorAll('*'), clasificar); }

  function arrancar() {
    H.classList.add('ac');
    var st = D.createElement('style'); st.id = 'ac-css'; st.textContent = CSS; D.head.appendChild(st);
    if (!D.querySelector('link[href*="Instrument+Serif"]')) { var l = D.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://fonts.googleapis.com/css2?family=Instrument+Serif:ital@0;1&display=swap'; D.head.appendChild(l); }
    var amb = D.createElement('div'); amb.className = 'ac-amb'; amb.setAttribute('aria-hidden', 'true'); amb.innerHTML = '<i></i><i></i><i></i><i></i>'; D.body.insertBefore(amb, D.body.firstChild);
    // el fondo de la página en sí (body, wrappers a pantalla completa) se aclara para que se vea el ambiente
    [D.body].concat([].slice.call(D.body.children)).forEach(function (el) {
      var bg = rgba(getComputedStyle(el).backgroundColor); if (el !== amb && verde(bg) && el.getBoundingClientRect().width >= innerWidth * .92) el.classList.add('ac-t');
    });
    barrer(D.body); pestanas(D); entrar();
    var pend = [], t;
    new MutationObserver(function (ms) {
      ms.forEach(function (m) { [].forEach.call(m.addedNodes, function (n) { if (n.nodeType === 1) pend.push(n); }); });
      if (!pend.length) return;
      clearTimeout(t); t = setTimeout(function () {
        var lote = pend.splice(0);
        lote.forEach(function (n) { if (n.isConnected) barrer(n); });
        lote.forEach(function (n) { if (n.isConnected) pestanas(n.parentElement || n); });
        entrar();
      }, 40);
    }).observe(D.body, { childList: true, subtree: true });
    // lo que estaba oculto (pasos de un formulario, pestañas) se clasifica cuando aparece
    function revisar() { setTimeout(function () { [].forEach.call(D.body.querySelectorAll('*'), function (el) { if (el.__ac === 0) { el.__ac = undefined; clasificar(el); } }); pestanas(D); entrar(); }, 60); }
    D.addEventListener('click', revisar, true);
    addEventListener('hashchange', revisar);
  }
  if (D.readyState === 'loading') D.addEventListener('DOMContentLoaded', function () { setTimeout(arrancar, 20); }); else setTimeout(arrancar, 20);
})();
