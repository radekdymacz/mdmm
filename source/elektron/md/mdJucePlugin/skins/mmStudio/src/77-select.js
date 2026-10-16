
/* ===== Selected steps (DESIGN-step-selection.md §7, DESIGN-keymap.md K7): as the Machinedrum Editor =====
   The selection is one value, S.stepSel = {t, n, from, to} (tracks t to t + n - 1, steps [from, to)); what it is and
   what moves it, the press / drag / release decisions, its keys and the step menu's order are both editors' (StepSel,
   skins/shared/deskSelect.js). Here: where the Monomachine shows it (the piano roll's columns, the trig rows, the
   step ruler, the rail's tracks), its pointer (⌘-click or ⌘-drag in the roll or a trig row, the ruler without a
   modifier, ⌘⇧ extends, ⌘-drag of the selection drops a copy) and its operations, each one intent of the core
   (copySteps, clearSteps, pasteSteps, copyStepsTo, steps; a cut is two in one gesture): one undo step. The roll
   shows one track: ⌘⇧-click on another track's roll extends the selection to it; ⌘A takes every track of the side
   shown. A row of steps pastes onto a track of its kind only (synth or MIDI), as on the machine. */
S.stepSel=null;
const SEL_TRACKS=12;
const selName=(t,n)=>n>1?`${tLabel(t)}–${tLabel(t+n-1)}`:tLabel(t);
const selSay=x=>StepSel.say(x,selName);
function inSel(t,s,x=S.stepSel){return StepSel.inside(x,t,s)}
function selShown(x=S.stepSel){return StepSel.shown(x,S.len)}
/* the classes the rows' templates (70-seq.js) and syncSel give: the ruler's numbers, the selected track's trig cells, the rail's tracks */
const rulSel=s=>S.stepSel&&s>=S.stepSel.from&&s<S.stepSel.to?"selx":"";
const cellSel=s=>(inSel(S.sel,s)?"selx":"")+(inSel(S.sel,s,selGhost)?" selghost":"");
const trackSel=t=>S.ws==="seq"&&S.stepSel&&t>=S.stepSel.t&&t<S.stepSel.t+S.stepSel.n?"selt":"";
let selGhost=null;	/* where a ⌘-drag of the selection would drop its copy (dashed) */
function syncSel(ghost){selGhost=ghost||null;
 $$("#seq .ruler .rul[data-s]").forEach(r=>r.classList.toggle("selx",!!rulSel(+r.dataset.s)));
 $$("#seq .tlane .tc[data-s]").forEach(c=>{const s=+c.dataset.s;c.classList.toggle("selx",inSel(S.sel,s));c.classList.toggle("selghost",inSel(S.sel,s,selGhost))});
 $$("#rail .th[data-sel]").forEach(h=>h.classList.toggle("selt",!!trackSel(+h.dataset.sel)));
 $$("#lane .lb[data-s]").forEach(b=>b.classList.toggle("vsel",inSel(S.sel,+b.dataset.s)));
 secLabels();redraw();StepSel.moreWake()}
function setSel(x){S.stepSel=x;syncSel()}
function clearSel(){if(!S.stepSel&&!selGhost)return;S.stepSel=null;syncSel()}
/* the roll draws the selection over the selected track's columns (ED.lane, 70-seq.js) */
function drawSel(g,G,t){for(const[b,dash] of [[S.stepSel,false],[selGhost,true]]){if(!b||t<b.t||t>=b.t+b.n)continue;
 const a=Math.max(b.from,G.a),e=Math.min(b.to,G.b);if(e<=a)continue;const c0=G.col[a],c1=G.col[e-1];if(!c0||!c1)continue;
 g.save();if(!dash){g.fillStyle=inkA(.1);g.fillRect(c0.x0,0,c1.x1-c0.x0,G.H)}g.strokeStyle=cssv("--ink");g.lineWidth=2;if(dash)g.setLineDash([5,4]);g.strokeRect(c0.x0+1,1,c1.x1-c0.x0-2,G.H-2);g.restore()}}
/* the LCD's COPY CLR PASTE say what they act on, marked while it is the selected steps */
function secLabels(){const sel=S.ws==="seq"&&!!S.stepSel,say=sel?selSay(S.stepSel):"";
 const cp=$('[data-sec="copy"]'),pa=$('[data-sec="paste"]'),c=$('[data-sec="clear"]');
 for(const b of [cp,pa,c])if(b)b.classList.toggle("onsel",sel&&!(b===c&&S.alt));
 if(cp)cp.title=sel?Modifiers.say(`Copy the selected steps, ${say} (⌘C)`):Modifiers.say("Copy (⌘C): Sequence, the selected track's page shown; Sound, the machine; Perform, the assign; Song, the row");
 if(pa)pa.title=sel?Modifiers.say(`Paste at the selected step, ${say} (⌘V)`):Modifiers.say("Paste (⌘V)");
 if(c&&!S.alt)c.title=sel?`Clear the selected steps, ${say} (Delete). Alt: the whole pattern`:"Clear: Sequence, the selected track's page shown (Alt: the whole pattern); Sound, the machine; Song, the row"}

/* ---- the page's copy of what it put on the core's clipboard (CLIP, 130-main.js): a block of rows, so a paste
   says at once where it lands and whether a row fits the track's kind; a block of one row is a page too ---- */
function clipOf(x){const rows=[];
 for(let t=x.t;t<x.t+x.n;t++){const tr=trk(t);rows.push({midi:isMidiT(t),steps:tr.steps.slice(x.from,x.to).map(v=>v&&JSON.parse(JSON.stringify(v))),slide:[...tr.slide].filter(s=>s>=x.from&&s<x.to).map(s=>s-x.from),
  locks:[...S.locks].filter(([k])=>+k.split("|")[0]===t).map(([k,m])=>[k.split("|")[1],[...m].filter(([s])=>s>=x.from&&s<x.to).map(([s,v])=>[s-x.from,v])])})}
 const r=rows[0];return x.n===1?{type:"page",midi:r.midi,steps:r.steps,slide:r.slide,locks:r.locks,length:x.to-x.from,rows}:{type:"block",length:x.to-x.from,rows}}
const clipSize=()=>CLIP&&CLIP.rows?{tracks:CLIP.rows.length,length:CLIP.length}:null;

/* ---- the operations (⌘C ⌘X ⌘V ⌘D Delete Enter, the drop, the step menu): each one undo step; the result's note says what was done ---- */
const selArgs=x=>({t:x.t,n:x.n,from:x.from,to:x.to});
function selCopy(){const x=selShown();if(!x)return false;CLIP=clipOf(x);edit("copySteps",selArgs(x));toast(`Copied ${selSay(x)}.`);return true}
function selCut(){const x=selShown();if(!x)return false;CLIP=clipOf(x);edit("copySteps",selArgs(x));edit("clearSteps",selArgs(x));toast(`Cut ${selSay(x)}.`);return true}
/* ⌘V at the selection: the copied block's first step on its first step and track */
function selPaste(){const x=S.stepSel;if(!x)return false;const size=clipSize();
 if(!size){toast(Modifiers.say("Copy some steps first: ⌘-click or ⌘-drag steps, then ⌘C."));return true}
 if(x.from>=S.len){toast(`Step ${x.from+1} is past the pattern's length (${S.len}).`);return true}
 const land=StepSel.landing(size,x.t,x.from,SEL_TRACKS,S.len);
 if(!CLIP.rows.slice(0,land.n).some((r,k)=>r.midi===isMidiT(x.t+k))){toast("Synth steps paste onto synth tracks, MIDI steps onto MIDI tracks.");return true}
 edit("pasteSteps",{t:x.t,from:x.from});setSel(land);return true}
/* the block copied within the pattern: at its own end (⌘D), or where a ⌘-drag of it lets go */
function selCopyTo(dt,at){const x=selShown();if(!x)return false;
 if(at>=S.len){toast(`No room: the pattern is ${S.len} steps.`);return true}
 edit("copyStepsTo",Object.assign(selArgs(x),{at,dt}));setSel(StepSel.landing({tracks:x.n,length:x.to-x.from},dt,at,SEL_TRACKS,S.len));return true}
function selDuplicate(){const x=selShown();return x?selCopyTo(x.t,x.to):false}
/* Delete / Clr / the step menu's Clear (I-037): the selected steps go (a NOTE OFF only when its own step is selected) and nothing is written; the earlier note runs on to the next trig or NOTE OFF, as on the machine */
function selClear(){const x=selShown();if(!x)return false;edit("clearSteps",selArgs(x));return true}
/* MM-201: the lane's parameter locked at its current value (the kit's) on every selected step of the lane's track that has a
   note (the machine: hold the TRIG key, click the knob, manual 1-57); one undo step */
function lockCurrent(){const t=S.sel,x=S.stepSel,pid=S.lane;
 if(!x||t<x.t||t>=x.t+x.n){toast(`Select steps of ${tLabel(t)} first (⌘-click or drag on the ruler), then click the lock.`);return}
 const v=getP(t,pid);if(v==null){toast(`${pidLabel(t,pid)} has no value on ${tLabel(t)}.`);return}
 const steps=[];for(let s=x.from;s<x.to&&s<S.len;s++){const st=trk(t).steps[s];if(st&&!st.off)steps.push(s)}
 if(!steps.length){toast("The selected steps have no notes: a step without a note cannot hold a lock.");return}
 commit();let n=0;for(const s of steps){if(!setLock(t,pid,s,v))break;edit("lock",{t,...pidArgs(pid),s,v});n++}commit();
 const[pg,i]=pid.split("."),m=meta(t,pg,+i);renderTop();renderLane();toast(`${pidLabel(t,pid)} locked at ${fmt(m,v)} on ${n} step${n>1?"s":""} · ${tLabel(t)}`)}
/* MM-083, MM-184, MM-203: the selected steps' locks go, their notes stay (the machine's CLEAR NOTE LOCKS, TRIG + PLAY) */
function selClearLocks(){const x=selShown();if(!x)return false;edit("clearStepLocks",selArgs(x));return true}
/* the selection moved (a drag of it): copied to step `at` of its tracks, then the steps it left cleared
   (no NOTE OFF written where it was: the earlier note runs on to the next trig or NOTE OFF, I-037); one undo step (the intents of one gesture) */
function selMoveTo(at){const x=selShown();if(!x)return false;const n=x.to-x.from;if(at===x.from)return true;
 if(at>=S.len){toast(`No room: the pattern is ${S.len} steps.`);return true}
 edit("copyStepsTo",Object.assign(selArgs(x),{at,dt:x.t}));
 const a=at>x.from?x.from:Math.max(x.from,at+n),b=at>x.from?Math.min(x.to,at):x.to;
 if(b>a){edit("clearSteps",{t:x.t,n:x.n,from:a,to:b})}
 setSel(StepSel.landing({tracks:x.n,length:n},x.t,at,SEL_TRACKS,S.len));toast(`Moved ${selSay(x)} to step ${at+1} (⌘Z undoes it).`);return true}
/* the selection's steps of each track as one steps intent (rows), after f changed the view's steps */
function selSteps(x,f){const rows=[];for(let t=x.t;t<x.t+x.n;t++){f(t,trk(t));rows.push(rangeRow(t,x.from,x.to))}edit("steps",{from:x.from,to:x.to,rows});renderTop();rerenderSeq()}
/* Enter, the step menu's Trig: a note on every empty selected step (the track's last pitch), or, when none is empty,
   every selected note off (a NOTE OFF stays) */
function selTrigs(){const x=selShown();if(!x)return false;let on=false;
 for(let t=x.t;t<x.t+x.n;t++)for(let s=x.from;s<x.to;s++)if(!trk(t).steps[s])on=true;
 selSteps(x,(t,tr)=>{for(let s=x.from;s<x.to;s++){const st=tr.steps[s];if(on){if(!st)tr.steps[s]=note(lastNote(t,s))}else if(st&&!st.off){tr.steps[s]=null;tr.slide.delete(s);clearStepLocks(t,s)}}});
 return true}
/* the step menu's marks (since 2026-10-12 the only place they are set; the roll shows them on the notes, 70-seq.js):
   NOTE OFF on every selected step (off again when each is one); a trigless trig on every selected step (an empty step
   gets one at the track's last pitch, a note loses its envelope trigs) or, when each is one, they go (with their locks);
   an envelope (AMP, FILTER, LFO: the trig tracks) on for every selected trig, off when each has it; a slide or swing on
   every selected step, off when each has it (the machine keeps both per step, trig or not: they do something on a trig) */
function selMark(kind){const x=selShown();if(!x)return false;const cells=[];
 for(let t=x.t;t<x.t+x.n;t++)for(let s=x.from;s<x.to;s++)cells.push([t,s,trk(t).steps[s]]);
 if(kind==="noteoff"){const on=cells.some(([,,st])=>!st?.off);selSteps(x,(t,tr)=>{for(let s=x.from;s<x.to;s++){tr.steps[s]=on?{off:1}:tr.steps[s]?.off?null:tr.steps[s];if(on){tr.slide.delete(s);clearStepLocks(t,s)}}});return true}
 if(kind==="trigless"){const syn=cells.filter(([t])=>!isMidiT(t));if(!syn.length){toast("A MIDI track has no trigless trigs (no envelopes).");return true}
  const on=syn.some(([,,st])=>stepKind(st)!=="trigless");
  selSteps(x,(t,tr)=>{if(isMidiT(t))return;for(let s=x.from;s<x.to;s++){const st=tr.steps[s];
   if(on){if(!st||st.off)tr.steps[s]={n:[lastNote(t,s)],a:0,f:0,l:0};else Object.assign(st,{a:0,f:0,l:0})}
   else if(stepKind(st)==="trigless"){tr.steps[s]=null;tr.slide.delete(s);clearStepLocks(t,s)}}});return true}
 /* B-152: a pitchless trig (the machine's EXIT held on a trig, manual 1-59): the trig and its envelope trigs, no note of
    its own (it plays the note before). On: a note loses its note (a trig with no envelope gets all three, else it would be
    nothing), an empty step or a NOTE OFF becomes one; off (when every trig of the range is pitchless; empty steps do not count): it gets the track's last pitch back */
 if(kind==="pitchless"){const syn=cells.filter(([t])=>!isMidiT(t));if(!syn.length){toast("A MIDI track has no pitchless trigs: its notes are its own.");return true}
  const trigs=syn.filter(([,,st])=>hasTrig(st)),on=!trigs.length||trigs.some(([,,st])=>!isPitchless(st));
  selSteps(x,(t,tr)=>{if(isMidiT(t))return;for(let s=x.from;s<x.to;s++){const st=tr.steps[s];
   if(on){if(!st||st.off)tr.steps[s]={a:1,f:1,l:1};else{delete st.n;delete st.notrig;if(!st.a&&!st.f&&!st.l)Object.assign(st,{a:1,f:1,l:1})}}
   else if(isPitchless(st))st.n=[lastNote(t,s)]}});return true}
 if(kind==="a"||kind==="f"||kind==="l"){const trigs=cells.filter(([t,,st])=>st&&!st.off&&!isMidiT(t));
  if(!trigs.length){toast("No synth trig there: the envelopes are a synth trig's.");return true}
  const on=trigs.some(([,,st])=>!st[kind]);selSteps(x,(t,tr)=>{for(const[nt,,st] of trigs)if(nt===t)st[kind]=on?1:0});return true}
 if(kind==="slide"||kind==="swing"){const set=t=>kind==="slide"?trk(t).slide:trk(t).swing,on=cells.some(([t,s])=>!set(t).has(s));
  for(const[t,s] of cells)if(set(t).has(s)!==on){on?set(t).add(s):set(t).delete(s);edit(kind==="slide"?"slide":"swingStep",{t,s,on})}
  commit();rerenderSeq();return true}
 return false}
/* what the step menu ticks: true when every selected step (of those it applies to) has the mark */
const hasTrig=st=>!!st&&!st.off&&!st.notrig,isPitchless=st=>hasTrig(st)&&!st.n;
function selHas(kind){const x=selShown();if(!x)return false;const c=[];for(let t=x.t;t<x.t+x.n;t++)for(let s=x.from;s<x.to;s++)c.push([t,s,trk(t).steps[s]]);
 if(kind==="noteoff")return c.every(([,,st])=>st?.off);
 if(kind==="trigless"){const y=c.filter(([t])=>!isMidiT(t));return y.length>0&&y.every(([,,st])=>stepKind(st)==="trigless")}
 if(kind==="pitchless"){const y=c.filter(([t,,st])=>!isMidiT(t)&&hasTrig(st));return y.length>0&&y.every(([,,st])=>isPitchless(st))}
 if(kind==="slide")return c.every(([t,s])=>trk(t).slide.has(s));
 if(kind==="swing")return c.every(([t,s])=>trk(t).swing.has(s));
 const y=c.filter(([t,,st])=>st&&!st.off&&!isMidiT(t));return y.length>0&&y.every(([,,st])=>!!st[kind])}
const selHasTrig=()=>{const x=selShown();if(!x)return false;for(let t=x.t;t<x.t+x.n;t++)for(let s=x.from;s<x.to;s++){const st=trk(t).steps[s];if(st&&!st.off&&!isMidiT(t))return true}return false};
/* the step menu's chord note: the pitch right-clicked in the roll joins the step's notes */
function selChord(t,s,pitch){const st=trk(t).steps[s];if(!st?.n||st.n.includes(pitch))return;st.n.push(pitch);editStep(t,s);rerenderSeq()}

/* ---- the pointer: the cell under it (a roll column, a trig row's step, the ruler's number), the gesture ---- */
function selCellOf(e){const el=document.elementFromPoint(e.clientX,e.clientY);if(!el)return null;
 const r=el.closest("#seq .ruler .rul[data-s]");if(r)return{t:S.sel,s:+r.dataset.s,ruler:true};
 const tc=el.closest("#seq .tlane [data-s]");if(tc)return{t:S.sel,s:+tc.dataset.s};
 const c=el.closest("#seq canvas.roll[data-big]");if(c&&+c.dataset.t===S.sel){const G=laneGeom(c);if(onKeys(c,G,e))return null;const h=laneHit(c,e);if(h)return{t:S.sel,s:h.cell,pitch:h.n}}
 return null}
let selDrag=null;
document.addEventListener("pointerdown",e=>{if(e.button!==0||S.ws!=="seq")return;
 const inSeq=!!e.target.closest?.("#seq"),c=inSeq?selCellOf(e):null;
 /* a press in the workspace outside the steps (the lock lane, the GEN bar, a dock) ends the selection; the top bar and the rail keep it */
 if(!c){if(!inSeq&&e.target.closest?.("#main"))clearSel();return}
 const d=StepSel.start({cmd:Modifiers.cmd(e),shift:e.shiftKey,alt:e.altKey,ctrl:e.ctrlKey},{t:c.t,s:c.s},!!c.ruler,S.stepSel,S.sel);
 /* a press that edits (a note, a chord note, an erase, a trig row's paint) ends the selection; Ctrl on a Mac is the step menu's */
  if(!d){if(!e.metaKey&&!e.ctrlKey)clearSel();return}
 if(S.rec){toast("Wait until live recording stops.");return}
 selDrag=d;e.preventDefault();e.stopPropagation()},true);
document.addEventListener("pointermove",e=>{const d=selDrag;if(!d)return;if(e.buttons===0&&e.pointerType==="mouse"){endSelect();return}
 const c=selCellOf(e);if(!c||c.s===d.at.s)return;
 selDrag=Object.assign({},d,{at:{t:d.at.t,s:c.s},moved:true});
 const w=StepSel.during(selDrag,S.stepSel,S.len,SEL_TRACKS);if(w.ghost)syncSel(w.ghost);else{S.stepSel=w.sel;syncSel()}});
function endSelect(){const d=selDrag;if(!d)return;selDrag=null;
 if(d.moved){const eat=e=>{e.stopPropagation();e.preventDefault()};addEventListener("click",eat,{capture:true,once:true});setTimeout(()=>removeEventListener("click",eat,true),0)}
 const r=StepSel.end(d,S.stepSel,S.len,SEL_TRACKS);
 if(r.drop){syncSel();selCopyTo(r.drop.t,r.drop.from);return}
 setSel(r.sel);toast(Modifiers.say(`Selected ${selSay(r.sel)} · ⌘C copy · ⌘X cut · ⌘V paste here · ⌘D duplicate · Delete (or Copy, Clr, Paste above) · right-click: more`))}
document.addEventListener("pointerup",endSelect);document.addEventListener("pointercancel",endSelect);addEventListener("blur",endSelect);

/* ---- moving it: ← → a step, ↑ ↓ a track of the side (the selected track follows a one-track selection), ⇧← ⇧→ longer ---- */
function selToPage(){const x=S.stepSel;if(!x||S.viewAll)return;const p=Math.floor(x.from/16);if(p!==S.page&&p<pages16()){S.page=p;render()}}
function selMove(dt,ds){const x=S.stepSel;if(!x)return;const base=x.t<6?0:6,y=StepSel.moved(Object.assign({},x,{t:x.t-base}),dt,ds,S.len,6);y.t+=base;
 setSel(y);if(x.n===1&&y.t!==S.sel)select(y.t);selToPage()}
function selGrow(ds){const x=S.stepSel;if(!x)return;setSel(StepSel.grown(x,ds,S.len))}

/* ===== the step menu (right-click a step in the roll; Ctrl-click on a Mac; the ⋯ key; the Menu key): every step and
   selection action with its key, the fill's home. On a selected step it acts on the selection, on another it selects
   that step first. The Monomachine's marks, ticked when every selected step has them: note on / off, NOTE OFF, a
   trigless trig, a pitchless trig, the envelopes a trig fires (AMP, FILTER, LFO), slide, swing, and in the roll a chord note at the
   pitch; Clear locks after Clear. ===== */
const keyOf=id=>StepSel.keyOf(Keys,id);
function stepMenuItems(t,s,pitch){const x=S.stepSel,st=trk(t).steps[s],one=StepSel.one(x),midi=isMidiT(t);
 const marks=[{id:"sel-trigs",label:one?(st&&!st.off?"Note off":"Note on"):"Notes on / off",key:keyOf("sel-trigs"),run:()=>selTrigs()},
  {id:"step-note-off",label:"NOTE OFF",key:"",checked:selHas("noteoff"),run:()=>selMark("noteoff")},
  ...(midi?[]:[{id:"step-trigless",label:"Trigless trig (locks only)",key:"",checked:selHas("trigless"),run:()=>selMark("trigless")},
   {id:"step-pitchless",label:"Pitchless trig (the note before)",key:"",checked:selHas("pitchless"),run:()=>selMark("pitchless")},
   {id:"step-env",label:"Envelopes",items:[["a","Amp"],["f","Filter"],["l","LFO"]].map(([k,n])=>({id:"step-env-"+k,label:n,key:"",checked:selHas(k),enabled:selHasTrig(),run:()=>selMark(k)}))}]),
  {id:"step-slide",label:"Slide",key:"",checked:selHas("slide"),run:()=>selMark("slide")},
  {id:"step-swing",label:"Swing",key:"",checked:selHas("swing"),run:()=>selMark("swing")},
  ...(one&&pitch!=null&&st?.n&&!st.n.includes(pitch)?[{id:"step-chord",label:`Chord note ${noteName(pitch)}`,key:keyOf("roll-chord"),run:()=>selChord(t,s,pitch)}]:[])];
 const items=StepSel.menuItems({marks,copy:()=>selCopy(),cut:()=>selCut(),paste:()=>selPaste(),canPaste:!!clipSize(),duplicate:()=>selDuplicate(),clear:()=>selClear(),
  fill:n=>fillEvery(t,s,n,pitch??lastNote(t,s)),key:keyOf});
 /* MM-083: right after Clear, the locks alone */
 const at=items.findIndex(x=>x&&x.id==="delete");items.splice(at+1,0,{id:"clear-step-locks",label:"Clear locks (keep the notes)",key:"",run:()=>selClearLocks()});
 return items}
function stepMenu(t,s,pitch,x,y){if(!inSel(t,s))setSel({t,n:1,from:s,to:s+1});
 DeskMenu.open(stepMenuItems(t,s,pitch),x,y,{title:StepSel.menuTitle(S.stepSel,t,s,selName)})}
/* the step menu's visible key: ⋯ on the selection's last step shown, over the ruler (shared/deskSelect.js moreKey) */
StepSel.moreKey({active:()=>S.ws==="seq"&&!!S.stepSel&&!S.rec,cells:()=>document.querySelectorAll("#seq .ruler .rul.selx"),clip:()=>document.getElementById("seqscroll"),
 open:(x,y)=>{if(S.stepSel)stepMenu(S.stepSel.t,S.stepSel.from,undefined,x,y)}});
document.addEventListener("contextmenu",e=>{if(S.ws!=="seq"||!e.target.closest?.("#seq"))return;const c=selCellOf(e);if(!c||c.ruler)return;
 e.preventDefault();if(S.rec){toast("Wait until live recording stops.");return}stepMenu(c.t,c.s,c.pitch,e.clientX,e.clientY)});

/* ---- the keys: both editors' (StepSel.bind); on Sequence while there is a selection, no dialog, and no other control has the focus ---- */
const selKeys=()=>seqKeys()&&!!S.stepSel&&!stepOn()&&!document.activeElement?.closest?.("button:not(.tc),[role=button],[role=tab],[data-g],[data-gv],[role=slider],input,select,textarea");
StepSel.bind(Keys,{seqKeys:()=>seqKeys(),has:()=>!!S.stepSel,selKeys,cut:selCut,duplicate:selDuplicate,trigs:selTrigs,deselect:clearSel,deselectWhen:()=>!S.marks.size&&!stepOn(),
 selectAll:()=>{const t=side()[0];setSel({t,n:6,from:0,to:S.len});toast(Modifiers.say(`Selected ${selSay(S.stepSel)} · ⌘C copy · Delete clear · Esc`))},
 move:ds=>selMove(0,ds),grow:selGrow,area:"Roll",
 does:{"select-all":"Select every step of the six tracks shown (synth or MIDI) up to the length (then ⌘C copies them as a block)",
  "sel-trigs":"A note on each empty selected step, or, when none is empty, the selected notes off (one undo step)",
  "step-select":"Click (roll or trig rows): select the step (⌘V pastes there). Drag: select steps. Drag the selection: a copy where you let go",
  "step-extend":"Click: extend the selection to the step (on another track's roll: the tracks between too)",
  "ruler-select":"Click or drag: select steps of the selected track; ⇧-click extends",
  "step-menu":"The step menu: note on / off, NOTE OFF, a trigless trig, the envelopes a trig fires (Amp, Filter, LFO), slide, swing, a chord note (roll), copy, cut, paste here, duplicate, clear, fill every 2nd / 4th from it; on a selected step for the whole selection (Ctrl-click on a Mac)"}});
