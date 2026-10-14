/* The guide's web pages: the Contents button on narrow screens and the current section in the menu.
   The pages work without this file: the menu is then an ordinary list above the text. */
(function () {
	'use strict';
	var root = document.documentElement;
	root.classList.add('gd-js');
	var side = document.getElementById('gd-side');
	var btn = document.querySelector('.gd-menubtn');
	if (btn && side) {
		btn.hidden = false;
		var set = function (open) {
			side.classList.toggle('gd-open', open);
			btn.setAttribute('aria-expanded', open ? 'true' : 'false');
		};
		btn.addEventListener('click', function () { set(!side.classList.contains('gd-open')); });
		side.addEventListener('click', function (e) { if (e.target.closest && e.target.closest('a')) set(false); });
		document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && side.classList.contains('gd-open')) { set(false); btn.focus(); } });
	}
	/* the section being read is marked in the menu (aria-current="location") */
	if (side && 'IntersectionObserver' in window) {
		var links = {};
		side.querySelectorAll('.gd-side-subs a[href^="#"]').forEach(function (a) { links[a.getAttribute('href').slice(1)] = a; });
		var sections = document.querySelectorAll('.gd-sec');
		var visible = [];
		var mark = function () {
			var cur = visible.length ? visible[0] : null;
			Object.keys(links).forEach(function (id) {
				if (cur === id) links[id].setAttribute('aria-current', 'location'); else links[id].removeAttribute('aria-current');
			});
		};
		var io = new IntersectionObserver(function (entries) {
			entries.forEach(function (en) {
				var i = visible.indexOf(en.target.id);
				if (en.isIntersecting && i < 0) visible.push(en.target.id);
				if (!en.isIntersecting && i >= 0) visible.splice(i, 1);
			});
			var order = Array.prototype.map.call(sections, function (s) { return s.id; });
			visible.sort(function (a, b) { return order.indexOf(a) - order.indexOf(b); });
			mark();
		}, { rootMargin: '-8% 0px -70% 0px' });
		sections.forEach(function (s) { if (links[s.id]) io.observe(s); });
	}
})();
