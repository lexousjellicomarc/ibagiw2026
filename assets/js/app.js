/* IBAGIW 2026 flipbook — page-flip (MIT) for turning pages, PhotoSwipe (MIT) for zoom. */
(function () {
  'use strict';

  var COUNT = parseInt(document.getElementById('book').getAttribute('data-pages'), 10) || 22;
  var PAGE_W = 1240;
  var PAGE_H = 1754;
  var HD_W = 2480;
  var HD_H = 3508;
  var RATIO = PAGE_W / PAGE_H;
  var MAX_PARALLEL = 3;

  function $(id) { return document.getElementById(id); }

  var app = $('app');
  var bookEl = $('book');
  var loader = $('loader');
  var label = $('pageLabel');
  var btnPrev = $('btnPrev');
  var btnNext = $('btnNext');
  var sidePrev = $('sidePrev');
  var sideNext = $('sideNext');
  var btnZoom = $('btnZoom');
  var btnPages = $('btnPages');
  var btnShare = $('btnShare');
  var btnFs = $('btnFullscreen');
  var sheet = $('thumbs');
  var grid = $('thumbGrid');
  var btnCloseThumbs = $('btnCloseThumbs');
  var toastEl = $('toast');

  var isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

  // bumped whenever page images change, so returning visitors never see an old cached page
  var VERSION = bookEl.getAttribute('data-version') || '';
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function src(size, n, ext) {
    return 'pages/' + size + '/page-' + pad(n) + '.' + ext + (VERSION ? '?v=' + VERSION : '');
  }

  /* ---------- WebP support (the zoom viewer needs a single URL per page) ---------- */
  var webpOK = null;
  (function () {
    var t = new Image();
    t.onload = function () { webpOK = t.width > 0 && t.height > 0; };
    t.onerror = function () { webpOK = false; };
    t.src = 'data:image/webp;base64,UklGRiIAAABXRUJQVlA4IBYAAAAwAQCdASoBAAEADsD+JaQAA3AAAAAA';
  })();

  /* ---------- toast ---------- */
  var toastTimer = null;
  function toast(msg, ms) {
    toastEl.textContent = msg;
    toastEl.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { toastEl.classList.remove('show'); }, ms || 2600);
  }

  /* ---------- start page from #p=N ---------- */
  function pageFromHash() {
    var m = /(?:^|[#&])p=(\d+)/.exec(location.hash || '');
    if (!m) return 0;
    var n = parseInt(m[1], 10);
    if (!(n >= 1)) return 0;
    return Math.min(n, COUNT) - 1;
  }

  function writeHash(index) {
    if (!window.history || !history.replaceState) return;
    var base = location.href.split('#')[0];
    try {
      history.replaceState(null, '', index > 0 ? base + '#p=' + (index + 1) : base);
    } catch (e) { /* ignore */ }
  }

  /* ---------- build pages ---------- */
  var pages = [];
  for (var n = 1; n <= COUNT; n++) pages.push(makePage(n));

  function makePage(num) {
    var el = document.createElement('div');
    el.className = 'page';
    // first page is a stiff cover; the last page is one too only when it stands alone (even page count)
    var stiff = num === 1 || (num === COUNT && COUNT % 2 === 0);
    el.setAttribute('data-density', stiff ? 'hard' : 'soft');

    var inner = document.createElement('div');
    inner.className = 'page-inner';

    var ph = document.createElement('div');
    ph.className = 'page-ph';
    ph.innerHTML =
      '<span class="ph-spin"></span>' +
      '<span class="ph-num">' + num + '</span>' +
      '<span class="ph-msg">This page could not load.</span>' +
      '<button class="ph-retry" type="button">Try again</button>';

    var pic = document.createElement('picture');
    var source = document.createElement('source');
    source.type = 'image/webp';
    var img = document.createElement('img');
    img.alt = 'Page ' + num + ' of ' + COUNT;
    img.draggable = false;
    img.decoding = 'async';
    pic.appendChild(source);
    pic.appendChild(img);

    inner.appendChild(ph);
    inner.appendChild(pic);
    el.appendChild(inner);

    var p = { n: num, el: el, img: img, source: source, state: 0, tries: 0, hd: false, slot: false };

    img.addEventListener('load', function () {
      if (!img.naturalWidth) return;
      p.state = 2;
      el.classList.remove('is-error');
      el.classList.add('is-loaded');
      releaseSlot(p);
      if (img.decode) img.decode().catch(function () {});
      checkLoader();
      pump();
    });

    img.addEventListener('error', function () {
      if (p.state !== 1) return;
      if (p.tries < 3) {
        p.tries++;
        setTimeout(function () { setSources(p, true); }, 900 * p.tries);
      } else {
        p.state = 3;
        el.classList.add('is-error');
        releaseSlot(p);
        checkLoader();
        pump();
      }
    });

    ph.querySelector('.ph-retry').addEventListener('click', function (e) {
      e.stopPropagation();
      p.tries = 0;
      p.state = 0;
      el.classList.remove('is-error');
      pump();
    });

    return p;
  }

  /* ---------- progressive image loading ---------- */
  var active = 0;
  var pf = null;
  var ready = false;

  function releaseSlot(p) {
    if (p.slot) { p.slot = false; active--; }
  }

  function needHD() {
    var w = 0;
    try { w = pf ? pf.getBoundsRect().pageWidth : 0; } catch (e) { w = 0; }
    if (!w) w = bookEl.clientWidth;
    return w * (window.devicePixelRatio || 1) > 1700;
  }

  function setSources(p, retry) {
    var size = p.hd ? '2480' : '1240';
    var withRetry = function (u) {
      return retry ? u + (u.indexOf('?') === -1 ? '?' : '&') + 'retry=' + p.tries : u;
    };
    p.source.srcset = withRetry(src(size, p.n, 'webp'));
    p.img.src = withRetry(src(size, p.n, 'jpg'));
  }

  function startLoad(p) {
    p.state = 1;
    p.hd = needHD();
    p.slot = true;
    active++;
    setSources(p, false);
  }

  function visiblePages() {
    if (!pf) return [pageFromHash()];
    var i = pf.getCurrentPageIndex();
    if (pf.getOrientation() === 'portrait') return [i];
    if (i === 0 || i >= COUNT - 1) return [i];
    return [i, i + 1];
  }

  function pump() {
    if (!ready) return;
    var vis = visiblePages();
    var base = vis[0];
    // until the first view is on screen, spend the bandwidth only on it
    var limit = loaderDone ? MAX_PARALLEL : vis.length;
    var order = pages.slice().sort(function (a, b) { return score(a) - score(b); });
    function score(p) {
      var d = (p.n - 1) - base;
      return d >= 0 ? d : (-d * 1.6);
    }
    for (var i = 0; i < order.length && active < limit; i++) {
      if (order[i].state === 0) startLoad(order[i]);
    }
  }

  /* ---------- loader ---------- */
  var loaderDone = false;
  function hideLoader() {
    if (loaderDone) return;
    loaderDone = true;
    loader.classList.add('done');
    pump();
    setTimeout(function () { loader.hidden = true; }, 400);
    setTimeout(function () {
      toast(isTouch
        ? 'Swipe or tap the arrows to turn pages · Tap Zoom to read up close'
        : 'Click a page or use the ← → keys to turn pages · Zoom to read up close', 4600);
    }, 500);
  }

  function checkLoader() {
    if (loaderDone || !ready) return;
    var vis = visiblePages();
    for (var i = 0; i < vis.length; i++) {
      if (pages[vis[i]].state < 2) return;
    }
    hideLoader();
  }

  /* ---------- page mode (single page vs two-page spread) ---------- */
  function wantPortrait() {
    var w = bookEl.clientWidth;
    var h = bookEl.clientHeight;
    if (!w || !h) return true;
    var single = Math.min(h, w / RATIO);
    var spread = Math.min(h, w / (2 * RATIO));
    return spread < single * 0.8;
  }

  function modeMinWidth() {
    // page-flip shows one page when the book area is narrower than 2 x minWidth
    return wantPortrait() ? Math.ceil(bookEl.clientWidth / 2) + 4 : 1;
  }

  function syncMode() {
    if (!pf) return;
    pf.getSettings().minWidth = modeMinWidth();
  }

  /* ---------- UI updates ---------- */
  function onPageChange() {
    if (!pf) return;
    var vis = visiblePages();
    var first = vis[0];
    var last = vis[vis.length - 1];
    label.textContent = (vis.length === 2 ? (first + 1) + '–' + (last + 1) : String(first + 1)) + ' / ' + COUNT;

    var atStart = first <= 0;
    var atEnd = last >= COUNT - 1;
    btnPrev.disabled = atStart;
    sidePrev.disabled = atStart;
    btnNext.disabled = atEnd;
    sideNext.disabled = atEnd;

    document.body.classList.toggle('portrait-mode', pf.getOrientation() === 'portrait');
    writeHash(first);
    markThumbs(vis);
    pump();
    checkLoader();
  }

  function next() { if (pf) pf.flipNext('top'); }
  function prev() { if (pf) pf.flipPrev('top'); }

  /* ---------- page list ---------- */
  var thumbs = [];
  function buildThumbs() {
    for (var i = 0; i < COUNT; i++) {
      (function (index) {
        var b = document.createElement('button');
        b.type = 'button';
        b.className = 'thumb';
        b.setAttribute('aria-label', 'Go to page ' + (index + 1));
        b.innerHTML =
          '<span class="thumb-img"><picture>' +
          '<source type="image/webp" srcset="' + src('thumb', index + 1, 'webp') + '">' +
          '<img src="' + src('thumb', index + 1, 'jpg') + '" alt="" loading="lazy" decoding="async" width="240" height="340">' +
          '</picture></span><span class="thumb-num">' + (index + 1) + '</span>';
        b.addEventListener('click', function () {
          closeThumbs();
          if (pf) pf.turnToPage(index);
        });
        grid.appendChild(b);
        thumbs.push(b);
      })(i);
    }
  }

  function markThumbs(vis) {
    for (var i = 0; i < thumbs.length; i++) {
      var on = vis.indexOf(i) !== -1;
      thumbs[i].classList.toggle('is-current', on);
      if (on) thumbs[i].setAttribute('aria-current', 'page');
      else thumbs[i].removeAttribute('aria-current');
    }
  }

  function openThumbs() {
    sheet.hidden = false;
    var cur = thumbs[visiblePages()[0]];
    if (cur && cur.scrollIntoView) {
      try { cur.scrollIntoView({ block: 'center' }); } catch (e) { cur.scrollIntoView(); }
    }
    btnCloseThumbs.focus();
  }

  function closeThumbs() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    btnPages.focus();
  }

  /* ---------- zoom (PhotoSwipe) ---------- */
  var pswp = null;
  function openZoom() {
    var start = visiblePages()[0];
    var ext = webpOK === true ? 'webp' : 'jpg';
    if (typeof window.PhotoSwipe !== 'function') {
      window.open(src('2480', start + 1, ext), '_blank');
      return;
    }
    var data = pages.map(function (p) {
      var item = { src: src('2480', p.n, ext), width: HD_W, height: HD_H, alt: 'Page ' + p.n + ' of ' + COUNT };
      if (p.state === 2 && p.img.currentSrc) item.msrc = p.img.currentSrc;
      return item;
    });
    pswp = new window.PhotoSwipe({
      dataSource: data,
      index: start,
      bgOpacity: 1,
      showHideAnimationType: 'fade',
      paddingFn: function (viewport) {
        var roomy = viewport.x >= 700 && viewport.y >= 600;
        return { top: roomy ? 58 : 0, bottom: roomy ? 18 : 0, left: 0, right: 0 };
      },
      wheelToZoom: true,
      preload: [1, 2],
      closeTitle: 'Close',
      zoomTitle: 'Zoom in/out',
      arrowPrevTitle: 'Previous page',
      arrowNextTitle: 'Next page',
      errorMsg: 'This page could not load. Please check your connection and try again.'
    });
    pswp.on('destroy', function () {
      var idx = pswp.currIndex;
      pswp = null;
      if (pf && typeof idx === 'number' && visiblePages().indexOf(idx) === -1) pf.turnToPage(idx);
    });
    pswp.init();
  }

  /* ---------- share ---------- */
  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      return navigator.clipboard.writeText(text).then(function () { return true; }, function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.position = 'fixed';
    ta.style.top = '-1000px';
    document.body.appendChild(ta);
    ta.select();
    var ok = false;
    try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
    document.body.removeChild(ta);
    return ok;
  }

  btnShare.addEventListener('click', function () {
    var url = location.href.split('#')[0];
    if (navigator.share) {
      navigator.share({ title: document.title, url: url }).catch(function () {});
      return;
    }
    copyText(url).then(function (ok) { toast(ok ? 'Link copied' : url, ok ? 2200 : 6000); });
  });

  /* ---------- fullscreen ---------- */
  var root = document.documentElement;
  var fsSupported = !!(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  function fsElement() { return document.fullscreenElement || document.webkitFullscreenElement || null; }
  if (fsSupported) {
    btnFs.hidden = false;
    btnFs.addEventListener('click', function () {
      var r;
      try {
        if (fsElement()) r = (document.exitFullscreen || document.webkitExitFullscreen).call(document);
        else r = (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
      } catch (e) { r = null; }
      if (r && r.catch) r.catch(function () {});
    });
    var onFs = function () {
      var on = !!fsElement();
      btnFs.classList.toggle('is-fullscreen', on);
      btnFs.setAttribute('aria-label', on ? 'Exit full screen' : 'Full screen');
      btnFs.title = on ? 'Exit full screen' : 'Full screen';
    };
    document.addEventListener('fullscreenchange', onFs);
    document.addEventListener('webkitfullscreenchange', onFs);
  }

  /* ---------- controls ---------- */
  btnPrev.addEventListener('click', prev);
  btnNext.addEventListener('click', next);
  sidePrev.addEventListener('click', prev);
  sideNext.addEventListener('click', next);
  btnZoom.addEventListener('click', openZoom);
  btnPages.addEventListener('click', openThumbs);
  btnCloseThumbs.addEventListener('click', closeThumbs);

  document.addEventListener('keydown', function (e) {
    if (pswp) return;
    if (!sheet.hidden) {
      if (e.key === 'Escape') closeThumbs();
      return;
    }
    if (e.altKey || e.ctrlKey || e.metaKey) return;
    switch (e.key) {
      case 'ArrowRight': case 'PageDown': next(); e.preventDefault(); break;
      case 'ArrowLeft': case 'PageUp': prev(); e.preventDefault(); break;
      case 'Home': if (pf) pf.turnToPage(0); e.preventDefault(); break;
      case 'End': if (pf) pf.turnToPage(COUNT - 1); e.preventDefault(); break;
      default: break;
    }
  });

  /* ---------- fallback: plain scrolling pages ---------- */
  function fallback() {
    var stage = $('stage');
    stage.innerHTML = '';
    var box = document.createElement('div');
    box.className = 'fallback';
    for (var i = 1; i <= COUNT; i++) {
      var img = document.createElement('img');
      img.src = src('1240', i, 'jpg');
      img.alt = 'Page ' + i + ' of ' + COUNT;
      img.loading = i > 2 ? 'lazy' : 'eager';
      img.width = PAGE_W;
      img.height = PAGE_H;
      box.appendChild(img);
    }
    stage.appendChild(box);
    document.querySelector('.bottombar').hidden = true;
  }

  /* ---------- start ---------- */
  function start() {
    buildThumbs();

    if (!window.St || typeof window.St.PageFlip !== 'function') {
      fallback();
      return;
    }

    for (var i = 0; i < pages.length; i++) bookEl.appendChild(pages[i].el);

    // runs before page-flip's own resize handler, so the right mode is used
    window.addEventListener('resize', syncMode);

    try {
      pf = new window.St.PageFlip(bookEl, {
        width: PAGE_W,
        height: PAGE_H,
        size: 'stretch',
        minWidth: modeMinWidth(),
        maxWidth: 20000,
        minHeight: 1,
        maxHeight: 20000,
        autoSize: false,
        showCover: true,
        usePortrait: true,
        drawShadow: true,
        maxShadowOpacity: 0.45,
        flippingTime: 750,
        mobileScrollSupport: true,
        swipeDistance: 30,
        showPageCorners: true,
        disableFlipByClick: false,
        startPage: pageFromHash()
      });
      pf.loadFromHTML(pages.map(function (p) { return p.el; }));
    } catch (err) {
      if (window.console) console.error(err);
      pf = null;
      fallback();
      return;
    }

    // page-flip pins a min size on the book element; let the layout control it
    bookEl.style.minWidth = '0px';
    bookEl.style.minHeight = '0px';

    pf.on('flip', onPageChange);
    pf.on('changeOrientation', onPageChange);

    // a page link opened in an already-open tab (e.g. ...#p=9)
    window.addEventListener('hashchange', function () {
      if (!pf || !/(?:^|[#&])p=\d+/.test(location.hash || '')) return;
      var target = pageFromHash();
      if (visiblePages().indexOf(target) === -1) pf.turnToPage(target);
    });
    pf.on('init', function () {
      ready = true;
      syncMode();
      pf.update();
      onPageChange();
    });

    if (window.ResizeObserver) {
      var raf = 0;
      new ResizeObserver(function () {
        cancelAnimationFrame(raf);
        raf = requestAnimationFrame(function () {
          if (!pf) return;
          syncMode();
          pf.update();
        });
      }).observe(bookEl);
    }

    // never leave the loader up for long, even on a very slow connection
    setTimeout(hideLoader, 7000);
  }

  start();
})();
