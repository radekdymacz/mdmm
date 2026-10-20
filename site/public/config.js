/*
 * Site configuration: the only file to edit for a release.
 * Plain public data (no secrets), loaded before the page scripts.
 * A value containing "REPLACE_ME" counts as not configured.
 */
window.MDMM_CONFIG = {
  // Bumped by the release process. Shown on the page as-is; the page makes no API calls.
  version: "0.8.0",

  // Contact address. The pages carry it statically (entity-encoded mailto); keep this in sync.
  contact: { email: "radekdymacz@gmail.com" },

  source: "https://github.com/radekdymacz/mdmm",
  releasesPage: "https://github.com/radekdymacz/mdmm/releases",

  // Downloads per operating system, then per machine. GitHub's stable "latest release" redirect:
  // the release build must publish exactly these asset names. The download page picks the
  // visitor's system (or ?os=mac|win|linux) and offers the others. An OS without URLs shows
  // its note and the releases page. `button` is the big download button's words (default
  // "Download"); on macOS it says what the file is, because the same release also holds a .dmg
  // of loose files (`dmg`, offered as a small secondary link) and a person who took that wrote
  // "no installer on Mac" (doc/release/BUGS.md, B-040).
  downloads: {
    mac: {
      label: "macOS",
      line: "macOS (Intel and Apple silicon) · the app, VST3 and AU in one installer",
      button: "Download the installer (.pkg)",
      md: { name: "Machinedrum Editor", url: "https://github.com/radekdymacz/mdmm/releases/latest/download/Machinedrum-Editor-macOS.pkg", dmg: "https://github.com/radekdymacz/mdmm/releases/latest/download/Machinedrum-Editor-macOS.dmg" },
      mm: { name: "Monomachine Editor", url: "https://github.com/radekdymacz/mdmm/releases/latest/download/Monomachine-Editor-macOS.pkg", dmg: "https://github.com/radekdymacz/mdmm/releases/latest/download/Monomachine-Editor-macOS.dmg" }
    },
    win: {
      label: "Windows",
      line: "Windows x64 · not tested yet · the app and VST3 in one zip",
      md: { name: "Machinedrum Editor", url: "https://github.com/radekdymacz/mdmm/releases/latest/download/Machinedrum-Editor-Windows-x64-not-tested.zip" },
      mm: { name: "Monomachine Editor", url: "https://github.com/radekdymacz/mdmm/releases/latest/download/Monomachine-Editor-Windows-x64-not-tested.zip" }
    },
    linux: {
      label: "Linux",
      line: "Linux x64 · not tested yet · the app and VST3 · needs WebKitGTK",
      md: { name: "Machinedrum Editor", url: "https://github.com/radekdymacz/mdmm/releases/latest/download/Machinedrum-Editor-Linux-x64-not-tested.tar.gz" },
      mm: { name: "Monomachine Editor", url: "https://github.com/radekdymacz/mdmm/releases/latest/download/Monomachine-Editor-Linux-x64-not-tested.tar.gz" }
    }
  }
};
