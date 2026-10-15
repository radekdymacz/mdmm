#!/bin/sh
# The Monomachine Editor mockup as one page (index.html, opens on its own in a browser): the page's parts as the
# plug-in's page has them, in the order of their list (skins/mmStudio/src/page.txt: the page's own sources and the
# page files both editors share), with the demo's parts (demo/) at their places in it.
# sync-mmstudio-skin.py reads the same list for the plug-in's page, without the demo's parts.
# DEMO: what the demo host (demo/54-demo.js, DESIGN-UNIFY.md 4.6) needs on its own, in a script of its own after the
# mockup's: the example's documents (demo-docs.json) and the catalogue, and the page files the plug-in's page loads
# beside the mockup (the document store, the overlay, the translation and the view of the documents).
cd "$(dirname "$0")"
SKINS=../../../source/elektron/md/mdJucePlugin/skins
SHARED=$SKINS/shared
SKIN=$SKINS/mmStudio
# the parts of the kinds k (a regex: css, body, "js|demo"), in order: a page part's path is from skins/, a demo part's
# from this folder
parts() { awk -v skins="$SKINS" -v k="$1" '$1 ~ "^(" k ")$" { print ($1 == "demo" ? "" : skins "/") $2 }' "$SKIN/src/page.txt"; }
DEMO="$SHARED/deskDocs.js $SHARED/deskOverlay.js $SKIN/mmConvert.js $SKIN/mmView.js"
{
printf '<!doctype html>\n<html lang="en">\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1">\n<title>Monomachine Editor</title>\n<meta name="description" content="Screen-native editor mockup for the Elektron Monomachine (SFX-6 / SFX-60, OS 1.32)">\n<link rel="preconnect" href="https://fonts.googleapis.com">\n<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Barlow+Condensed:wght@500;600&family=IBM+Plex+Mono:wght@400;500&family=Silkscreen&display=swap">\n<style>\n'
# a stylesheet both pages share, at a line "/* @include shared/<file> */" of a page's own file (as the sync scripts)
for f in $(parts css); do awk -v shared="$SHARED" '/^\/\* @include shared\/[A-Za-z0-9_.-]+\.css \*\/$/ { n = $3; sub(/^shared\//, "", n); while ((getline l < (shared "/" n)) > 0) print l; close(shared "/" n); next } { print }' "$f"; done
printf '</style>\n'
cat $(parts body)
printf '<script>\n'
cat $(parts 'js|demo')
printf '</script>\n<script>\nwindow.MM_DEMO=Object.assign('
cat demo-docs.json
printf ',{catalogue:'
cat ../mm-catalogue.json
printf '});\n'
cat $DEMO
printf '</script>\n'
} > index.html
