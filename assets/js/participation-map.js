/* Participation map: tooltips, zoom/pan, and a full-screen view.
 *
 * Progressive enhancement throughout. Without JavaScript the map still renders
 * and the <title> elements give native browser tooltips; everything below is
 * additive, and no control is drawn unless the script that powers it has run.
 */
(function () {
	"use strict";

	var MAX_ZOOM = 8;       // deepest zoom; past this the simplified coastlines show
	var STEP = 1.6;         // zoom factor per button press
	var WHEEL = 1.15;       // zoom factor per wheel notch

	function init(figure) {
		var svg = figure.querySelector(".iol-map__svg");
		if (!svg) return;

		var vb = svg.getAttribute("viewBox").split(/[\s,]+/).map(Number);
		var base = { x: vb[0], y: vb[1], w: vb[2], h: vb[3] };
		var view = { x: base.x, y: base.y, w: base.w, h: base.h };

		var markers = Array.prototype.slice.call(svg.querySelectorAll(".iol-map__marker"));
		var markerR = markers.length ? parseFloat(markers[0].getAttribute("r")) : 4.5;

		/* ---- tooltip ---------------------------------------------------- */

		var tip = document.createElement("div");
		tip.className = "iol-map__tip";
		tip.setAttribute("aria-hidden", "true");
		figure.appendChild(tip);

		var stops = [];
		Array.prototype.forEach.call(svg.querySelectorAll("[data-label]"), function (el) {
			// Drop <title>: it is there for the no-JavaScript case, and leaving it
			// would give us the OS tooltip as well, doubled and a second later.
			var title = el.querySelector("title");
			if (title) el.removeChild(title);
			stops.push(el);
		});

		/* Roving tabindex: the map is a single stop in the page's tab order --
		   56 separate stops on the front page would be a nuisance to tab past --
		   and the arrow keys then move between countries within it. */
		stops.forEach(function (el, i) {
			el.setAttribute("tabindex", i === 0 ? "0" : "-1");
			el.setAttribute("focusable", "true");
		});

		var active = null;

		function show(el, clientX, clientY) {
			var label = el.getAttribute("data-label");
			if (!label) return;
			if (active && active !== el) active.classList.remove("is-active");
			active = el;
			el.classList.add("is-active");

			// Built as nodes rather than innerHTML so the data can never be
			// interpreted as markup.
			tip.textContent = "";
			var name = document.createElement("b");
			name.textContent = label;
			tip.appendChild(name);

			var detail = el.getAttribute("data-detail");
			if (detail) {
				var sub = document.createElement("span");
				sub.className = "iol-map__tip-sub";
				sub.textContent = detail;
				tip.appendChild(sub);
			}
			tip.classList.add("is-visible");

			var box = figure.getBoundingClientRect();
			var x, y;
			if (clientX == null) {                 // keyboard focus: anchor to the shape
				var r = el.getBoundingClientRect();
				x = r.left + r.width / 2 - box.left;
				y = r.top - box.top;
			} else {
				x = clientX - box.left;
				y = clientY - box.top;
			}

			// Keep the tooltip inside the figure so it is never clipped at an edge.
			var w = tip.offsetWidth, h = tip.offsetHeight;
			tip.style.left = Math.min(Math.max(x - w / 2, 0), Math.max(box.width - w, 0)) + "px";
			var top = y - h - 10;
			tip.style.top = (top < 0 ? y + 16 : top) + "px";
		}

		function hide() {
			tip.classList.remove("is-visible");
			if (active) active.classList.remove("is-active");
			active = null;
		}

		function rove(from, step) {
			var i = stops.indexOf(from);
			if (i < 0) return;
			var next = stops[(i + step + stops.length) % stops.length];
			from.setAttribute("tabindex", "-1");
			next.setAttribute("tabindex", "0");
			next.focus();
		}

		/* ---- zoom / pan ------------------------------------------------- */

		function apply() {
			svg.setAttribute("viewBox", view.x + " " + view.y + " " + view.w + " " + view.h);
			// Markers mark places too small to see; keep them a constant size on
			// screen so zooming reveals the real coastline underneath instead of
			// an ever-growing dot.
			var k = view.w / base.w;
			markers.forEach(function (m) { m.setAttribute("r", (markerR * k).toFixed(2)); });
			figure.classList.toggle("is-zoomed", k < 0.999);
		}

		function clamp() {
			view.w = Math.min(base.w, Math.max(base.w / MAX_ZOOM, view.w));
			view.h = view.w * base.h / base.w;
			view.x = Math.min(base.x + base.w - view.w, Math.max(base.x, view.x));
			view.y = Math.min(base.y + base.h - view.h, Math.max(base.y, view.y));
		}

		function zoomAt(factor, clientX, clientY) {
			var r = svg.getBoundingClientRect();
			// Fraction of the *rendered* box the cursor sits at. preserveAspectRatio
			// letterboxes the drawing, so work from the drawn area, not the element.
			var scale = Math.min(r.width / view.w, r.height / view.h);
			var drawnW = view.w * scale, drawnH = view.h * scale;
			var originX = r.left + (r.width - drawnW) / 2;
			var originY = r.top + (r.height - drawnH) / 2;

			var px = clientX == null ? 0.5 : (clientX - originX) / drawnW;
			var py = clientY == null ? 0.5 : (clientY - originY) / drawnH;
			px = Math.min(1, Math.max(0, px));
			py = Math.min(1, Math.max(0, py));

			var ax = view.x + px * view.w;
			var ay = view.y + py * view.h;

			view.w = Math.min(base.w, Math.max(base.w / MAX_ZOOM, view.w / factor));
			view.h = view.w * base.h / base.w;
			view.x = ax - px * view.w;
			view.y = ay - py * view.h;
			clamp();
			apply();
		}

		function reset() {
			view.x = base.x; view.y = base.y; view.w = base.w; view.h = base.h;
			apply();
		}

		var pointers = {};
		var drag = null;
		var pinch = null;

		function pointerList() {
			return Object.keys(pointers).map(function (k) { return pointers[k]; });
		}

		svg.addEventListener("pointerdown", function (e) {
			pointers[e.pointerId] = { x: e.clientX, y: e.clientY };
			var list = pointerList();
			if (list.length === 2) {
				drag = null;
				pinch = { dist: Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y) };
			} else if (view.w < base.w) {
				drag = { x: e.clientX, y: e.clientY, vx: view.x, vy: view.y };
				try { svg.setPointerCapture(e.pointerId); } catch (err) { /* not fatal */ }
				figure.classList.add("is-panning");
				hide();
			}
		});

		svg.addEventListener("pointermove", function (e) {
			if (pointers[e.pointerId]) { pointers[e.pointerId].x = e.clientX; pointers[e.pointerId].y = e.clientY; }

			var list = pointerList();
			if (pinch && list.length === 2) {
				var d = Math.hypot(list[0].x - list[1].x, list[0].y - list[1].y);
				if (pinch.dist > 0) {
					zoomAt(d / pinch.dist, (list[0].x + list[1].x) / 2, (list[0].y + list[1].y) / 2);
				}
				pinch.dist = d;
				return;
			}

			if (drag) {
				var r = svg.getBoundingClientRect();
				view.x = drag.vx - (e.clientX - drag.x) * view.w / r.width;
				view.y = drag.vy - (e.clientY - drag.y) * view.h / r.height;
				clamp();
				apply();
				return;
			}

			var el = e.target.closest && e.target.closest("[data-label]");
			if (el) show(el, e.clientX, e.clientY); else hide();
		});

		["pointerup", "pointercancel", "pointerleave"].forEach(function (type) {
			svg.addEventListener(type, function (e) {
				delete pointers[e.pointerId];
				if (pointerList().length < 2) pinch = null;
				if (pointerList().length === 0) { drag = null; figure.classList.remove("is-panning"); }
			});
		});

		svg.addEventListener("mouseleave", hide);

		/* Only hijack the wheel in the expanded view. Stealing scroll from a map
		   sitting inline on the front page is a well-earned annoyance. */
		svg.addEventListener("wheel", function (e) {
			if (!figure.classList.contains("is-expanded")) return;
			e.preventDefault();
			zoomAt(e.deltaY < 0 ? WHEEL : 1 / WHEEL, e.clientX, e.clientY);
		}, { passive: false });

		/* ---- controls --------------------------------------------------- */

		function button(cls, label, text) {
			var b = document.createElement("button");
			b.type = "button";
			b.className = "iol-map__btn " + cls;
			b.setAttribute("aria-label", label);
			b.title = label;
			b.innerHTML = text;
			return b;
		}

		var controls = document.createElement("div");
		controls.className = "iol-map__controls";

		var bIn = button("", "Zoom in", "&plus;");
		var bOut = button("", "Zoom out", "&minus;");
		var bReset = button("is-reset", "Reset view", "&#8635;");
		var bExpand = button("is-expand", "View full screen", "&#9974;");

		bIn.addEventListener("click", function () { zoomAt(STEP, null, null); });
		bOut.addEventListener("click", function () { zoomAt(1 / STEP, null, null); });
		bReset.addEventListener("click", reset);

		function setExpanded(on) {
			figure.classList.toggle("is-expanded", on);
			document.body.classList.toggle("iol-map-is-open", on);
			bExpand.setAttribute("aria-label", on ? "Close full screen" : "View full screen");
			bExpand.title = bExpand.getAttribute("aria-label");
			bExpand.innerHTML = on ? "&times;" : "&#9974;";
			hide();
			reset();
		}
		bExpand.addEventListener("click", function () {
			setExpanded(!figure.classList.contains("is-expanded"));
		});

		[bIn, bOut, bReset, bExpand].forEach(function (b) { controls.appendChild(b); });
		figure.insertBefore(controls, figure.firstChild);

		/* ---- keyboard --------------------------------------------------- */

		svg.addEventListener("focusin", function (e) {
			var el = e.target.closest && e.target.closest("[data-label]");
			if (el) show(el, null, null);
		});
		svg.addEventListener("focusout", hide);

		svg.addEventListener("keydown", function (e) {
			var el = e.target.closest && e.target.closest("[data-label]");
			if (!el) return;
			var step = (e.key === "ArrowRight" || e.key === "ArrowDown") ? 1
			         : (e.key === "ArrowLeft" || e.key === "ArrowUp") ? -1 : 0;
			if (step) { e.preventDefault(); rove(el, step); }
		});

		document.addEventListener("keydown", function (e) {
			if (e.key !== "Escape") return;
			if (figure.classList.contains("is-expanded")) setExpanded(false);
			else hide();
		});

		apply();
	}

	function boot() {
		Array.prototype.forEach.call(document.querySelectorAll(".iol-map"), init);
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", boot);
	} else {
		boot();
	}
})();
