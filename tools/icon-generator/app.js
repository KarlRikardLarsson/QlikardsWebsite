/* Qlikard — Icon Generator (vanilla JS, no dependencies)
   Everything persists in localStorage:
   icongen_library  — saved background templates
   icongen_assets   — uploaded logos/pictures (re-usable across sessions)
   icongen_history  — recently generated icons (with settings snapshots)
   icongen_settings — last-used settings
*/
(function () {
  'use strict';

  var W = 864, H = 540, STRIP_H = 150;

  var BUILTINS = {
    'gradient_ocean':    { label: 'Ocean',    css: 'linear-gradient(135deg, #0f2027 0%, #203a43 50%, #2c5364 100%)', gradient: { x0: 0, y0: 0, x1: 1, y1: 1, stops: [[0, '#0f2027'], [0.5, '#203a43'], [1, '#2c5364']] } },
    'gradient_midnight': { label: 'Midnight', css: 'linear-gradient(135deg, #141e30, #243b55)', gradient: { x0: 0, y0: 0, x1: 1, y1: 1, stops: [[0, '#141e30'], [1, '#243b55']] } },
    'gradient_forest':   { label: 'Forest',   css: 'linear-gradient(135deg, #134e5e, #71b280)', gradient: { x0: 0, y0: 0, x1: 1, y1: 1, stops: [[0, '#134e5e'], [1, '#71b280']] } },
    'gradient_slate':    { label: 'Slate',    css: 'linear-gradient(45deg, #2c3e50, #4ca1af)',  gradient: { x0: 0, y0: 1, x1: 1, y1: 0, stops: [[0, '#2c3e50'], [1, '#4ca1af']] } },
    'gradient_sunset':   { label: 'Sunset',   css: 'linear-gradient(135deg, #c94b4b, #4b134f)', gradient: { x0: 0, y0: 0, x1: 1, y1: 1, stops: [[0, '#c94b4b'], [1, '#4b134f']] } },
    'Fortnox Green':     { label: 'Fortnox Green',  img: 'backgrounds/fortnox_green.png' },
    'Corporate Blue':    { label: 'Corporate Blue', img: 'backgrounds/corporate_blue.png' }
  };
  var PAL = ['#1a1a2e', '#0f3460', '#16213e', '#0f766e', '#009844', '#166534', '#c94b4b', '#7c3aed', '#374151', '#1f2937'];
  var TEXT_PAL = ['#ffffff', '#1a1a2e', '#807a71', '#009844'];
  var MODE_HINTS = {
    logo: 'Solid colour with a white strip — your logo sits in the strip or a corner.',
    strip: 'Image on top, white strip below for the text.'
  };

  // ── state ──
  var S = {
    bgSel: { type: 'builtin', key: 'gradient_ocean' },
    title: '', align: 'center', bold: false, size: '288x180',
    builderOpen: false, mode: 'logo', uploadByMode: {},
    logoPos: 'bottom-right', bgColor: '#0f3460', fit: 'contain', stripTransparent: false, stripAuto: true,
    titleColor: 'auto',
    assets: [], library: [], history: [],
    pickerTarget: null, hue: 215, sat: 0.94, vv: 0.38
  };

  var $ = function (id) { return document.getElementById(id); };
  var canvas = $('canvas'), ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = true; ctx.imageSmoothingQuality = 'high';
  var imgCache = {};
  var slDragging = false, toastTimer = null;

  // ── storage ──
  function read(key, fb) { try { return JSON.parse(localStorage.getItem(key)) || fb; } catch (e) { return fb; } }
  function write(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch (e) { toast('Browser storage is full — could not save'); return false; }
  }
  function saveSettings() {
    write('icongen_settings', {
      bgSel: S.bgSel, title: S.title, align: S.align, bold: S.bold,
      size: S.size, mode: S.mode, uploadByMode: S.uploadByMode, logoPos: S.logoPos,
      bgColor: S.bgColor, fit: S.fit, stripTransparent: S.stripTransparent, stripAuto: S.stripAuto,
      titleColor: S.titleColor
    });
  }
  function update(partial) {
    Object.assign(S, partial);
    saveSettings();
    sync();
    draw();
  }

  function toast(msg) {
    $('toast-msg').textContent = msg;
    $('toast').classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { $('toast').classList.remove('visible'); }, 2600);
  }

  // ── colour helpers ──
  function hsvToHex(h, s, v) {
    function f(n) {
      var k = (n + h / 60) % 6;
      var c = v - v * s * Math.max(0, Math.min(k, 4 - k, 1));
      return ('0' + Math.round(c * 255).toString(16)).slice(-2);
    }
    return '#' + f(5) + f(3) + f(1);
  }
  function hexToHsv(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    var r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
    var max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min, h = 0;
    if (d > 0) {
      if (max === r) h = 60 * (((g - b) / d) % 6);
      else if (max === g) h = 60 * ((b - r) / d + 2);
      else h = 60 * ((r - g) / d + 4);
    }
    if (h < 0) h += 360;
    return { h: h, s: max === 0 ? 0 : d / max, v: max };
  }

  // ── image cache ──
  function getImg(key, src) {
    if (imgCache[key]) return imgCache[key].complete && imgCache[key].naturalWidth > 0 ? imgCache[key] : null;
    var img = new Image();
    img.onload = function () { draw(); };
    img.src = src;
    imgCache[key] = img;
    return null;
  }

  // Sample the average colour of an image's four corners, so a logo on a solid
  // background can extend seamlessly into the empty side/top areas.
  var edgeCache = {};
  function edgeColor(key, img) {
    if (edgeCache[key]) return edgeCache[key];
    try {
      var s = 10;
      var oc = document.createElement('canvas');
      oc.width = s; oc.height = s;
      var octx = oc.getContext('2d');
      octx.drawImage(img, 0, 0, s, s);
      var pts = [[0, 0], [s - 1, 0], [0, s - 1], [s - 1, s - 1]];
      var r = 0, g = 0, b = 0;
      pts.forEach(function (p) {
        var d = octx.getImageData(p[0], p[1], 1, 1).data;
        r += d[0]; g += d[1]; b += d[2];
      });
      var n = pts.length;
      var col = 'rgb(' + Math.round(r / n) + ',' + Math.round(g / n) + ',' + Math.round(b / n) + ')';
      edgeCache[key] = col;
      return col;
    } catch (e) { return null; }
  }

  // Find the bounding box of the actual content, ignoring a uniform (or transparent)
  // border baked into the image, so a padded logo can be shown larger. Returns a
  // source rectangle {sx,sy,sw,sh}; falls back to the full image when nothing to trim.
  var trimCache = {};
  function contentBounds(key, img) {
    if (trimCache[key]) return trimCache[key];
    var full = { sx: 0, sy: 0, sw: img.width, sh: img.height };
    try {
      var scale = Math.min(1, 200 / Math.max(img.width, img.height));
      var w = Math.max(1, Math.round(img.width * scale));
      var h = Math.max(1, Math.round(img.height * scale));
      var oc = document.createElement('canvas'); oc.width = w; oc.height = h;
      var octx = oc.getContext('2d');
      octx.drawImage(img, 0, 0, w, h);
      var data = octx.getImageData(0, 0, w, h).data;
      var r0 = data[0], g0 = data[1], b0 = data[2], a0 = data[3];
      var thresh = 48, minX = w, minY = h, maxX = -1, maxY = -1;
      for (var y = 0; y < h; y++) {
        for (var x = 0; x < w; x++) {
          var i = (y * w + x) * 4, a = data[i + 3], diff;
          if (a0 < 16) diff = a > 24 ? 999 : 0;   // transparent border → content = opaque pixels
          else diff = Math.abs(data[i] - r0) + Math.abs(data[i + 1] - g0) + Math.abs(data[i + 2] - b0) + Math.abs(a - a0);
          if (diff > thresh) {
            if (x < minX) minX = x; if (x > maxX) maxX = x;
            if (y < minY) minY = y; if (y > maxY) maxY = y;
          }
        }
      }
      if (maxX >= minX && maxY >= minY && (maxX - minX < w - 2 || maxY - minY < h - 2)) {
        var inv = 1 / scale;
        full = {
          sx: Math.round(minX * inv), sy: Math.round(minY * inv),
          sw: Math.round((maxX - minX + 1) * inv), sh: Math.round((maxY - minY + 1) * inv)
        };
      }
    } catch (e) { /* cross-origin or read failure → use full image */ }
    trimCache[key] = full;
    return full;
  }

  function currentAsset(kind) {
    var id = S.uploadByMode[kind];
    for (var i = 0; i < S.assets.length; i++) if (S.assets[i].id === id) return S.assets[i];
    return null;
  }

  // Height of the white text strip for the current background, in canvas px (0 = none).
  // Saved templates keep the strip height they were baked with so text lines up.
  function stripHeight() {
    if (S.bgSel.type === 'builtin') return 0;
    if (S.bgSel.type === 'saved') {
      var t = S.library.find(function (x) { return x.id === S.bgSel.id; });
      if (!t) return 0;
      return t.stripH || (t.hasWhiteStrip ? 140 : 0);
    }
    return STRIP_H;
  }

  // ── scene renderer ──
  function drawScene(c, includeText) {
    c.clearRect(0, 0, W, H);
    var pending = false;

    function drawStrip() {
      var top = H - STRIP_H;
      // soft shadow above the strip for a little depth (instead of a hard line)
      var sg = c.createLinearGradient(0, top - 28, 0, top);
      sg.addColorStop(0, 'rgba(0,0,0,0)');
      sg.addColorStop(1, 'rgba(0,0,0,0.13)');
      c.fillStyle = sg;
      c.fillRect(0, top - 28, W, 28);
      c.fillStyle = '#ffffff';
      c.fillRect(0, top, W, STRIP_H);
    }
    function drawCover(img, areaH) {
      var r = Math.max(W / img.width, areaH / img.height);
      var dx = (W - img.width * r) / 2, dy = (areaH - img.height * r) / 2;
      c.save(); c.beginPath(); c.rect(0, 0, W, areaH); c.clip();
      c.drawImage(img, dx, dy, img.width * r, img.height * r);
      c.restore();
    }

    if (S.bgSel.type === 'builtin') {
      var b = BUILTINS[S.bgSel.key];
      if (b.gradient) {
        var g = b.gradient;
        var grad = c.createLinearGradient(g.x0 * W, g.y0 * H, g.x1 * W, g.y1 * H);
        g.stops.forEach(function (st) { grad.addColorStop(st[0], st[1]); });
        c.fillStyle = grad;
        c.fillRect(0, 0, W, H);
      } else {
        c.fillStyle = '#1a1a2e'; c.fillRect(0, 0, W, H);
        var bi = getImg('builtin:' + S.bgSel.key, b.img);
        if (bi) drawCover(bi, H); else pending = true;
      }
    } else if (S.bgSel.type === 'saved') {
      var t = S.library.find(function (x) { return x.id === S.bgSel.id; });
      if (t) {
        var si = getImg('saved:' + t.id, t.dataUrl);
        if (si) c.drawImage(si, 0, 0, W, H); else pending = true;
      }
    } else {
      // custom (live builder)
      var areaH = H - STRIP_H, a, img;
      if (S.mode === 'strip') {
        a = currentAsset('strip');
        if (a) {
          img = getImg('asset:' + a.id, a.dataUrl);
          if (img) {
            var fill = S.stripAuto ? edgeColor('asset:' + a.id, img)
              : (S.stripTransparent ? null : S.bgColor);
            if (fill) { c.fillStyle = fill; c.fillRect(0, 0, W, areaH); }
            var cb = contentBounds('asset:' + a.id, img);
            var r = Math.min(W / cb.sw, areaH / cb.sh) * 0.82;   // 0.82 = balanced margin
            var dw = cb.sw * r, dh = cb.sh * r;
            c.drawImage(img, cb.sx, cb.sy, cb.sw, cb.sh, (W - dw) / 2, (areaH - dh) / 2, dw, dh);
            drawStrip();
          } else pending = true;
        } else {
          if (S.stripAuto || S.stripTransparent) {
            drawStrip();
            c.fillStyle = '#807A71';
          } else {
            c.fillStyle = S.bgColor; c.fillRect(0, 0, W, areaH);
            drawStrip();
            c.fillStyle = 'rgba(255,255,255,0.7)';
          }
          c.font = '500 26px "IBM Plex Sans", sans-serif';
          c.textAlign = 'center'; c.fillText('Choose an image for the top area', W / 2, areaH / 2);
        }
      } else {
        // logo + colour
        c.fillStyle = S.bgColor; c.fillRect(0, 0, W, H);
        drawStrip();
        a = currentAsset('logo');
        if (a) {
          img = getImg('asset:' + a.id, a.dataUrl);
          if (img) {
            var stripTop = H - STRIP_H;
            var ls = Math.min(84 / img.height, 259 / img.width);
            var lw = img.width * ls, lh = img.height * ls, pad = 32, lx, ly;
            switch (S.logoPos) {
              case 'bottom-right': lx = W - lw - pad; ly = stripTop + (STRIP_H - lh) / 2; break;
              case 'bottom-left':  lx = pad; ly = stripTop + (STRIP_H - lh) / 2; break;
              case 'top-right':    lx = W - lw - pad; ly = pad; break;
              case 'top-left':     lx = pad; ly = pad; break;
              default:             lx = (W - lw) / 2; ly = (H - STRIP_H - lh) / 2;
            }
            c.drawImage(img, lx, ly, lw, lh);
          } else pending = true;
        }
      }
    }

    if (!includeText || !S.title) return !pending;

    var sh = stripHeight();
    var padX = 60, maxTextW = W - padX * 2;
    var ax = S.align === 'center' ? W / 2 : S.align === 'right' ? W - padX : padX;
    c.textAlign = S.align === 'center' ? 'center' : S.align === 'right' ? 'right' : 'left';
    c.textBaseline = 'middle';

    // shrink the font until the text fits the available width, so it never clips
    var weight = S.bold ? '700' : '600';
    var size = sh > 0 ? 58 : 92;
    c.font = weight + ' ' + size + 'px "IBM Plex Sans", sans-serif';
    while (size > 22 && c.measureText(S.title).width > maxTextW) {
      size -= 2;
      c.font = weight + ' ' + size + 'px "IBM Plex Sans", sans-serif';
    }

    var auto = !S.titleColor || S.titleColor === 'auto';
    if (sh > 0) {
      c.fillStyle = auto ? '#1a1a2e' : S.titleColor;       // dark on the white strip
      c.fillText(S.title, ax, (H - sh) + sh / 2);
    } else {
      c.fillStyle = auto ? '#ffffff' : S.titleColor;       // light over an image / gradient
      c.fillText(S.title, ax, H / 2);
    }
    c.textBaseline = 'alphabetic';
    return !pending;
  }

  function draw() { drawScene(ctx, true); }

  // ── UI rendering ──
  function el(tag, cls, parent) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (parent) parent.appendChild(e);
    return e;
  }

  function renderTiles() {
    var box = $('tiles');
    box.innerHTML = '';
    Object.keys(BUILTINS).forEach(function (key) {
      var b = BUILTINS[key];
      var d = el('div', 'tile', box);
      d.title = b.label;
      d.style.backgroundImage = b.css || ("url('" + b.img + "')");
      if (S.bgSel.type === 'builtin' && S.bgSel.key === key) d.classList.add('sel');
      d.onclick = function () { update({ bgSel: { type: 'builtin', key: key }, builderOpen: false, pickerTarget: null }); };
    });
    S.library.forEach(function (t) {
      var d = el('div', 'tile', box);
      d.title = t.name;
      d.style.backgroundImage = "url('" + t.dataUrl + "')";
      if (S.bgSel.type === 'saved' && S.bgSel.id === t.id) d.classList.add('sel');
      d.onclick = function () { update({ bgSel: { type: 'saved', id: t.id }, builderOpen: false, pickerTarget: null }); };
    });
    var nb = el('div', 'tile tile-new', box);
    nb.innerHTML = '<span class="plus">+</span><span class="lbl">New template</span>';
    if (S.builderOpen || S.bgSel.type === 'custom') nb.classList.add('sel');
    nb.onclick = function () {
      var opening = !S.builderOpen;
      update({ builderOpen: opening, bgSel: opening ? { type: 'custom' } : S.bgSel });
    };
  }

  function renderAssets() {
    var box = $('assets');
    box.innerHTML = '';
    var kind = S.mode;
    var list = S.assets.filter(function (a) { return a.kind === kind; });
    $('assets-block').hidden = list.length === 0;
    list.forEach(function (a) {
      var chip = el('div', 'chip', box);
      chip.title = a.name;
      if (S.uploadByMode[kind] === a.id) chip.classList.add('sel');
      var th = el('span', 'thumb', chip);
      th.style.backgroundImage = "url('" + a.dataUrl + "')";
      el('span', 'nm', chip).textContent = a.name;
      var x = el('span', 'x', chip);
      x.textContent = '×';
      x.title = 'Remove from saved uploads';
      x.onclick = function (e) {
        e.stopPropagation();
        var assets = S.assets.filter(function (b) { return b.id !== a.id; });
        var ubm = Object.assign({}, S.uploadByMode);
        if (ubm[kind] === a.id) delete ubm[kind];
        write('icongen_assets', assets);
        update({ assets: assets, uploadByMode: ubm });
      };
      chip.onclick = function () {
        var ubm = Object.assign({}, S.uploadByMode);
        ubm[kind] = a.id;
        update({ uploadByMode: ubm, bgSel: { type: 'custom' } });
      };
    });
  }

  function renderSwatchRow(boxId, palette, current, onPick, extra) {
    var box = $(boxId);
    box.innerHTML = '';
    (extra || []).forEach(function (fn) { fn(box); });
    palette.forEach(function (color) {
      var sw = el('div', 'swatch' + (boxId === 'bg-swatches' ? '' : ' mini'), box);
      sw.style.background = color;
      sw.title = color;
      if (current && current.toLowerCase() === color.toLowerCase()) sw.classList.add('sel');
      sw.onclick = function () { onPick(color); };
    });
  }

  function renderHistory() {
    var sec = $('history-sec'), box = $('history');
    sec.hidden = S.history.length === 0;
    box.innerHTML = '';
    S.history.forEach(function (h) {
      var d = el('div', 'htile', box);
      d.title = h.title + ' — click to restore settings';
      d.style.backgroundImage = "url('" + h.thumb + "')";
      d.onclick = function () { restoreSnapshot(h.snapshot); };
    });
  }

  function sync() {
    renderTiles();
    renderAssets();
    renderHistory();

    $('builder').hidden = !S.builderOpen;
    $('delete-tpl-row').hidden = S.bgSel.type !== 'saved';
    $('mode-hint').textContent = MODE_HINTS[S.mode];

    document.querySelectorAll('.mode-btn').forEach(function (b) {
      b.classList.toggle('sel', b.dataset.mode === S.mode);
    });

    var a = currentAsset(S.mode);
    $('drop-label').textContent = a ? 'Using: ' + a.name
      : (S.mode === 'logo' ? 'Choose your logo' : 'Choose a picture');

    $('pos-block').hidden = S.mode !== 'logo';
    $('color-block').hidden = !(S.mode === 'logo' || S.mode === 'strip');
    $('logo-pos').value = S.logoPos;

    // bg swatches (with auto + transparent options in strip mode + custom button)
    var autoActive = S.mode === 'strip' && S.stripAuto;
    var transparentActive = S.mode === 'strip' && !S.stripAuto && S.stripTransparent;
    renderSwatchRow('bg-swatches', PAL,
      (autoActive || transparentActive) ? null : S.bgColor,
      function (color) {
        var hsv = hexToHsv(color);
        update({ bgColor: color, stripAuto: false, stripTransparent: false, bgSel: { type: 'custom' }, hue: hsv.h, sat: hsv.s, vv: hsv.v });
        if (S.pickerTarget === 'bg') updatePicker();
      },
      [function (box) {
        if (S.mode !== 'strip') return;
        var auto = el('button', 'auto-btn', box);
        auto.type = 'button';
        auto.textContent = 'Auto';
        auto.title = 'Match the picture’s edge colour';
        if (autoActive) auto.classList.add('sel');
        auto.onclick = function () { update({ stripAuto: true, stripTransparent: false, bgSel: { type: 'custom' } }); };
        var sw = el('div', 'swatch transparent', box);
        sw.title = 'Transparent';
        if (transparentActive) sw.classList.add('sel');
        sw.onclick = function () { update({ stripTransparent: true, stripAuto: false, bgSel: { type: 'custom' } }); };
      }]);
    // custom colour button for bg
    (function () {
      var box = $('bg-swatches');
      var btn = el('span', 'custom-btn', box);
      if (S.pickerTarget === 'bg') btn.classList.add('sel');
      btn.innerHTML = '<span class="dot" style="background:' + S.bgColor + '"></span><span class="txt">Custom…</span>';
      btn.onclick = function () { togglePicker('bg'); };
    })();

    // text controls
    $('title').value === S.title || ($('title').value = S.title);
    document.querySelectorAll('#align-seg button').forEach(function (b) {
      b.classList.toggle('sel', b.dataset.align === S.align);
    });
    $('bold-btn').classList.toggle('sel', S.bold);

    $('title-auto').classList.toggle('sel', S.titleColor === 'auto');
    renderSwatchRow('title-swatches', TEXT_PAL, S.titleColor === 'auto' ? null : S.titleColor, function (color) {
      update({ titleColor: color });
      if (S.pickerTarget === 'title') updatePicker();
    });
    $('title-custom').querySelector('.dot').style.background = S.titleColor === 'auto' ? '#1a1a2e' : S.titleColor;
    $('title-custom').classList.toggle('sel', S.pickerTarget === 'title');

    // size + preview
    document.querySelectorAll('.size-btn').forEach(function (b) {
      b.classList.toggle('sel', b.dataset.size === S.size);
    });
    $('export-note').textContent = S.size.replace('x', ' × ');
    $('file-hint').textContent = fileName();
    $('canvas-wrap').classList.toggle('checker',
      S.bgSel.type === 'custom' && transparentActive);

    // picker placement + visibility
    var picker = $('picker');
    picker.hidden = !S.pickerTarget;
    if (S.pickerTarget === 'bg') $('bg-picker-slot').appendChild(picker);
    else if (S.pickerTarget) $('text-picker-slot').appendChild(picker);
  }

  function fileName() {
    return 'Icon_' + (S.title.replace(/[^a-zA-Z0-9]+/g, '') || 'Untitled') + '_' + S.size + '.png';
  }

  // ── colour picker ──
  function pickerColor() {
    if (S.pickerTarget === 'title') return S.titleColor === 'auto' ? '#1a1a2e' : S.titleColor;
    return S.bgColor;
  }
  function togglePicker(target) {
    if (S.pickerTarget === target) { update({ pickerTarget: null }); return; }
    var hsv = hexToHsv(target === 'title' ? (S.titleColor === 'auto' ? '#1a1a2e' : S.titleColor) : S.bgColor) || { h: 215, s: 0.9, v: 0.4 };
    update({ pickerTarget: target, hue: hsv.h, sat: hsv.s, vv: hsv.v });
    updatePicker();
  }
  function updatePicker() {
    if (!S.pickerTarget) return;
    $('picker-label').textContent = S.pickerTarget === 'title' ? 'Text colour' : 'Background colour';
    $('sl').style.backgroundImage = 'linear-gradient(to top, #000, rgba(0,0,0,0)), linear-gradient(to right, #fff, hsl(' + Math.round(S.hue) + ', 100%, 50%))';
    var dot = $('sl-dot');
    dot.style.left = (S.sat * 100).toFixed(1) + '%';
    dot.style.top = ((1 - S.vv) * 100).toFixed(1) + '%';
    dot.style.background = pickerColor();
    $('hue').value = Math.round(S.hue);
    $('picker-swatch').style.background = pickerColor();
    if (document.activeElement !== $('hex')) $('hex').value = pickerColor();
  }
  function applyHsv(hue, sat, vv) {
    var hex = hsvToHex(hue, sat, vv);
    var partial = { hue: hue, sat: sat, vv: vv };
    if (S.pickerTarget === 'title') partial.titleColor = hex;
    else { partial.bgColor = hex; partial.stripTransparent = false; partial.stripAuto = false; partial.bgSel = { type: 'custom' }; }
    update(partial);
    updatePicker();
  }
  function slPick(e) {
    var rect = $('sl').getBoundingClientRect();
    var sat = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    var vv = 1 - Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    applyHsv(S.hue, sat, vv);
  }

  // ── uploads ──
  function handleFile(file) {
    if (!file || !file.type || file.type.indexOf('image') !== 0) return;
    var reader = new FileReader();
    reader.onload = function (ev) {
      var dataUrl = ev.target.result;
      if (dataUrl.length > 2500000) { toast('Image too large to save — try a smaller file'); return; }
      var kind = S.mode;
      var asset = { id: 'a_' + Date.now(), name: file.name, dataUrl: dataUrl, kind: kind };
      var assets = S.assets.concat([asset]);
      var ubm = Object.assign({}, S.uploadByMode);
      ubm[kind] = asset.id;
      if (write('icongen_assets', assets)) {
        update({ assets: assets, uploadByMode: ubm, bgSel: { type: 'custom' } });
        toast('"' + file.name + '" saved — it will be here next time');
      }
    };
    reader.readAsDataURL(file);
  }

  // ── templates ──
  function saveTemplate() {
    if (S.mode === 'logo' && !currentAsset('logo')) { toast('Choose a logo first'); return; }
    if (S.mode !== 'logo' && !currentAsset(S.mode)) { toast('Choose an image first'); return; }
    var off = document.createElement('canvas');
    off.width = W; off.height = H;
    if (!drawScene(off.getContext('2d'), false)) { toast('Image still loading — try again in a second'); return; }
    var name = $('tpl-name').value.trim() || ('Custom ' + (S.library.length + 1));
    var item = { id: 'custom_' + Date.now(), name: name, dataUrl: off.toDataURL('image/png'), canvasX: W, canvasY: H, hasWhiteStrip: true, stripH: STRIP_H };
    var library = S.library.concat([item]);
    if (write('icongen_library', library)) {
      $('tpl-name').value = '';
      update({ library: library, builderOpen: false, pickerTarget: null, bgSel: { type: 'saved', id: item.id } });
      toast('"' + name + '" saved to library');
    }
  }

  // ── download + history ──
  function download() {
    var parts = S.size.split('x');
    var off = document.createElement('canvas');
    off.width = parseInt(parts[0], 10); off.height = parseInt(parts[1], 10);
    off.getContext('2d').drawImage(canvas, 0, 0, off.width, off.height);
    off.toBlob(function (blob) {
      var a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = fileName();
      a.click();
      setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    });
    var th = document.createElement('canvas');
    th.width = 216; th.height = 135;
    th.getContext('2d').drawImage(canvas, 0, 0, 216, 135);
    var entry = {
      id: 'h_' + Date.now(),
      thumb: th.toDataURL('image/png'),
      title: S.title || 'Untitled',
      snapshot: {
        bgSel: S.bgSel, title: S.title, align: S.align, bold: S.bold,
        size: S.size, mode: S.mode, uploadByMode: S.uploadByMode, logoPos: S.logoPos,
        bgColor: S.bgColor, fit: S.fit, stripTransparent: S.stripTransparent, stripAuto: S.stripAuto,
        titleColor: S.titleColor
      }
    };
    var history = [entry].concat(S.history).slice(0, 12);
    write('icongen_history', history);
    S.history = history;
    sync();
  }

  function restoreSnapshot(snap) {
    var next = Object.assign({}, snap);
    if (next.bgSel && next.bgSel.type === 'saved' &&
        !S.library.find(function (t) { return t.id === next.bgSel.id; })) {
      toast('That template was deleted — background not restored');
      delete next.bgSel;
    }
    if (next.bgSel && next.bgSel.type === 'custom') next.builderOpen = true;
    update(next);
    toast('Settings restored');
  }

  // ── event wiring ──
  $('title').addEventListener('input', function () { update({ title: this.value }); });
  document.querySelectorAll('#align-seg button').forEach(function (b) {
    b.addEventListener('click', function () { update({ align: b.dataset.align }); });
  });
  $('bold-btn').addEventListener('click', function () { update({ bold: !S.bold }); });
  $('title-auto').addEventListener('click', function () { update({ titleColor: 'auto' }); });
  $('title-custom').addEventListener('click', function () { togglePicker('title'); });
  document.querySelectorAll('.size-btn').forEach(function (b) {
    b.addEventListener('click', function () { update({ size: b.dataset.size }); });
  });
  document.querySelectorAll('.mode-btn').forEach(function (b) {
    b.addEventListener('click', function () { update({ mode: b.dataset.mode, bgSel: { type: 'custom' } }); });
  });
  $('logo-pos').addEventListener('change', function () { update({ logoPos: this.value, bgSel: { type: 'custom' } }); });
  $('file-input').addEventListener('change', function (e) {
    handleFile(e.target.files[0]);
    e.target.value = '';
  });
  var dz = $('dropzone');
  dz.addEventListener('dragover', function (e) { e.preventDefault(); dz.classList.add('over'); });
  dz.addEventListener('dragleave', function () { dz.classList.remove('over'); });
  dz.addEventListener('drop', function (e) {
    e.preventDefault();
    dz.classList.remove('over');
    handleFile(e.dataTransfer.files[0]);
  });
  $('save-tpl').addEventListener('click', saveTemplate);
  $('delete-tpl').addEventListener('click', function () {
    var t = S.library.find(function (x) { return x.id === S.bgSel.id; });
    var library = S.library.filter(function (x) { return x.id !== S.bgSel.id; });
    write('icongen_library', library);
    update({ library: library, bgSel: { type: 'builtin', key: 'gradient_ocean' } });
    toast('"' + (t ? t.name : 'Template') + '" deleted');
  });
  $('download').addEventListener('click', download);
  $('clear-history').addEventListener('click', function () {
    write('icongen_history', []);
    S.history = [];
    sync();
  });

  var sl = $('sl');
  sl.addEventListener('pointerdown', function (e) {
    e.preventDefault();
    sl.setPointerCapture(e.pointerId);
    slDragging = true;
    slPick(e);
  });
  sl.addEventListener('pointermove', function (e) { if (slDragging) slPick(e); });
  sl.addEventListener('pointerup', function () { slDragging = false; });
  $('hue').addEventListener('input', function () { applyHsv(parseInt(this.value, 10), S.sat, S.vv); });
  $('hex').addEventListener('input', function () {
    var hsv = hexToHsv(this.value);
    if (!hsv) return;
    var hex = (this.value.charAt(0) === '#' ? this.value : '#' + this.value).toLowerCase();
    var partial = { hue: hsv.h, sat: hsv.s, vv: hsv.v };
    if (S.pickerTarget === 'title') partial.titleColor = hex;
    else { partial.bgColor = hex; partial.stripTransparent = false; partial.stripAuto = false; partial.bgSel = { type: 'custom' }; }
    update(partial);
    updatePicker();
  });

  // ── init ──
  (function init() {
    var settings = read('icongen_settings', null);
    S.library = read('icongen_library', []);
    S.assets = read('icongen_assets', []);
    S.history = read('icongen_history', []);
    if (settings) {
      Object.assign(S, settings);
      if (S.mode !== 'logo' && S.mode !== 'strip') S.mode = 'strip';
      if (S.bgSel && S.bgSel.type === 'saved' &&
          !S.library.find(function (t) { return t.id === S.bgSel.id; })) {
        S.bgSel = { type: 'builtin', key: 'gradient_ocean' };
      }
      S.builderOpen = S.bgSel.type === 'custom';
    }
    S.pickerTarget = null;
    $('title').value = S.title;
    sync();
    draw();
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(draw);
  })();

})();
