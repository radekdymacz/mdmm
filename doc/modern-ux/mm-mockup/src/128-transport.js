/* ===== Wave 2 (doc/modern-ux/DESIGN-machine-menus.md §2): the transport beyond PLAY and STOP =====
   The ▶ menu and the TEMPO pop-up are drawn by shared/deskTransport.js; here are this page's commands for them:
     the pause: ⇧-click ▶ or ⇧Space; ▶ again (or ⇧Space) goes on from the step, STOP ends it. S.paused holds the step the
       pause keeps until PLAY, STOP, or the machine plays again (setPlaying);
     the ▶ menu: right-click ▶, or the ▾ in its corner (Play / Stop, Pause / Continue, Live record, Panic);
     panic: ⌘. (All Notes Off on each track's channel, then STOP);
     the TEMPO pop-up: a click on the LCD's tempo (a drag still sets it); the nudge: - and = held; the sync INT / EXT;
     play from a song row: ▶ From here on the Song page's selected row, or Enter there.
   With a host, each is HOST.transport(op, args, done); on its own the mockup's example clock pauses and goes on. */
function transportCmd(op,args,done){if(HOST.transport)return HOST.transport(op,args||{},done||(()=>{}));if(done)done(true)}
function pauseNow(){if(!S.playing)return;const step=S.step;
 if(HOST.transport)transportCmd("pause",{},ok=>{if(!ok){S.paused=null;renderTop();setPos()}});else{clearInterval(clock);S.playing=false}
 S.paused={step};renderTop();setPos()}
function resumeNow(){if(!S.paused)return;const at=S.paused.step;S.paused=null;
 if(HOST.transport)transportCmd("resume");else{S.playing=true;S.step=at;restartClock()}
 renderTop();setPos()}
function pauseToggle(){if(S.paused)resumeNow();else pauseNow()}
/* the ▶ key: PLAY, STOP, or (paused) CONTINUE */
function playButton(){if(S.paused){resumeNow();return}togglePlay()}
function stopNow(){const was=S.paused;S.paused=null;
 if(S.playing)togglePlay();
 else if(was&&HOST.transport)transportCmd("stop");	// paused: the machine stands; STOP ends the pause
 else if(was)S.step=-1;
 renderTop();setPos()}
function panicNow(){if(NA.panic){toast(NA.panic);return}S.paused=null;
 if(HOST.transport)transportCmd("panic",{},()=>{});else{if(S.playing)togglePlay();toast("Panic: every note off.")}
 renderTop();setPos()}
const TRANSPORT_HOST={recordLabel:"Live record",play:()=>playButton(),stop:()=>stopNow(),pauseToggle:()=>pauseToggle(),record:()=>liveRecord(),panic:()=>panicNow()};
function transportMenu(x,y){DeskTransport.openMenu(x,y,{playing:S.playing,paused:!!S.paused,rec:!!S.rec,can:{transport:!NA.transport,record:true,panic:!NA.panic},reasons:{panic:NA.panic}},TRANSPORT_HOST)}
document.addEventListener("contextmenu",e=>{if(!e.target.closest?.("#play"))return;e.preventDefault();e.stopImmediatePropagation();transportMenu(e.clientX,e.clientY)},true);
document.addEventListener("click",e=>{const m=e.target.closest?.("#playmore");if(!m)return;e.preventDefault();e.stopImmediatePropagation();const r=m.getBoundingClientRect();transportMenu(r.left,r.bottom+2)},true);

/* ===== the TEMPO pop-up and the nudge ===== */
function nudgeTempo(pct){if(pct&&tempoLocked())return;
 if(HOST.transport){transportCmd("nudge",{pct});return}
 if(pct&&S.nudgeFrom==null)S.nudgeFrom=S.bpm;if(S.nudgeFrom!=null)S.bpm=pct?DeskTransport.nudged(S.nudgeFrom,pct):S.nudgeFrom;if(!pct)S.nudgeFrom=null;renderTop();if(S.playing)restartClock()}
function setTempo(bpm){if(tempoLocked())return;S.bpm=bpm;if(HOST.tempo)HOST.tempo(S.bpm);renderTop();if(S.playing)restartClock()}
const TEMPO_HOST={bpm:()=>S.tempoDraft??S.bpm,set:bpm=>setTempo(bpm),nudge:pct=>nudgeTempo(pct),tap:()=>tapTempo(),
 refused:()=>S.hostTempo?"The DAW sets the tempo. Change it there.":"",
 sync:{html:()=>{const ext=!!S.glob?.clockIn;return`<span class="seg" title="GLOBAL › Sync › Tempo in: the machine's own tempo (INT) or MIDI clock (EXT)"><button data-tp="sync:int" aria-pressed="${!ext}">INT</button><button data-tp="sync:ext" aria-pressed="${ext}">EXT</button></span>`},
  click:a=>{if(!S.glob||!!S.glob.clockIn===(a==="ext"))return;S.glob.clockIn=a==="ext";edit("globalMidi",{clockIn:a==="ext"});DeskTransport.refreshTempo()},
  global:()=>openGlobal()}};
function openTempo(){const b=$("#bpm");if(b)DeskTransport.openTempo(b,TEMPO_HOST)}
(()=>{const b=$("#bpm");if(b){b.setAttribute("aria-haspopup","dialog");DeskTransport.bindClick(b,openTempo)}})();

/* ===== play from a song row ===== */
function playFromRow(i=S.songSel){if(NA.playFrom){toast(NA.playFrom);return}const r=S.song[i];if(!r||r.type){toast("Pick a pattern row to play from.");return}
 if(S.songs&&S.songs.slot!==S.songs.current){toast(`The machine plays song ${String(S.songs.current+1).padStart(2,"0")}: Load this one first, then play it from a row.`);return}
 S.paused=null;if(HOST.transport){transportCmd("playFrom",{i});return}
 toast(`Plays the song from row ${String(i+1).padStart(3,"0")}.`)}

/* ===== keys ===== */
Keys.bind({id:"pause",short:"Pause",scope:"any",keys:["Space"],code:"Space",mod:"shift",group:"Transport",does:"Pause: the machine holds its step; again (or ▶) goes on from it, STOP ends it (also ⇧-click ▶)",run:()=>pauseToggle()});
Keys.bind({id:"panic",short:"Panic",scope:"any",keys:["."],mod:"cmd",group:"Transport",does:"Panic: every note off (All Notes Off on each track's channel) and STOP",run:()=>panicNow()});
Keys.bind({id:"tempo-nudge",short:"Nudge",scope:"any",keys:["-","="],group:"Transport",does:"Hold: the tempo 10 % slower (-) or faster (=) while held, as the TEMPO menu's nudge",when:()=>kbOn(),run:e=>DeskTransport.nudgeKey(e.key,TEMPO_HOST)});
Keys.bind({id:"song-play-from",short:"From here",scope:"song",keys:["Enter"],group:"Song",does:"Play the song from the selected row (▶ From here)",when:()=>kbOn()&&S.ws==="song",run:()=>playFromRow()});
[["transport-menu","any","Top bar",["right-click ▶"],"","Transport","The transport menu: Play / Stop, Pause / Continue, Live record, Panic (also the ▾ in the key's corner)"],
 ["pause-click","any","Top bar",["▶"],"shift","Transport","Click: pause; ▶ again goes on from the step"],
 ["tempo-click","any","Top bar",["tempo"],"","Transport","Click (no drag): the TEMPO window: − / +, TAP, nudge, change on release, INT / EXT"],
 ["tempo-delayed","any","Top bar",["tempo"],"alt","Transport","Drag: the tempo changes when you let go (FUNCTION held on the machine)"]
].forEach(([id,scope,area,keys,mod,group,does])=>Keys.bind({id,scope,area,keys,mod,group,does}));
