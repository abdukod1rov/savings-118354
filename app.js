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
    // Rejects things like 2026-02-31.
    if (chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== d) return NaN;
    return t;
  }

  function fmtDate(t) {
    var d = new Date(t);
    return d.getUTCDate() + " " + MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }

  function fmtMonthYear(t) {
    var d = new Date(t);
    return MONTHS[d.getUTCMonth()] + " " + d.getUTCFullYear();
  }

  /* 124500000 -> "124 500 000" (thin spaces, not locale-dependent) */
  function groups(n) {
    var s = String(Math.round(Math.abs(n)));
    var out = "";
    while (s.length > 3) {
      out = " " + s.slice(-3) + out;
      s = s.slice(0, -3);
    }
    return (n < 0 ? "-" : "") + s + out;
  }

  var CUR = "so'm";

  function full(n) { return groups(n) + " " + CUR; }

  /* 124500000 -> "124.5 mln" ; 1250000000 -> "1.25 mlrd" */
  function compact(n) {
    var a = Math.abs(n), sign = n < 0 ? "-" : "";
    if (a >= 1e9) return sign + trim(a / 1e9, 2) + " mlrd";
    if (a >= 1e6) return sign + trim(a / 1e6, 1) + " mln";
    if (a >= 1e3) return sign + groups(a);
    return sign + String(Math.round(a));
  }

  function trim(x, dp) {
    var s = x.toFixed(dp);
    return s.replace(/\.?0+$/, "");
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

    // Chronological. Stable for same-day entries (keeps the file's order).
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

  // Average per month over the whole tracked span (first entry -> today).
  var spanMs     = Math.max(now, lastT) - firstT;
  var spanMonths = Math.max(spanMs / AVG_MONTH, 0.5);
  var avgMonth   = saved / spanMonths;

  // Current pace: what actually went in over the last 90 days.
  var WINDOW_DAYS = 90;
  var since = now - WINDOW_DAYS * DAY;
  var recentAdded = 0;
  points.forEach(function (p) {
    if (p.t >= since && p.added > 0) recentAdded += p.added;
  });
  var paceMonth = recentAdded / (WINDOW_DAYS / 30.436875);

  // Projection basis: real recent pace if there is one, otherwise the average.
  var basis = paceMonth > 0 ? paceMonth : avgMonth;
  var basisLabel = paceMonth > 0 ? "at current pace" : "at average pace";

  function etaFor(target) {
    if (saved >= target) return { done: true };
    if (!(basis > 0)) return { unknown: true };
    var months = (target - saved) / basis;
    if (months > 600) return { unknown: true };          // > 50 years: meaningless
    return { months: months, t: now + months * AVG_MONTH };
  }

  var etaGoal = etaFor(GOAL);

  /* ------------------------------------------------------------ sidebar/hero */

  set("sSaved",    compact(saved));
  set("sLeft",     compact(remaining));
  set("sGoal",     compact(GOAL));
  set("sPct",      fmtPct(progress));
  set("sPrice",    PRICE > 0 ? compact(PRICE) : "—");
  set("sGapPrice", PRICE > 0 ? compact(gapPrice) : "—");
  set("lastDate",  fmtDate(lastT));

  set("ringPct", Math.round(progress) + "%");
  var CIRC = 2 * Math.PI * 52;
  var ringFill = $("ringFill");
  var ringShown = Math.min(progress, 100) / 100;

  set("hSaved",     compact(saved));
  set("hSavedFull", full(saved));
  set("hLeft",      compact(remaining));
  set("hLeftFull",  remaining > 0 ? full(remaining) + " to go" : "goal reached");

  // The bar's full width is the goal.
  set("barGoalLabel", compact(GOAL));
  var goalFillPct = Math.min(progress, 100);

  var bar = $("bar");
  bar.setAttribute("aria-valuenow", goalFillPct.toFixed(1));
  bar.setAttribute("aria-valuetext", compact(saved) + " of " + compact(GOAL) +
                                     " goal — " + fmtPct(progress));

  set("histHint", points.length + (points.length === 1 ? " entry" : " entries") +
                  " · newest first");

  /* ---------------------------------------------------------- history table */

  (function table() {
    var body = $("histBody");
    var rows = points.slice().reverse();
    var frag = document.createDocumentFragment();

    rows.forEach(function (p) {
      var tr = document.createElement("tr");

      var td1 = document.createElement("td");
      td1.textContent = fmtDate(p.t);
      tr.appendChild(td1);

      var td2 = document.createElement("td");
      td2.className = "num add";
      if (p.isReset) {
        td2.textContent = (p.added >= 0 ? "+" : "") + compact(p.added);
        td2.style.color = "var(--price)";
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
      if (p.isReset) {
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

  function drawChart() {
    var w = Math.max(host.clientWidth || 640, 260);
    var h = Math.round(Math.min(Math.max(w * 0.42, 230), 340));

    var padL = w < 420 ? 44 : 62;
    var padR = w < 420 ? 12 : 54;      // room for the goal-line label
    var padT = 16;
    var padB = 30;

    var innerW = Math.max(w - padL - padR, 40);
    var innerH = Math.max(h - padT - padB, 40);

    // ---- scales
    var xMin = firstT;
    var xMax = Math.max(lastT, now);

    // Extend the axis toward the projected goal date — but never so far that
    // the actual history gets squashed into a corner. The projection may run
    // off the right edge (it is clipped); the date itself is on the card.
    var proj = null;
    if (!etaGoal.done && !etaGoal.unknown && etaGoal.months <= 36) {
      proj = etaGoal.t;
      var allowance = Math.max((xMax - xMin) * 0.6, 50 * DAY);
      xMax = Math.min(proj, xMax + allowance);
    }
    if (xMax - xMin < 20 * DAY) xMax = xMin + 20 * DAY;   // single/short history

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
                    " in " + fmtMonthYear(lastT) + ", against a " + compact(GOAL) + " goal."
    });

    // Gradient for the area fill.
    var defs = svgEl("defs", {});
    var grad = svgEl("linearGradient", { id: "cGrad", x1: "0", y1: "0", x2: "0", y2: "1" });
    grad.appendChild(svgEl("stop", { offset: "0",
      "stop-color": "var(--accent)", "stop-opacity": ".28" }));
    grad.appendChild(svgEl("stop", { offset: "1",
      "stop-color": "var(--accent)", "stop-opacity": "0" }));
    defs.appendChild(grad);

    // Keeps the projection ray inside the plot area when it runs off the edge.
    var clip = svgEl("clipPath", { id: "cClip" });
    clip.appendChild(svgEl("rect", {
      x: padL, y: padT - 4, width: innerW, height: innerH + 4
    }));
    defs.appendChild(clip);
    svg.appendChild(defs);

    // ---- y gridlines + labels
    for (var v = 0; v <= yMax + 1; v += step) {
      var y = Y(v);
      svg.appendChild(svgEl("line", {
        class: "c-grid", x1: padL, y1: y, x2: padL + innerW, y2: y
      }));
      var lbl = svgEl("text", {
        class: "c-axis-text", x: padL - 8, y: y + 4, "text-anchor": "end"
      });
      lbl.textContent = v === 0 ? "0" : compact(v);
      svg.appendChild(lbl);
    }

    // ---- x ticks: first of each month, thinned to fit
    var ticks = [];
    var cur = new Date(xMin);
    cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth(), 1));
    while (cur.getTime() <= xMax) {
      var tt = cur.getTime();
      if (tt >= xMin) ticks.push(tt);
      cur = new Date(Date.UTC(cur.getUTCFullYear(), cur.getUTCMonth() + 1, 1));
    }
    var maxTicks = Math.max(2, Math.floor(innerW / (w < 420 ? 58 : 74)));
    var every = Math.ceil(ticks.length / maxTicks);
    ticks.forEach(function (tt, i) {
      if (i % every !== 0) return;
      var tx = X(tt);
      var t1 = svgEl("text", {
        class: "c-axis-text", x: tx, y: padT + innerH + 19, "text-anchor": "middle"
      });
      var d = new Date(tt);
      t1.textContent = MONTHS[d.getUTCMonth()] +
        (d.getUTCMonth() === 0 || i === 0 ? " " + String(d.getUTCFullYear()).slice(2) : "");
      svg.appendChild(t1);
    });

    // ---- goal line
    var gy = Y(GOAL);
    svg.appendChild(svgEl("line", {
      class: "c-goal", x1: padL, y1: gy, x2: padL + innerW, y2: gy
    }));
    if (padR > 20) {
      var gl = svgEl("text", {
        class: "c-goal-text", x: padL + innerW + 6, y: gy + 4
      });
      gl.textContent = compact(GOAL);
      svg.appendChild(gl);
    }

    // ---- real price line, only when it is actually on the scale
    if (PRICE > 0 && PRICE <= yMax) {
      var py = Y(PRICE);
      svg.appendChild(svgEl("line", {
        class: "c-price", x1: padL, y1: py, x2: padL + innerW, y2: py
      }));
      if (padR > 20) {
        var pl = svgEl("text", {
          class: "c-price-text", x: padL + innerW + 6, y: py + 4
        });
        pl.textContent = compact(PRICE);
        svg.appendChild(pl);
      }
    }

    // ---- balance path (step-less polyline through the entries)
    var d = "", i2;
    for (i2 = 0; i2 < points.length; i2++) {
      d += (i2 ? " L" : "M") + X(points[i2].t).toFixed(2) + " " + Y(points[i2].balance).toFixed(2);
    }
    // Carry the last balance forward to today so the line does not stop short.
    var carried = false;
    if (now > lastT + DAY) {
      d += " L" + X(now).toFixed(2) + " " + Y(saved).toFixed(2);
      carried = true;
    }

    if (points.length > 1 || carried) {
      var areaD = d + " L" + X(carried ? now : lastT).toFixed(2) + " " + Y(0).toFixed(2) +
                  " L" + X(firstT).toFixed(2) + " " + Y(0).toFixed(2) + " Z";
      svg.appendChild(svgEl("path", { class: "c-area", d: areaD }));
      svg.appendChild(svgEl("path", { class: "c-line", d: d }));
    }

    // ---- projection to the goal (clipped; may leave the right edge)
    if (proj) {
      var g = svgEl("g", { "clip-path": "url(#cClip)" });
      g.appendChild(svgEl("path", {
        class: "c-proj",
        d: "M" + X(carried ? now : lastT).toFixed(2) + " " + Y(saved).toFixed(2) +
           " L" + X(proj).toFixed(2) + " " + Y(GOAL).toFixed(2)
      }));
      svg.appendChild(g);

      // Only mark the landing point when it actually sits on the axis.
      if (proj <= xMax) {
        var pdot = svgEl("circle", {
          class: "c-dot", cx: X(proj).toFixed(2), cy: Y(GOAL).toFixed(2), r: 3.5,
          "stroke-dasharray": "2 2"
        });
        var pt = svgEl("title", {});
        pt.textContent = "Projected: goal reached around " + fmtMonthYear(proj) +
                         " " + basisLabel;
        pdot.appendChild(pt);
        svg.appendChild(pdot);
      }
    }

    // ---- dots, with native tooltips (works on hover and on long-press)
    points.forEach(function (p) {
      var cx = X(p.t), cy = Y(p.balance);
      var dot = svgEl("circle", { class: "c-dot", cx: cx.toFixed(2), cy: cy.toFixed(2),
                                  r: points.length > 24 ? 2.5 : 4 });
      var ti = svgEl("title", {});
      ti.textContent = fmtDate(p.t) + " — " + full(p.balance) +
                       (p.isReset ? " (balance set)"
                                  : " (+" + compact(p.added) + ")") +
                       (p.note ? " · " + p.note : "");
      dot.appendChild(ti);
      svg.appendChild(dot);

      // Bigger invisible target so the tooltip is reachable on a phone.
      var hit = svgEl("circle", { class: "c-hit", cx: cx.toFixed(2), cy: cy.toFixed(2), r: 14 });
      hit.appendChild(ti.cloneNode(true));
      svg.appendChild(hit);
    });

    host.innerHTML = "";
    host.appendChild(svg);

    var hint = points.length > 1
      ? "Dashed line is the " + compact(GOAL) + " goal"
      : "Add more entries to see the curve";
    if (proj) hint += " · faint line projects toward " + fmtMonthYear(proj);
    set("chartHint", hint);
  }

  drawChart();

  // Redraw on resize / orientation change, debounced.
  var rt;
  function onResize() {
    clearTimeout(rt);
    rt = setTimeout(drawChart, 120);
  }
  window.addEventListener("resize", onResize);
  window.addEventListener("orientationchange", onResize);

  /* ------------------------------------------------------- animate on load */

  function fillBars() {
    ringFill.style.strokeDashoffset = String(CIRC * (1 - ringShown));
    $("barFill").style.width = goalFillPct + "%";
  }

  // Two frames so the starting values are committed and the CSS transition
  // actually runs. requestAnimationFrame is paused in a background tab, so a
  // timer backs it up — the bars must never be left sitting at zero.
  requestAnimationFrame(function () { requestAnimationFrame(fillBars); });
  setTimeout(fillBars, 250);

  /* -------------------------------------------------------- theme switcher */

  (function theme() {
    var order = ["auto", "light", "dark"];
    var icons = { auto: "◐", light: "☀", dark: "☽" };
    var names = { auto: "Auto theme", light: "Light", dark: "Dark" };
    var KEY = "houseSavings.theme";

    var mode = "auto";
    try {
      var stored = localStorage.getItem(KEY);
      if (order.indexOf(stored) !== -1) mode = stored;
    } catch (e) { /* private mode, blocked storage — stay on auto */ }

    function apply() {
      document.documentElement.setAttribute("data-theme", mode);
      set("themeIcon", icons[mode]);
      set("themeLabel", names[mode]);
    }

    $("themeBtn").addEventListener("click", function () {
      mode = order[(order.indexOf(mode) + 1) % order.length];
      try { localStorage.setItem(KEY, mode); } catch (e) { /* ignore */ }
      apply();
    });

    // The chart's strokes are all CSS variables, so switching the theme
    // repaints it without a redraw.
    apply();
  })();

})();
