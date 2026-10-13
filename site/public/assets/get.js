/* Download flow: 1 machine -> 2 download. The download is free; support is a plain link to GitHub Sponsors.
   State lives only in the URL (?ed=md|mm&os=...). No storage, no cookies, no requests. */
(function () {
  "use strict";
  var C = window.MDMM_CONFIG || {};
  var step = document.body.dataset.step;
  var q = new URLSearchParams(location.search);
  var ed = q.get("ed") === "mm" ? "mm" : "md";
  var ready = function (u) { return typeof u === "string" && /^https:\/\//.test(u) && u.indexOf("REPLACE_ME") < 0; };

  /* The operating system: ?os= first, then the browser's own report, then macOS. Both steps
     show it as a switch; step 1 passes it on to step 2 in the form (?os=). */
  var OS = C.downloads || {};
  var detect = function () {
    var p = ((navigator.userAgentData && navigator.userAgentData.platform) || navigator.platform || "") + " " + navigator.userAgent;
    if (/android|iphone|ipad/i.test(p)) return "mac";
    if (/win/i.test(p)) return "win";
    if (/linux|x11|cros/i.test(p)) return "linux";
    return "mac";
  };
  var os = Object.prototype.hasOwnProperty.call(OS, q.get("os")) ? q.get("os") : detect();
  if (!OS[os]) os = "mac";
  var onOs = function () {};
  function useOs(o) {
    os = o;
    document.querySelectorAll("[data-os-line]").forEach(function (el) { el.textContent = OS[os].line || OS[os].label; });
    document.querySelectorAll("[data-os]").forEach(function (el) { el.hidden = el.dataset.os !== os; });
    document.querySelectorAll("#os button").forEach(function (b) { b.setAttribute("aria-pressed", String(b.value === os)); });
    document.querySelectorAll("input[name=os]").forEach(function (i) { i.value = os; });
    var u = new URL(location.href);
    u.searchParams.set("os", os);
    history.replaceState(null, "", u.toString());
    onOs();
  }
  var osBox = document.getElementById("os");
  if (osBox) Object.keys(OS).forEach(function (k) {
    var b = document.createElement("button");
    b.type = "button"; b.value = k; b.textContent = OS[k].label || k;
    b.addEventListener("click", function () { useOs(k); });
    osBox.appendChild(b);
  });

  if (step === "1") {
    var r = document.querySelector("input[name=ed][value=" + ed + "]");
    if (r && q.get("ed")) r.checked = true;
    useOs(os);
    return;
  }
  if (step !== "2") return;

  var rel = ready(C.releasesPage) ? C.releasesPage : "https://github.com/radekdymacz/mdmm/releases";
  var fileUrl = rel;
  var name = ed === "mm" ? "Monomachine Editor" : "Machinedrum Editor";
  document.querySelector("[data-name]").textContent = name;
  document.title = "Download " + name + " — MD + MM Editor";

  var hasFile = false; /* the chosen OS has a download */
  onOs = function () {
    var D = (OS[os] || {})[ed] || {};
    hasFile = ready(D.url);
    fileUrl = ready(D.url) ? D.url : rel;
    document.querySelectorAll("[data-download]").forEach(function (el) { if (el.tagName === "A") el.href = fileUrl; });
    /* the big button says what the file is (macOS: the installer), so the .dmg of loose files is not taken for it */
    document.querySelectorAll("[data-dl-label]").forEach(function (el) {
        el.textContent = hasFile && (OS[os] || {}).button || "Download";
    });
    var dmg = document.querySelector("[data-dmg-link]");
    if (dmg) { dmg.href = ready(D.dmg) ? D.dmg : rel; dmg.parentNode.hidden = !ready(D.dmg); }
  };
  useOs(os);

  var started = document.getElementById("started");
  document.querySelectorAll("[data-download]").forEach(function (el) {
    if (el.tagName === "A") el.href = fileUrl;
    el.addEventListener("click", function (e) {
      e.preventDefault();
      started.hidden = false;
      location.href = fileUrl; /* a file download: this page stays */
    });
  });
})();
