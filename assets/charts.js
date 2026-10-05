/* Tiny SVG charts for the growth console: line vs plan, stacked columns, horizontal bars. */
var AI60Charts = (function () {
  'use strict';
  var NS = 'http://www.w3.org/2000/svg';

  function svgEl(tag, attrs, parent) {
    var n = document.createElementNS(NS, tag);
    Object.keys(attrs || {}).forEach(function (k) { n.setAttribute(k, attrs[k]); });
    if (parent) parent.appendChild(n);
    return n;
  }
  function text(parent, x, y, str, attrs) {
    var t = svgEl('text', Object.assign({ x: x, y: y }, attrs || {}), parent);
    t.textContent = str;
    return t;
  }
  function niceMax(v) {
    if (v <= 10) return 10;
    var mag = Math.pow(10, Math.floor(Math.log10(v)));
    var steps = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
    for (var i = 0; i < steps.length; i++) if (steps[i] * mag >= v) return steps[i] * mag;
    return 10 * mag;
  }
  function ticks(max, n) {
    var raw = max / (n || 4);
    var mag = Math.pow(10, Math.floor(Math.log10(raw)));
    var step = [1, 2, 2.5, 5, 10].map(function (s) { return s * mag; }).filter(function (s) { return s >= raw; })[0];
    var out = [];
    for (var v = 0; v <= max + 1e-9; v += step) out.push(Math.round(v));
    return out;
  }
  function fmt(n) { return Math.round(n).toLocaleString('en-IN'); }

  function legend(ul, items) {
    if (!ul) return;
    ul.textContent = '';
    items.forEach(function (it) {
      var li = document.createElement('li');
      var i = document.createElement('i');
      if (it.line) i.className = 'line';
      i.style.background = it.color;
      li.appendChild(i);
      li.appendChild(document.createTextNode(it.name));
      ul.appendChild(li);
    });
  }

  function tooltip(container) {
    var tip = container.querySelector('.tooltip');
    if (!tip) { tip = document.createElement('div'); tip.className = 'tooltip'; tip.hidden = true; container.appendChild(tip); }
    return {
      show: function (title, rows, xPx, yPx) {
        tip.textContent = '';
        var b = document.createElement('b'); b.textContent = title; tip.appendChild(b);
        rows.forEach(function (r) {
          var row = document.createElement('div'); row.className = 'r';
          var a = document.createElement('span');
          if (r.color) { var i = document.createElement('i'); i.style.background = r.color; a.appendChild(i); }
          a.appendChild(document.createTextNode(r.name));
          var v = document.createElement('span'); v.textContent = r.value;
          row.appendChild(a); row.appendChild(v); tip.appendChild(row);
        });
        tip.hidden = false;
        var w = container.clientWidth, tw = tip.offsetWidth;
        var left = xPx + 14 + tw > w ? xPx - tw - 14 : xPx + 14;
        tip.style.left = Math.max(0, left) + 'px';
        tip.style.top = Math.max(0, yPx - 10) + 'px';
      },
      hide: function () { tip.hidden = true; }
    };
  }

  // Map a pointer event to viewBox coordinates.
  function toView(svg, ev, W) {
    var r = svg.getBoundingClientRect();
    return { x: (ev.clientX - r.left) * (W / r.width), px: ev.clientX - r.left, py: ev.clientY - r.top };
  }

  // ---------- cumulative line vs plan ----------
  function line(container, opts) {
    container.textContent = '';
    var W = 640, H = 270, L = 44, R = 60, T = 14, B = 30;
    var labels = opts.labels, n = labels.length;
    var all = [opts.goal || 0];
    opts.series.forEach(function (s) { s.values.forEach(function (v) { if (v != null) all.push(v); }); });
    var yMax = niceMax(Math.max.apply(null, all) * 1.08);
    var x = function (i) { return L + (n === 1 ? 0 : i * (W - L - R) / (n - 1)); };
    var y = function (v) { return T + (H - T - B) * (1 - v / yMax); };
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.aria || 'Line chart' }, container);

    ticks(yMax, 4).forEach(function (t) {
      svgEl('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), style: 'stroke:var(--grid)', 'stroke-width': 1 }, svg);
      text(svg, L - 8, y(t) + 4, fmt(t), { 'text-anchor': 'end' });
    });
    labels.forEach(function (lb, i) { text(svg, x(i), H - 8, lb, { 'text-anchor': 'middle' }); });
    if (opts.goal) {
      svgEl('line', { x1: L, x2: W - R, y1: y(opts.goal), y2: y(opts.goal), style: 'stroke:var(--ink-2)', 'stroke-width': 1, opacity: 0.55 }, svg);
      text(svg, L + 6, y(opts.goal) - 7, 'Goal ' + fmt(opts.goal), { class: 'lbl-strong' });
    }

    opts.series.forEach(function (s) {
      var pts = [];
      s.values.forEach(function (v, i) { if (v != null) pts.push([x(i), y(v), v, i]); });
      if (!pts.length) return;
      if (s.area) {
        var d0 = 'M' + pts[0][0] + ',' + y(0) + pts.map(function (p) { return ' L' + p[0] + ',' + p[1]; }).join('') + ' L' + pts[pts.length - 1][0] + ',' + y(0) + 'Z';
        svgEl('path', { d: d0, style: 'fill:' + s.color, opacity: 0.1 }, svg);
      }
      svgEl('path', {
        d: pts.map(function (p, i) { return (i ? 'L' : 'M') + p[0] + ',' + p[1]; }).join(' '),
        fill: 'none', style: 'stroke:' + s.color, 'stroke-width': 2, 'stroke-linejoin': 'round', 'stroke-linecap': 'round'
      }, svg);
      if (s.endLabel) {
        var last = pts[pts.length - 1];
        svgEl('circle', { cx: last[0], cy: last[1], r: 4.5, style: 'fill:' + s.color + ';stroke:var(--surface)', 'stroke-width': 2 }, svg);
        text(svg, last[0] + 8, last[1] - 8, fmt(last[2]), { class: 'lbl-strong' });
      }
    });

    // hover: crosshair + tooltip
    var tip = tooltip(container);
    var cross = svgEl('line', { y1: T, y2: H - B, style: 'stroke:var(--axis)', 'stroke-width': 1, visibility: 'hidden' }, svg);
    var dots = opts.series.map(function (s) {
      return svgEl('circle', { r: 4.5, style: 'fill:' + s.color + ';stroke:var(--surface)', 'stroke-width': 2, visibility: 'hidden' }, svg);
    });
    var hit = svgEl('rect', { x: L - 10, y: 0, width: W - L - R + 20, height: H, fill: 'transparent' }, svg);
    function move(ev) {
      var p = toView(svg, ev, W);
      var i = Math.max(0, Math.min(n - 1, Math.round((p.x - L) / ((W - L - R) / Math.max(1, n - 1)))));
      cross.setAttribute('x1', x(i)); cross.setAttribute('x2', x(i)); cross.setAttribute('visibility', 'visible');
      var rows = [];
      opts.series.forEach(function (s, k) {
        var v = s.values[i];
        if (v == null) { dots[k].setAttribute('visibility', 'hidden'); return; }
        dots[k].setAttribute('cx', x(i)); dots[k].setAttribute('cy', y(v)); dots[k].setAttribute('visibility', 'visible');
        rows.push({ name: s.name, value: fmt(v), color: s.color });
      });
      if (opts.extraRows) rows = rows.concat(opts.extraRows(i));
      tip.show(opts.titleOf ? opts.titleOf(i) : labels[i], rows, p.px, p.py);
    }
    function leave() { cross.setAttribute('visibility', 'hidden'); dots.forEach(function (d) { d.setAttribute('visibility', 'hidden'); }); tip.hide(); }
    hit.addEventListener('pointermove', move);
    hit.addEventListener('pointerdown', move);
    hit.addEventListener('pointerleave', leave);
    legend(opts.legendEl, opts.series.map(function (s) { return { name: s.name, color: s.color, line: true }; }));
  }

  // ---------- stacked columns ----------
  function stacked(container, opts) {
    container.textContent = '';
    var W = 640, H = 270, L = 44, R = 12, T = 22, B = 30, GAP = 2;
    var labels = opts.labels, n = labels.length, keys = opts.keys;
    var totals = opts.data.map(function (d) { return keys.reduce(function (s, k) { return s + (d[k] || 0); }, 0); });
    var yMax = niceMax(Math.max.apply(null, totals.concat([1])) * 1.1);
    var band = (W - L - R) / n, bw = Math.min(24, band * 0.55);
    var y = function (v) { return T + (H - T - B) * (1 - v / yMax); };
    var svg = svgEl('svg', { viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.aria || 'Stacked column chart' }, container);
    ticks(yMax, 4).forEach(function (t) {
      svgEl('line', { x1: L, x2: W - R, y1: y(t), y2: y(t), style: 'stroke:var(--grid)', 'stroke-width': 1 }, svg);
      text(svg, L - 8, y(t) + 4, fmt(t), { 'text-anchor': 'end' });
    });
    var tip = tooltip(container);
    opts.data.forEach(function (d, i) {
      var cx = L + band * i + band / 2, x0 = cx - bw / 2, acc = 0;
      var present = keys.filter(function (k) { return d[k] > 0; });
      present.forEach(function (k, j) {
        var v = d[k], yTop = y(acc + v), yBot = y(acc);
        var h = Math.max(0, yBot - yTop - (j > 0 ? GAP : 0));
        var yb = j > 0 ? yBot - GAP : yBot;
        var isTop = j === present.length - 1;
        var r = Math.min(4, h, bw / 2);
        var path = isTop
          ? 'M' + x0 + ',' + yb + ' V' + (yb - h + r) + ' Q' + x0 + ',' + (yb - h) + ' ' + (x0 + r) + ',' + (yb - h) +
            ' H' + (x0 + bw - r) + ' Q' + (x0 + bw) + ',' + (yb - h) + ' ' + (x0 + bw) + ',' + (yb - h + r) + ' V' + yb + 'Z'
          : 'M' + x0 + ',' + yb + ' V' + (yb - h) + ' H' + (x0 + bw) + ' V' + yb + 'Z';
        svgEl('path', { d: path, style: 'fill:' + opts.colors[k] }, svg);
        acc += v;
      });
      if (totals[i] > 0) text(svg, cx, y(totals[i]) - 6, fmt(totals[i]), { 'text-anchor': 'middle', class: 'lbl-strong' });
      text(svg, cx, H - 8, labels[i], { 'text-anchor': 'middle' });
      var hit = svgEl('rect', { x: L + band * i, y: T, width: band, height: H - T - B, fill: 'transparent' }, svg);
      var show = function (ev) {
        var p = toView(svg, ev, W);
        var rows = keys.filter(function (k) { return d[k] > 0; }).reverse().map(function (k) { return { name: opts.names[k], value: fmt(d[k]), color: opts.colors[k] }; });
        rows.push({ name: 'Total', value: fmt(totals[i]) });
        tip.show(opts.titleOf ? opts.titleOf(i) : labels[i], rows, p.px, p.py);
      };
      hit.addEventListener('pointermove', show);
      hit.addEventListener('pointerdown', show);
      hit.addEventListener('pointerleave', tip.hide);
    });
    legend(opts.legendEl, keys.map(function (k) { return { name: opts.names[k], color: opts.colors[k] }; }));
  }

  // ---------- horizontal bars (HTML, single series, direct-labelled) ----------
  function hbars(container, rows, opts) {
    opts = opts || {};
    container.textContent = '';
    var max = Math.max.apply(null, rows.map(function (r) { return r.value; }).concat([1]));
    var total = rows.reduce(function (s, r) { return s + r.value; }, 0) || 1;
    var wrap = document.createElement('div');
    wrap.style.display = 'grid';
    wrap.style.gridTemplateColumns = 'minmax(90px, 34%) 1fr auto';
    wrap.style.gap = '10px 12px';
    wrap.style.alignItems = 'center';
    wrap.style.fontSize = '14px';
    rows.forEach(function (r) {
      var lab = document.createElement('span'); lab.textContent = r.label; lab.style.color = 'var(--ink-2)';
      var track = document.createElement('span'); track.style.display = 'block'; track.style.height = '14px';
      var bar = document.createElement('span');
      bar.style.display = 'block'; bar.style.height = '100%'; bar.style.borderRadius = '0 4px 4px 0';
      bar.style.width = Math.max(1, r.value / max * 100) + '%';
      bar.style.background = r.muted ? 'var(--axis)' : 'var(--s1)';
      bar.title = r.label + ': ' + fmt(r.value) + ' (' + Math.round(r.value / total * 100) + '%)';
      track.appendChild(bar);
      var val = document.createElement('span');
      val.textContent = fmt(r.value) + '  ·  ' + Math.round(r.value / total * 100) + '%';
      val.style.fontVariantNumeric = 'tabular-nums'; val.style.fontWeight = '700'; val.style.whiteSpace = 'pre';
      wrap.appendChild(lab); wrap.appendChild(track); wrap.appendChild(val);
    });
    container.appendChild(wrap);
  }

  return { line: line, stacked: stacked, hbars: hbars };
})();
