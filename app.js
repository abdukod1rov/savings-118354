/* ===========================================================================
   House savings tracker
   Everything on the page is derived from window.SAVINGS in data.js.
   No dependencies, no build step. Works from file:// and from GitHub Pages.
   =========================================================================== */
(function () {
  "use strict";

  /* ---------------------------------------------------------------- helpers */

  var MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  var DAY = 86400000;
  var AVG_MONTH = 30.436875 * DAY;      // mean Gregorian month

  var REDUCE = window.matchMedia &&
               window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  function $(id) { return document.getElementById(id); }

  function fail(msg) {
    var box = $("dataError");
    box.innerHTML = msg;
    box.hidden = false;
  }

  /* Parse "YYYY-MM-DD" as UTC so the displayed day never shifts by timezone. */
  function parseDate(s) {
    if (typeof s !== "string") return NaN;
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s.trim());
    if (!m) return NaN;
    var y = +m[1], mo = +m[2], d = +m[3];
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return NaN;
    var t = Date.UTC(y, mo - 1, d);
    var chk = new Date(t);
    if (chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return NaN;
    return t;
  }

  function fmtDate(t) {
    var d = new Date(t);
    return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] +
           " " + d.getUTCFullYear();
  }

  function fmtMonthYear(t) {
    var d = new Date(t);
    return MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }

  /* 124500000 -> "124 500 000" (narrow no-break spaces, locale-independent) */
  function groups(n) {
    var s = String(Math.round(Math.abs(n)));
    var out = "";
    while (s.length > 3) {
      out = " " + s.slice(-3) + out;
      s = s.slice(0, -3);
    }
    return (n < 0 ? "-" : "") + s + out;
  }

  var CUR = "so’m";                 // curly apostrophe

  function full(n) { return groups(n) + " " + CUR; }

  /* 124500000 -> "124.5 mln" ; 1250000000 -> "1.25 mlrd" */
  function compact(n) {
    var a = Math.abs(n), sign = n < 0 ? "-" : "";
    if (a >= 1e9) return sign + trim(a / 1e9, 2) + " mlrd";
    if (a >= 1e6) return sign + trim(a / 1e6, 1) + " mln";
    if (a >= 1e3) return sign + groups(a);
    return sign + String(Math.round(a));
  }

  function trim(x, dp) {
    return x.toFixed(dp).replace(/\.?0+$/, "");
  }

  /* Same split as compact(), but with the unit separated so the hero can set
     it smaller than the numeral. Numbers only — nothing user-authored. */
  function compactParts(n) {
    var a = Math.abs(n), sign = n < 0 ? "-" : "";
    if (a >= 1e9) return { num: sign + trim(a / 1e9, 2), unit: "mlrd" };
    if (a >= 1e6) return { num: sign + trim(a / 1e6, 1), unit: "mln" };
    if (a >= 1e3) return { num: sign + groups(a), unit: "" };
    return { num: sign + String(Math.round(a)), unit: "" };
  }

  function compactHTML(n) {
    var p = compactParts(n);
    return p.unit ? p.num + '<span class="unit">' + p.unit + "</span>" : p.num;
  }

  function pct(part, whole) { return whole > 0 ? (part / whole) * 100 : 0; }

  function fmtPct(p) {
    return (p >= 99.95 ? p.toFixed(0) : p >= 10 ? p.toFixed(1) : p.toFixed(2)) + "%";
  }

  function set(id, text) {
    var el = $(id);
    if (el) el.textContent = text;
  }

  function svgEl(name, attrs) {
    var e = document.createElementNS("http://www.w3.org/2000/svg", name);
    for (var k in attrs) {
      if (Object.prototype.hasOwnProperty.call(attrs, k)) e.setAttribute(k, attrs[k]);
    }
    return e;
  }

  /* Counts a figure up on load. The final value is written first, so if the
     frame callback never runs (background tab) the number is still correct. */
  function countUp(id, to, format, asHTML) {
    var el = $(id);
    if (!el) return;

    function write(s) {
      if (asHTML) el.innerHTML = s; else el.textContent = s;
    }

    write(format(to));
    if (REDUCE || !isFinite(to) || to <= 0) return;

    var started = null;
    function frame(ts) {
      if (started === null) started = ts;
      var p = Math.min((ts - started) / 900, 1);
      var eased = 1 - Math.pow(1 - p, 4);
      write(format(to * eased));
      if (p < 1) requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  /* ------------------------------------------------------------------- data */

  var raw = window.SAVINGS;

  if (!raw || typeof raw !== "object") {
    fail("Could not read <code>data.js</code>. Make sure the file sits next to " +
         "<code>index.html</code> and still starts with <code>window.SAVINGS = {</code>.");
    return;
  }

  if (typeof raw.currency === "string" && raw.currency.trim()) CUR = raw.currency.trim();

  var GOAL  = Number(raw.goal) > 0 ? Number(raw.goal) : 400000000;
  var PRICE = Number(raw.housePrice) > 0 ? Number(raw.housePrice) : 0;

  var problems = [];
  var points = [];   // { t, added, balance, note, isReset }

  (function build() {
    var list = Array.isArray(raw.entries) ? raw.entries : [];
    var clean = [];

    list.forEach(function (e, i) {
      if (!e || typeof e !== "object") {
        problems.push("Entry " + (i + 1) + " is not an object.");
        return;
      }
      var t = parseDate(e.date);
      if (isNaN(t)) {
        problems.push("Entry " + (i + 1) + ' has a bad date (expected "YYYY-MM-DD", got ' +
                      JSON.stringify(e.date) + ").");
        return;
      }
      var hasBal = e.balance !== undefined && e.balance !== null && e.balance !== "";
      var v = Number(hasBal ? e.balance : e.amount);
      if (!isFinite(v)) {
        problems.push("Entry " + (i + 1) + " (" + e.date + ") has no usable " +
                      "<code>amount</code> or <code>balance</code>.");
        return;
      }
      clean.push({ t: t, v: v, isReset: hasBal, note: e.note ? String(e.note) : "" });
    });

    clean.sort(function (a, b) { return a.t - b.t; });

    var running = 0;
    clean.forEach(function (c) {
      var added;
      if (c.isReset) {
        added = c.v - running;
        running = c.v;
      } else {
        added = c.v;
        running += c.v;
      }
      points.push({ t: c.t, added: added, balance: running,
                    note: c.note, isReset: c.isReset });
    });
  })();

  if (problems.length) {
    fail("<strong>Problem in data.js</strong><br>" + problems.join("<br>"));
  }

  if (!points.length) {
    fail("<strong>No usable entries in data.js.</strong> Add at least one, e.g. " +
         '<code>{ date: "2026-11-01", amount: 10_000_000 }</code>.');
    return;
  }

  var saved     = points[points.length - 1].balance;
  var lastT     = points[points.length - 1].t;
  var firstT    = points[0].t;
  var remaining = Math.max(0, GOAL - saved);
  var gapPrice  = PRICE > 0 ? Math.max(0, PRICE - saved) : 0;
  var progress  = pct(saved, GOAL);
  var now       = Date.now();

  /* --------------------------------------------------------- derived figures */

  // Only money added SINCE tracking began counts toward the rate of saving.
  // The first entry is an opening balance — savings from before this page
  // existed — and counting it would pass off years of saving as one month's.
  var addedSince = Math.max(saved - points[0].balance, 0);

  var spanMs     = Math.max(now, lastT) - firstT;
  var spanMonths = Math.max(spanMs / AVG_MONTH, 0.5);
  var avgMonth   = addedSince / spanMonths;

  // Current pace: real deposits over the last 90 days. The opening balance is
  // not one, and nor is a `balance` entry — that is a correction, not money in.
  var WINDOW_DAYS = 90;
  var since = now - WINDOW_DAYS * DAY;
  var recentAdded = 0;
  points.forEach(function (p, i) {
    if (i === 0 || p.isReset) return;
    if (p.t >= since && p.added > 0) recentAdded += p.added;
  });
  var paceMonth = recentAdded / (WINDOW_DAYS / 30.436875);

  var basis = paceMonth > 0 ? paceMonth : avgMonth;
  var basisLabel = paceMonth > 0 ? "at current pace" : "at average pace";

  function etaFor(target) {
    if (saved >= target) return { done: true };
    if (!(basis > 0)) return { unknown: true };
    var months = (target - saved) / basis;
    if (months > 600) return { unknown: true };
    return { months: months, t: now + months * AVG_MONTH };
  }

  var etaGoal = etaFor(GOAL);

  /* --------------------------------------------------------------- rail/hero */

  set("sSaved",    compact(saved));
  set("sLeft",     compact(remaining));
  set("sGoal",     compact(GOAL));
  set("sPct",      fmtPct(progress));
  set("sPrice",    PRICE > 0 ? compact(PRICE) : "—");
  set("sGapPrice", PRICE > 0 ? compact(gapPrice) : "—");
  set("lastDate",  fmtDate(lastT));

  countUp("ringPct", progress, function (v) { return Math.round(v) + "%"; });
  countUp("hSaved",  saved,     compactHTML, true);
  countUp("hLeft",   remaining, compactHTML, true);

  set("hSavedFull", full(saved));
  set("hLeftFull",  remaining > 0 ? full(remaining) + " to go" : "goal reached");

  set("trackPct",      fmtPct(progress) + " of goal");
  set("barGoalLabel",  compact(GOAL));

  var goalFillPct = Math.min(progress, 100);

  var bar = $("bar");
  bar.setAttribute("aria-valuenow", goalFillPct.toFixed(1));
  bar.setAttribute("aria-valuetext", compact(saved) + " of " + compact(GOAL) +
                                     " goal — " + fmtPct(progress));

  set("histHint", points.length + (points.length === 1 ? " entry" : " entries") +
                  " · newest first");

  var CIRC = 2 * Math.PI * 68;
  var ringShown = Math.min(progress, 100) / 100;

  function settle() {
    $("ringFill").style.strokeDashoffset = String(CIRC * (1 - ringShown));
    // Slide the full-width fill into place — transform only, no layout per frame.
    $("barFill").style.transform = "translateX(" + (goalFillPct - 100) + "%)";
  }

  // Two frames so the starting values are committed and the transition runs;
  // a timer backs it up, since frame callbacks pause in a background tab.
  requestAnimationFrame(function () { requestAnimationFrame(settle); });
  setTimeout(settle, 260);

  /* ---------------------------------------------------------- history table */

  (function table() {
    var body = $("histBody");
    var rows = points.slice().reverse();
    var frag = document.createDocumentFragment();

    // A `balance` first entry is an opening balance, not a correction:
    // nothing was "added" that day, it is just where the tracking starts.
    var opening = points[0];

    rows.forEach(function (p) {
      var isOpening = (p === opening && p.isReset);
      var tr = document.createElement("tr");

      var td1 = document.createElement("td");
      td1.textContent = fmtDate(p.t);
      tr.appendChild(td1);

      var td2 = document.createElement("td");
      td2.className = "num add";
      if (isOpening) {
        td2.textContent = "—";
        td2.style.color = "var(--ink-3)";
      } else if (p.isReset) {
        td2.textContent = (p.added >= 0 ? "+" : "") + compact(p.added);
        td2.style.color = "var(--ink-2)";
      } else {
        td2.textContent = "+" + compact(p.added);
      }
      tr.appendChild(td2);

      var td3 = document.createElement("td");
      td3.className = "num bal";
      td3.textContent = compact(p.balance);
      td3.title = full(p.balance);
      tr.appendChild(td3);

      var td4 = document.createElement("td");
      td4.className = "num";
      td4.textContent = fmtPct(pct(p.balance, GOAL));
      tr.appendChild(td4);

      var td5 = document.createElement("td");
      td5.className = "note";
      if (p.isReset && !isOpening) {
        var tag = document.createElement("span");
        tag.className = "tag";
        tag.textContent = "balance set";
        td5.appendChild(tag);
      }
      td5.appendChild(document.createTextNode(p.note));
      tr.appendChild(td5);

      frag.appendChild(tr);
    });

    body.appendChild(frag);
  })();

  /* ------------------------------------------------------------------ chart */

  var host = $("chartHost");

  function niceStep(range) {
    var target = range / 5;
    var pow = Math.pow(10, Math.floor(Math.log(target) / Math.LN10));
    var candidates = [1, 2, 2.5, 5, 10].map(function (c) { return c * pow; });
    for (var i = 0; i < candidates.length; i++) {
      if (candidates[i] >= target) return candidates[i];
    }
    return candidates[candidates.length - 1];
  }

  /* Monotone cubic (Fritsch–Carlson). A plain smooth spline would overshoot
     between entries and draw a balance dipping below one you actually had. */
  function smoothPath(pts) {
    var n = pts.length;
    if (n < 2) return "";
    if (n === 2) {
      return "M" + pts[0].x + " " + pts[0].y + " L" + pts[1].x + " " + pts[1].y;
    }

    var i, d = [], m = [];
    for (i = 0; i < n - 1; i++) {
      var dx = pts[i + 1].x - pts[i].x;
      d.push(dx === 0 ? 0 : (pts[i + 1].y - pts[i].y) / dx);
    }
    m.push(d[0]);
    for (i = 1; i < n - 1; i++) {
      m.push(d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2);
    }
    m.push(d[n - 2]);

    for (i = 0; i < n - 1; i++) {
      if (d[i] === 0) { m[i] = 0; m[i + 1] = 0; continue; }
      var a = m[i] / d[i], b = m[i + 1] / d[i];
      var s = a * a + b * b;
      if (s > 9) {
        var tau = 3 / Math.sqrt(s);
        m[i] = tau * a * d[i];
        m[i + 1] = tau * b * d[i];
      }
    }

    var out = "M" + pts[0].x.toFixed(2) + " " + pts[0].y.toFixed(2);
    for (i = 0; i < n - 1; i++) {
      var h = (pts[i + 1].x - pts[i].x) / 3;
      out += " C" + (pts[i].x + h).toFixed(2) + " " + (pts[i].y + m[i] * h).toFixed(2) +
             " " + (pts[i + 1].x - h).toFixed(2) + " " + (pts[i + 1].y - m[i + 1] * h).toFixed(2) +
             " " + pts[i + 1].x.toFixed(2) + " " + pts[i + 1].y.toFixed(2);
    }
    return out;
  }

  function drawChart() {
    var w = Math.max(host.clientWidth || 640, 260);
    var narrow = w < 460;
    var h = Math.round(Math.min(Math.max(w * 0.4, 230), 330));

    var padL = narrow ? 42 : 56;
    var padR = narrow ? 10 : 52;
    var padT = 14;
    var padB = 32;

    var innerW = Math.max(w - padL - padR, 40);
    var innerH = Math.max(h - padT - padB, 40);

    var xMin = firstT;
    var xMax = Math.max(lastT, now);

    // Extend toward the projected goal date, but never so far that the real
    // history is squashed into a corner. The ray is clipped at the edge.
    var proj = null;
    if (!etaGoal.done && !etaGoal.unknown && etaGoal.months <= 36) {
      proj = etaGoal.t;
      var allowance = Math.max((xMax - xMin) * 0.6, 50 * DAY);
      xMax = Math.min(proj, xMax + allowance);
    }
    if (xMax - xMin < 20 * DAY) xMax = xMin + 20 * DAY;

    var yMaxRaw = Math.max(GOAL, saved) * 1.08;
    var step = niceStep(yMaxRaw);
    var yMax = Math.ceil(yMaxRaw / step) * step;

    function X(t) { return padL + ((t - xMin) / (xMax - xMin)) * innerW; }
    function Y(v) { return padT + innerH - (v / yMax) * innerH; }

    var svg = svgEl("svg", {
      viewBox: "0 0 " + w + " " + h,
      width: w, height: h,
      role: "img",
      "aria-label": "Balance over time, from " + compact(points[0].balance) +
                    " in " + fmtMonthYear(firstT) + " to " + compact(saved) +
                    " in " + fmtMonthYear(lastT) + ", against a " +
                    compact(GOAL) + " goal."
    });

    var defs = svgEl("defs", {});
    var grad = svgEl("linearGradient", { id: "cFill", x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(svgEl("stop", { offset: "0",
      "stop-color": "var(--accent)", "stop-opacity": ".20" }));
    grad.appendChild(svgEl("stop", { offset: "1",
      "stop-color": "var(--accent)", "stop-opacity": "0" }));
    defs.appendChild(grad);

    var clip = svgEl("clipPath", { id: "cClip" });
    clip.appendChild(svgEl("rect", {
      x: padL, y: padT - 4, width: innerW, height: innerH + 4
    }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    // ---- horizontal rules only; no vertical grid, no frame
    for (var v = 0; v <= yMax + 1; v += step) {
      var y = Y(v);
      svg.appendChild(svgEl("line", {
        class: v === 0 ? "c-base" : "c-grid",
        x1: padL, y1: y, x2: padL + innerW, y2: y
      }));
      var lbl = svgEl("text", {
        class: "c-axis", x: padL - 10, y: y + 3.5, "text-anchor": "end"
      });
      lbl.textContent = v === 0 ? "0" : compact(v);
      svg.appendChild(lbl);
    }

    // ---- month ticks, thinned to fit
    var ticks = [];
    var cur = new Date(xMin);
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1));
    while (cur.getTime() <= xMax) {
      var tt = cur.getTime();
      if (tt >= xMin) ticks.push(tt);
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
    var maxTicks = Math.max(2, Math.floor(innerW / (narrow ? 56 : 76)));
    var every = Math.ceil(ticks.length / maxTicks);
    ticks.forEach(function (tt, i) {
      if (i % every !== 0) return;
      var t1 = svgEl("text", {
        class: "c-axis", x: X(tt), y: padT + innerH + 20, "text-anchor": "middle"
      });
      var dd = new Date(tt);
      t1.textContent = MONTHS[dd.getUTCMonth()] +
        (dd.getUTCMonth() === 0 || i === 0 ? " " + String(dd.getUTCFullYear()).slice(2) : "");
      svg.appendChild(t1);
    });

    // ---- goal line
    var gy = Y(GOAL);
    svg.appendChild(svgEl("line", {
      class: "c-goal", x1: padL, y1: gy, x2: padL + innerW, y2: gy
    }));
    if (!narrow) {
      var gl = svgEl("text", { class: "c-goal-text", x: padL + innerW + 9, y: gy + 3.5 });
      gl.textContent = compact(GOAL);
      svg.appendChild(gl);
    }

    // ---- the real house price, drawn only when it falls on the scale
    if (PRICE > 0 && PRICE <= yMax) {
      var py = Y(PRICE);
      svg.appendChild(svgEl("line", {
        class: "c-goal", x1: padL, y1: py, x2: padL + innerW, y2: py
      }));
      if (!narrow) {
        var pl = svgEl("text", { class: "c-goal-text", x: padL + innerW + 9, y: py + 3.5 });
        pl.textContent = compact(PRICE);
        svg.appendChild(pl);
      }
    }

    // ---- balance curve
    var xy = points.map(function (p) { return { x: X(p.t), y: Y(p.balance) }; });
    // Carry the last balance forward to today so the line does not stop short.
    var carried = now > lastT + DAY;
    if (carried) xy.push({ x: X(now), y: Y(saved) });

    if (xy.length > 1) {
      var line = smoothPath(xy);
      var areaD = line + " L" + xy[xy.length - 1].x.toFixed(2) + " " + Y(0).toFixed(2) +
                  " L" + xy[0].x.toFixed(2) + " " + Y(0).toFixed(2) + " Z";
      svg.appendChild(svgEl("path", { class: "c-area", d: areaD }));
      svg.appendChild(svgEl("path", { class: "c-line", d: line }));
    }

    // ---- projection toward the goal (clipped; may leave the right edge)
    if (proj) {
      var g = svgEl("g", { "clip-path": "url(#cClip)" });
      g.appendChild(svgEl("path", {
        class: "c-proj",
        d: "M" + xy[xy.length - 1].x.toFixed(2) + " " + xy[xy.length - 1].y.toFixed(2) +
           " L" + X(proj).toFixed(2) + " " + Y(GOAL).toFixed(2)
      }));
      svg.appendChild(g);
    }

    // ---- entry dots, knocked out of the curve
    points.forEach(function (p) {
      var cx = X(p.t), cy = Y(p.balance);
      var r = points.length > 24 ? 2.6 : 3.6;

      svg.appendChild(svgEl("circle", {
        class: "c-dot-halo", cx: cx.toFixed(2), cy: cy.toFixed(2), r: r + 2.6
      }));
      svg.appendChild(svgEl("circle", {
        class: "c-dot", cx: cx.toFixed(2), cy: cy.toFixed(2), r: r
      }));

      // A larger invisible target, so the tooltip is reachable on a phone.
      var hit = svgEl("circle", { class: "c-hit", cx: cx.toFixed(2), cy: cy.toFixed(2), r: 16 });
      var ti = svgEl("title", {});
      ti.textContent = fmtDate(p.t) + " — " + full(p.balance) +
                       (p.isReset ? " (balance set)" : " (+" + compact(p.added) + ")") +
                       (p.note ? " · " + p.note : "");
      hit.appendChild(ti);
      svg.appendChild(hit);
    });

    host.replaceChildren(svg);

    var hint = points.length > 1
      ? "Dashed line is the " + compact(GOAL) + " goal"
      : "One entry so far — add a few more to see the curve";
    if (proj) hint += " · projecting " + fmtMonthYear(proj);
    set("chartHint", hint);
  }

  drawChart();

  var rt;
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(drawChart, 120);
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  /* -------------------------------------------------------- theme switcher */

  (function theme() {
    var order = ["auto", "light", "dark"];
    var names = { auto: "Auto", light: "Light", dark: "Dark" };
    var KEY = "houseSavings.theme";

    var mode = "auto";
    try {
      var stored = localStorage.getItem(KEY);
      if (order.indexOf(stored) !== -1) mode = stored;
    } catch (e) { /* private mode, blocked storage — stay on auto */ }

    var btn = $("themeBtn");

    function apply() {
      document.documentElement.setAttribute("data-theme", mode);
      set("themeLabel", names[mode]);
      btn.setAttribute("aria-label", "Theme: " + names[mode] + ". Change theme.");
    }

    btn.addEventListener("click", function () {
      mode = order[(order.indexOf(mode) + 1) % order.length];
      try { localStorage.setItem(KEY, mode); } catch (e) { /* ignore */ }
      apply();
    });

    // The chart's strokes are all CSS variables, so switching the theme
    // repaints it without a redraw.
    apply();
  })();

})();
