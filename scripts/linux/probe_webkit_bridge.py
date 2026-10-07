#!/usr/bin/env python3
# Throw-away probe: which of the page bridge's channels work under webkit2gtk-4.0 (JUCE 7's Linux backend).
import os, json
import gi
gi.require_version("Gtk", "3.0")
gi.require_version("WebKit2", "4.0")
from gi.repository import Gtk, WebKit2, GLib

d = "/tmp/wkprobe"
os.makedirs(d, exist_ok=True)
page = os.path.join(d, "page.html")
open(page, "w").write("""<!doctype html><html><body><script>
function nav(u){const f=document.createElement('iframe');f.style.display='none';f.src=u;document.documentElement.appendChild(f);setTimeout(()=>f.remove(),1000);}
window.gm={recv(x,seq){nav('gmbridge://c/got-'+encodeURIComponent(String(x).slice(0,40))+'-len'+String(x).length);}};
window.addEventListener('hashchange',()=>nav('gmbridge://c/hash-'+location.hash.slice(1,30)));
function poll(n){const s=document.createElement('script');s.src='recv-'+n+'.js?'+Date.now();
 s.onload=()=>{s.remove();poll(n+1);};s.onerror=()=>{s.remove();setTimeout(()=>poll(n),20);};document.head.appendChild(s);}
window.addEventListener('load',()=>{nav('gmbridge://c/hello');nav('gmbridge://c/hello2');poll(1);});
</script></body></html>""")
for f in os.listdir(d):
    if f.startswith("recv-"):
        os.remove(os.path.join(d, f))

w = Gtk.Window()
v = WebKit2.WebView()
w.add(v)
w.show_all()
seen = []


def log(*a):
    print(*a, flush=True)


def policy(view, decision, kind):
    if kind == WebKit2.PolicyDecisionType.NAVIGATION_ACTION:
        a = decision.get_navigation_action()
        uri = a.get_request().get_uri()
        log("NAV", repr(decision.get_frame_name()), uri[:80])
        if uri.startswith("gmbridge://"):
            seen.append(uri)
            decision.ignore()
            return True
    return False


v.connect("decide-policy", policy)
v.connect("load-failed", lambda view, ev, uri, err: log("LOAD-FAILED", uri[:80], err.message))
step = [0]


def tick():
    step[0] += 1
    s = step[0]
    if s == 10:
        log("STEP js small")
        v.load_uri("javascript:window.gm&&gm.recv('js-small',1)")
    if s == 15:
        log("STEP js big")
        v.load_uri("javascript:window.gm&&gm.recv('" + "x" * 900000 + "',2)")
    if s == 20:
        log("STEP file")
        tmp = os.path.join(d, "t.js")
        open(tmp, "w").write("gm.recv('file-1',3)")
        os.rename(tmp, os.path.join(d, "recv-1.js"))
    if s == 25:
        log("STEP file big")
        tmp = os.path.join(d, "t.js")
        open(tmp, "w").write("gm.recv('" + "y" * 900000 + "',4)")
        os.rename(tmp, os.path.join(d, "recv-2.js"))
    if s == 30:
        log("STEP hash")
        v.load_uri("file://" + page + "#h1")
    if s == 40:
        log("RESULT", json.dumps([u[:60] for u in seen]))
        Gtk.main_quit()
        return False
    return True


v.load_uri("file://" + page)
GLib.timeout_add(200, tick)
Gtk.main()
