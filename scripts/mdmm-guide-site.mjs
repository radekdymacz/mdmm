// The site's own header, footer and social tags, as the other pages carry them (copied from the old /guide/ page when
// the landing page became generated, 2026-10). Used by scripts/mdmm-guide.mjs for /guide/, /guide/start/, /guide/keys/.

export const SITE_SOCIAL = `<meta property="og:type" content="website">
<meta property="og:site_name" content="MD + MM Editor">
<meta property="og:title" content="MD + MM Editor — free editors for Machinedrum and Monomachine">
<meta property="og:description" content="Free desktop editors for the Elektron Machinedrum and Monomachine. The real firmware, emulated, or your own machine over MIDI. VST3, AU and app for macOS (Intel and Apple silicon). Windows build, not tested.">
<meta property="og:url" content="https://mdmm.dev/guide/">
<meta property="og:image" content="https://mdmm.dev/og.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta property="og:image:alt" content="Free editors for Machinedrum and Monomachine, beside a screenshot of the Machinedrum Editor's step grid and GEN bar.">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="MD + MM Editor — free editors for Machinedrum and Monomachine">
<meta name="twitter:description" content="Free desktop editors for the Elektron Machinedrum and Monomachine. VST3, AU and app for macOS (Intel and Apple silicon). Windows build, not tested.">
<meta name="twitter:image" content="https://mdmm.dev/og.png">
`;

export const SITE_HEADER = `<header class="top">
  <div class="wrap">
    <a class="brand" href="/" aria-label="MD + MM Editor, home"><i class="dot" aria-hidden="true"></i><b>MD + MM Editor</b></a>
    <nav class="nav" aria-label="Main">
      <a class="opt" href="/#features">Features</a>
      <a class="keep" href="/guide/">Guide</a>
      <a class="opt" href="/#faq">FAQ</a>
      <a class="disc" href="https://discord.gg/8xwXwBHbtn" aria-label="Discord community"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 3.5h11a1 1 0 0 1 1 1v6a1 1 0 0 1-1 1H7l-3 2.5V11.5H2.5a1 1 0 0 1-1-1v-6a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"/><circle cx="5.5" cy="7.5" r="1" fill="currentColor"/><circle cx="8" cy="7.5" r="1" fill="currentColor"/><circle cx="10.5" cy="7.5" r="1" fill="currentColor"/></svg><span>Discord</span></a>
      <button class="themebtn" type="button" data-theme-toggle aria-label="Switch to dark theme"><svg viewBox="0 0 16 16" aria-hidden="true"><circle cx="8" cy="8" r="6.5" fill="none" stroke="currentColor" stroke-width="1.5"/><path d="M8 1.5a6.5 6.5 0 0 1 0 13z" fill="currentColor"/></svg></button>
      <a class="btn btn-primary btn-sm" href="/get/">Download free</a>
    </nav>
  </div>
</header>`;

export const SITE_FOOTER = `<footer class="foot">
  <div class="wrap grid">
    <p><b>MD + MM Editor</b> <span data-version></span> · Machinedrum Editor and Monomachine Editor<br>A NativeKloud Consulting project — <a href="https://nativekloud.com">nativekloud.com</a></p>
    <p><b>Free software</b> under the <a href="https://www.gnu.org/licenses/gpl-3.0.html">GPL-3</a>. <a href="https://github.com/radekdymacz/mdmm">Source</a> · <a href="https://github.com/radekdymacz/mdmm/releases">All releases</a></p>
    <p><b>Credits.</b> Built on <a href="https://github.com/joelanders/gearmulator-md-mm">gearmulator-md-mm</a> by joelanders (the Machinedrum and Monomachine emulation) and <a href="https://github.com/dsp56300/gearmulator">Gearmulator</a> by The Usual Suspects (dsp56300). Thanks to Elektron for the instruments.</p>
    <p class="legal"><a href="/guide/">Guide</a> · <a href="/releases/">Release notes</a> · <a href="/terms/">Terms</a> · <a href="/privacy/">Privacy</a> · <a href="/refunds/">Refunds</a> · <a href="/contact/">Contact</a> · <a href="https://discord.gg/8xwXwBHbtn">Discord</a> · <a href="&#109;&#97;&#105;&#108;&#116;&#111;&#58;&#114;&#97;&#100;&#101;&#107;&#100;&#121;&#109;&#97;&#99;&#122;&#64;&#103;&#109;&#97;&#105;&#108;&#46;&#99;&#111;&#109;">&#114;&#97;&#100;&#101;&#107;&#100;&#121;&#109;&#97;&#99;&#122;&#64;&#103;&#109;&#97;&#105;&#108;&#46;&#99;&#111;&#109;</a></p>
    <p><b>Trademarks.</b> Elektron, Machinedrum and Monomachine are trademarks of Elektron Music Machines. This project is independent and not affiliated with or endorsed by Elektron, joelanders or The Usual Suspects. No firmware is included. No cookies, no analytics, no third-party scripts.</p>
  </div>
</footer>`;
