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
const TRANSPORT_HOST={recordLabel:"Live record",stepRecord:()=>stepRecord(),play:()=>playButton(),stop:()=>stopNow(),pauseToggle:()=>pauseToggle(),record:()=>liveRecord(),panic:()=>panicNow()};
function transportMenu(x,y){DeskTransport.openMenu(x,y,{playing:S.playing,paused:!!S.paused,rec:!!S.rec,step:stepOn(),can:{transport:!NA.transport,record:true,stepRecord:!NA.gridRecord,panic:!NA.panic},reasons:{panic:NA.panic,stepRecord:NA.gridRecord}},TRANSPORT_HOST)}
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

/* ===== Wave 7: recording on the Monomachine (manual 1-49, 1-50) =====
   STEP RECORDING: ⇧-click REC (stopped; also the ▶ menu). The REC key shows STEP and a cursor marks the step on the roll
   (no row of its own: the layout stays); the words are the toast's and the REC key's title. The machine writes the focus
   track only: the selected synth track, moved when the selection changes (select(), 130-main.js). A note played (the home
   row, the roll's keys) writes the step under the cursor and moves on; → a rest, ← back, Delete clears the step, Esc
   done. A step selection is dropped when it starts, and the selection's keys stand aside while it runs (77-select.js).
   The cursor is the machine's (S.stepAt, from the host).
   Live erase: Delete held while LIVE RECORDING plays is EXIT held on the machine; the selected track's notes go as they
   pass. Let go (or the window loses the keys): EXIT up. While held the page says so every 250 ms: the core lets EXIT go
   when that stops (a page that went away while Delete was down). With a host each is HOST.transport(op, args); on its
   own the example moves its own cursor. */
const stepOn=()=>S.recMode==="step";
function stepRecord(){
 if(NA.gridRecord){toast(NA.gridRecord);return}
 if(stepOn()){stepDone();return}
 if(S.playing||S.paused){toast("Stop first: step recording starts while the machine is stopped.");return}
 if(S.stepSel)clearSel();
 const t=isMidiT(S.sel)?0:S.sel;S.stepT=t;
 if(HOST.transport){transportCmd("record",{mode:"step",t});return}
 setRecord("step",0);toast("STEP RECORDING: play a note to write it to the step, then the next. → a rest, ← back, Delete clears the step, Esc: done.")}
function stepDone(){if(!stepOn())return;if(HOST.record){HOST.record();return}setRecord("off",-1)}
function stepKey(key){
 if(HOST.transport){transportCmd("stepKey",{key});return}
 const n=Math.max(1,S.len);S.stepAt=(S.stepAt+(key==="left"?n-1:1))%n;stepDraw()}
/* the focus follows the selection (synth tracks only: the machine step-records its six); called where the track changes */
function stepFocus(){if(!stepOn()||isMidiT(S.sel)||S.stepT===S.sel)return;S.stepT=S.sel;if(HOST.transport)transportCmd("record",{mode:"step",t:S.sel})}
/* the cursor on the roll (drawing only) */
function stepDraw(){
 $$(".stepcur").forEach(x=>x.remove());
 if(!stepOn()||S.ws!=="seq")return;
 const t=S.stepT??S.sel,at=S.stepAt,lane=$("#seq .nlane.big"),ru=at>=0?$(`#seq .ruler .rul[data-s="${at}"]`):null;
 if(!lane||!ru)return;
 const lr=lane.getBoundingClientRect(),r=ru.getBoundingClientRect();
 lane.insertAdjacentHTML("beforeend",`<div class="stepcur" aria-hidden="true" data-l="${tLabel(t)} · STEP ${String(at+1).padStart(2,"0")}" style="left:${r.left-lr.left-1}px;width:${r.width+2}px"></div>`)}
const ERASE={t:null,beat:0};
function eraseDown(e){if(e.repeat||ERASE.t===S.sel||isMidiT(S.sel))return;ERASE.t=S.sel;document.body.classList.add("erasing");
 if(!HOST.transport){toast(`Erasing ${tLabel(S.sel)}'s notes as they play, while Delete is held.`);return}
 transportCmd("liveErase",{t:S.sel,on:true},ok=>{if(!ok)eraseUp()});
 clearInterval(ERASE.beat);ERASE.beat=setInterval(()=>{if(ERASE.t!=null)transportCmd("liveErase",{t:ERASE.t,on:true})},250)}
function eraseUp(){if(ERASE.t==null)return;const t=ERASE.t;ERASE.t=null;clearInterval(ERASE.beat);document.body.classList.remove("erasing");if(HOST.transport)transportCmd("liveErase",{t,on:false})}
document.addEventListener("keyup",e=>{if(e.key==="Delete"||e.key==="Backspace")eraseUp()});addEventListener("blur",()=>eraseUp());

/* ===== keys ===== */
Keys.bind({id:"pause",short:"Pause",scope:"any",keys:["Space"],code:"Space",mod:"shift",group:"Transport",does:"Pause: the machine holds its step; again (or ▶) goes on from it, STOP ends it (also ⇧-click ▶)",run:()=>pauseToggle()});
Keys.bind({id:"panic",short:"Panic",scope:"any",keys:["."],mod:"cmd",group:"Transport",does:"Panic: every note off (All Notes Off on each track's channel) and STOP",run:()=>panicNow()});
Keys.bind({id:"tempo-nudge",short:"Nudge",scope:"any",keys:["-","="],group:"Transport",does:"Hold: the tempo 10 % slower (-) or faster (=) while held, as the TEMPO menu's nudge",when:()=>kbOn(),run:e=>DeskTransport.nudgeKey(e.key,TEMPO_HOST)});
Keys.bind({id:"live-erase",short:"Erase",scope:"any",keys:["Delete","Backspace"],group:"Transport",does:"While live recording, hold: erase the selected track's notes as they play (EXIT held on the machine)",when:()=>S.recMode==="live"&&kbOn(),run:e=>eraseDown(e)});
Keys.bind({id:"step-move",short:"Back / Rest",scope:"any",keys:["ArrowLeft","ArrowRight"],group:"Transport",does:"Step recording: ← a step back, → on (a rest); Delete clears the step, Esc: done",when:()=>stepOn()&&kbOn(),run:e=>stepKey(e.key==="ArrowLeft"?"left":"right")});
Keys.bind({id:"step-clear",short:"Clear step",hidden:true,scope:"any",keys:["Delete","Backspace"],group:"Transport",does:"Step recording: clear the step under the cursor and move on",when:()=>stepOn()&&kbOn(),run:()=>stepKey("clear")});
Keys.bind({id:"step-done",short:"Done",hidden:true,scope:"any",keys:["Escape"],group:"Transport",does:"Step recording: done",when:()=>stepOn()&&kbOn(),run:()=>stepDone()});
Keys.bind({id:"song-play-from",short:"From here",scope:"song",keys:["Enter"],group:"Song",does:"Play the song from the selected row (▶ From here)",when:()=>kbOn()&&S.ws==="song"&&!document.activeElement?.closest?.(".songlib,[data-rowact]"),run:()=>playFromRow()});
[["transport-menu","any","Top bar",["right-click ▶"],"","Transport","The transport menu: Play / Stop, Pause / Continue, Live record, Step record, Panic (also the ▾ in the key's corner)"],
 ["step-record","any","Top bar",["REC"],"shift","Transport","Click (stopped): step recording; again (or Esc): done"],
 ["pause-click","any","Top bar",["▶"],"shift","Transport","Click: pause; ▶ again goes on from the step"],
 ["tempo-click","any","Top bar",["tempo"],"","Transport","Click (no drag): the TEMPO window: − / +, TAP, nudge, change on release, INT / EXT"],
 ["tempo-delayed","any","Top bar",["tempo"],"alt","Transport","Drag: the tempo changes when you let go (FUNCTION held on the machine)"]
].forEach(([id,scope,area,keys,mod,group,does])=>Keys.bind({id,scope,area,keys,mod,group,does}));
