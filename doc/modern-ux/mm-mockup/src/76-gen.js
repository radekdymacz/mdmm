
/* ===== GEN and MUTATE on the page (MM-PORT-PLAN.md d, the Machinedrum Editor's DESIGN-generators.md §5) =====
   The GEN bar, always under the piano roll on Sequence (it holds the PAGE control too), and the MUTATE bar, always
   over the Sound pages. Both are live: a change writes at once. A run of changes in one context (the workspace,
   the selected track, the pattern or the kit) is one gesture, one undo step: the commits after each click wait
   (genHeld, like rotate's rotHold) until the run ends, on another context, any other edit, undo or redo. Each change
   generates from the run's base, the pattern before it, so a value moved back gives its steps back. The results
   come from the pure functions (skins/shared/deskGen.js, 52-gen.js); here they become the view's own state, and
   GEN's are the steps intent of the tracks it wrote (their steps, slides and locks over the range, so a value moved
   back gives its steps back); MUTATE's are the params intent of the values it moved. Alt is the global "all": Alt + a GEN change
   every track of the side shown over the whole pattern, Alt+R every track (Sound: every synth track). ===== */
S.gen={specs:null,last:[],m:[],run:null,session:null,kept:new Set()};
S.mut={amount:20,seed:genSeed(),scope:new Set(["SYN"]),trial:null,note:""};
S.genOwn=false;
const genKey=()=>`${S.ws}:${S.sel}:${S.pat}`,mutKey=()=>`${S.ws}:${S.sel}:${S.kit}`;
function genInfo(t){const tr=trk(t);return{m:tr.m,notes:tr.steps.slice(0,S.len).flatMap(x=>x&&!x.off&&x.n||[]),key:tr.tr?.KEY|0,scale:tr.tr?.SCALE|0}}
/* every track's spec: from its role the first time, again when its machine changed and the spec was never edited */
function genSpecs(fill){const len=S.len||64;
 if(!S.gen.specs||fill){S.gen.specs=[];S.gen.last=[];S.gen.m=[]}
 for(let t=0;t<12;t++){const m=trk(t).m;if(!S.gen.specs[t]||(S.gen.m[t]!==m&&!S.gen.last[t]?.edited)){S.gen.specs[t]=mmGenDefault(genInfo(t),len,isMidiT(t));S.gen.m[t]=m;S.gen.last[t]={}}
  S.gen.specs[t]=genFit(S.gen.specs[t],len)}	/* STEPS never longer than the pattern, also when it got shorter */
 return S.gen.specs}
function genSpec(t=S.sel){return genSpecs()[t]}
const genEdited=(t=S.sel)=>{S.gen.last[t].edited=true};
/* the range a generator writes: the steps shown, Alt the whole pattern */
function genRange(all){const[a,b]=vis();return all?[0,S.len]:[a,Math.min(b,S.len)]}
/* a run or a trial with changes in the context shown holds the commits: one undo step */
function genHeld(){return !!(S.gen&&((S.gen.run?.applied&&S.gen.run.key===genKey())||(S.mut.trial?.applied&&S.mut.trial.key===mutKey())))}
/* the run or the trial ends: its gesture closes (the next edit is a new undo step) */
function genEnd(){if(!S.gen)return;const r=S.gen.run,m=S.mut.trial,live=(r&&r.applied)||(m&&m.applied);S.gen.run=null;S.mut.trial=null;S.mut.note="";if(!live)return;
 S.genEnding=true;try{if(HOST.commit)HOST.commit()}finally{S.genEnding=false}}
function genStale(){if(S.gen&&((S.gen.run&&S.gen.run.key!==genKey())||(S.mut.trial&&S.mut.trial.key!==mutKey())))genEnd()}
/* a run's base: every track's steps, slides and locks before the run */
function genBase(){return[...Array(12).keys()].map(t=>{const tr=trk(t);return{steps:tr.steps.map(x=>x&&JSON.parse(JSON.stringify(x))),slide:new Set(tr.slide),
 locks:[...S.locks].filter(([k])=>+k.split("|")[0]===t).map(([k,m])=>[k.split("|")[1],new Map(m)])}})}
function genStart(key){if(S.gen.run&&S.gen.run.key===key)return;genEnd();commit()}
/* one track over [from, to): back to the run's base there, then the generated steps; the trigs it turns off lose
   their locks and slides. False: the track is set to keep (and nothing of a run to give back). */
function genWrite(t,from,to,run){const b=run.base[t],tr=trk(t),r=mmGenSteps(genSpec(t),t,from,to,b.steps,S.len,isMidiT(t));
 if(!r&&!run.applied)return false;
 for(let s=from;s<to;s++){tr.steps[s]=b.steps[s]&&JSON.parse(JSON.stringify(b.steps[s]));b.slide.has(s)?tr.slide.add(s):tr.slide.delete(s);clearStepLocks(t,s);for(const[pid,m] of b.locks)if(m.has(s))setLock(t,pid,s,m.get(s),true)}
 if(!r)return true;
 for(const[s,st] of r.steps)tr.steps[s]=st;
 for(const s of r.gone){clearStepLocks(t,s);tr.slide.delete(s)}
 return true}
/* Live: every change of a GEN control writes at once (all: every track of the side shown, the whole pattern) */
function genLive(all=S.alt){
 if(S.rec){toast("The generators wait while the machine records live.");return false}
 genStale();genStart(genKey());
 const run=genRunFor(S.gen.run,genKey(),genBase,()=>0),[from,to]=genRange(all),wrote=[];
 for(const t of all?side().filter(t=>!genKept(t)):[S.sel])if(genWrite(t,from,to,run))wrote.push(t);
 if(!wrote.length){toast(all?"Every track is set to keep: nothing to generate.":`${tLabel(S.sel)} has no generator.`);genDraw();return false}
 S.gen.run=run;run.applied++;if(run.applied===1&&S.gen.session)S.gen.session.n++;
 S.genOwn=true;try{edit("steps",{from,to,rows:wrote.map(t=>rangeRow(t,from,to,true))})}finally{S.genOwn=false}
 autoRange(S.sel);if(S.ws==="seq")rerenderSeq();else renderTop();
 return true}
/* the result of a track's spec for the summary: its trigs over the range from the run's base (or now) */
function genPreview(t,from,to){const run=S.gen.run&&S.gen.run.key===genKey()?S.gen.run:null,base=run?run.base[t].steps:trk(t).steps;
 return{run,base,r:mmGenSteps(genSpec(t),t,from,to,base,S.len,isMidiT(t))}}
/* Defaults (↺): this track's values (Alt: every track of the side) from its machine; the track follows, as with any change */
function genDefaults(){genSpecs();const len=S.len||64;for(const t of S.alt?side().filter(t=>!genKept(t)):[S.sel]){S.gen.specs[t]=mmGenDefault(genInfo(t),len,isMidiT(t));S.gen.m[t]=trk(t).m;S.gen.last[t]={edited:true}}
 genRealise(S.sel);
 toast(S.alt?"Every track's values from its machine.":"This track's values from its machine.");genLive()}
/* a new variation: a new seed (random, the notes), random hits and rotation in the cycle (euclid); keep stays */
function genVary(t){const sp=genSpec(t),r=n=>Math.floor(Math.random()*n);if(sp.kind==="keep")return false;
 sp.seed=genSeed();if(sp.kind==="euclid"){sp.k=1+r(sp.n);sp.rot=r(sp.n)}S.gen.last[t].edited=true;return true}
function genAgain(all=false){const ts=all?side().filter(t=>!genKept(t)):[S.sel],varied=ts.filter(genVary).length;
 if(!varied){toast(all?"Every track is set to keep: nothing to randomise.":`${tLabel(S.sel)} is set to keep: nothing to randomise.`);return}
 if(genLive(all)&&S.ws!=="seq")toast(all?"GEN: a new variation of every track.":`GEN: a new variation of ${tLabel(S.sel)}.`)}
/* the one randomise action (R; Alt+R or Alt-click on the R key: all), by workspace */
function randomise(all){if(S.ws==="sound")mutAgain(all);else genAgain(all)}
function genKind(kind){const t=S.sel,sp=genSpec(t),last=S.gen.last[t];if(sp.kind===kind)return;last[sp.kind]=sp;last.edited=true;
 const notes=sp.notes&&JSON.parse(JSON.stringify(sp.notes)),seed=sp.seed||genSeed();
 S.gen.specs[t]=genFit(last[kind],S.len||64)||(kind==="euclid"?{kind,k:4,n:Math.min(16,S.len||64),rot:0,seed,notes}:kind==="random"?{kind,density:25,seed,mode:"replace",notes}:{kind,notes});
 genLive()}
const genCycle=(list,cur,d)=>list[((list.indexOf(cur)+(d>0?1:-1))%list.length+list.length)%list.length];
/* a value of a bar moved by d (wheel, arrows, click, drag), in the spec's own ranges */
function genVal(k,d){const lim=(v,a,b)=>Math.max(a,Math.min(b,v));
 if(k==="amt"){S.mut.amount=lim(S.mut.amount+d,0,100);mutLive();renderMutStrip();return}
 const sp=genSpec(),n=sp.notes;genEdited();
 if(k==="k")sp.k=lim(sp.k+d,0,sp.n);
 if(k==="n"){sp.n=lim(sp.n+d,1,Math.min(64,S.len||64));sp.k=Math.min(sp.k,sp.n);sp.rot=Math.min(sp.rot,sp.n-1)}
 if(k==="rot")sp.rot=((sp.rot+d)%sp.n+sp.n)%sp.n;
 if(k==="dens")sp.density=lim(sp.density+d,0,100);
 if(k==="seed")sp.seed=((sp.seed-1+d)%99999+99999)%99999+1;
 if(n){if(k==="nmot")n.motion=genCycle(n.motion==="kit"||trk(S.sel).m==="DPRO-BBOX"?["off","kit"]:["off","step","leap"],n.motion,d);
  if(n.motion!=="kit"&&n.motion!=="off"&&n.root==null){const i=genInfo(S.sel),x=mmGenDefault({...i,m:"SWAVE-SAW"},S.len);Object.assign(n,x.notes)}
  if(k==="nroot")n.root=lim(n.root+d,0,127-12*n.range);
  if(k==="nscale")n.scale=genCycle(MM_SCALES,n.scale,d);
  if(k==="nrange"){n.range=lim(n.range+(d>0?1:-1),1,2);n.root=Math.min(n.root,127-12*n.range)}}
 genLive()}
/* The bars' pieces (gbg, gv, kc, randKey, gtitle, gseg) and their clicks, wheel and arrows: shared/deskGenBar.js,
   the Machinedrum Editor's. */
function genNotesHtml(sp,t,bare){const n=sp.notes;if(!n||sp.kind==="keep"||isMidiT(t))return"";const kit=n.motion==="kit"||trk(t).m==="DPRO-BBOX";
 const mot=gv("nmot",bare?"Motion":"Notes",n.motion==="off"?"off":n.motion,kit?"Off: the steps keep their drums (a new one takes the last). KIT: each hit picks BD1, SD1, CH or OH":"Off: the steps keep their pitch (a new one takes the track's last note). STEP: a walk of 1 or 2 scale degrees from the root. LEAP: any note of the range");
 const seed=sp.kind==="euclid"&&n.motion!=="off"?gv("seed","Seed",sp.seed,"The same seed gives the same notes"):"";
 const wrap=(body,tip)=>bare?body:gbg("Notes",body,"gnotes",tip);
 if(n.motion==="off"||n.motion==="kit")return wrap(mot+seed,"The rhythm decides when, the notes what: they go to the hits the rhythm writes");
 return wrap(mot+gv("nroot","Root",noteName(n.root),"The lowest note: the scale's root at its octave (the track's KEY when its SCALE is MAJ or MIN)")+gv("nscale","Scale",n.scale==="DORIAN"?"DOR":n.scale,"MAJ, MIN, PENT (minor pentatonic) or DORIAN")
  +gv("nrange","Range",n.range+" oct","One or two octaves from the root")+seed,"The rhythm decides when, the notes what: they go to the hits the rhythm writes (every hit; in ADD the new ones, in THIN none)")}
/* the step gestures behind a small ? key (a click: the list of keys) */
function stepLegend(){const midi=isMidiT(S.sel),row=(cls,what,how)=>`<span>${cls!=null?`<i class="lg on ${cls}"></i>`:`<i class="lg none"></i>`}<b>${what}</b>${how}</span>`;
 return`<span class="steplegend"><button class="glegkey" id="steplegend" aria-label="Step gestures" aria-describedby="steplegpop">?</button><span class="legend glegpop" id="steplegpop" role="tooltip">${row("","Note","click in the roll; drag up or down for pitch, sideways to paint (alt: erase)")}${midi?"":row("g","Trigless","no envelope trigs (the ENV row)")}${row("y","Note off","alt-click an empty step")}${row("lk","Has locks","a lock on the step")}${row(null,"Fill","⌘-click: every 2nd step from there to the end gets the note (from a note: off); ⌘⇧-click: every 4th")}${S.dock==="arp"&&!midi?row(null,"Arp",dockHelp(S.sel,"arp")[1]):""}<small>? the list of keys</small></span></span>`}
/* the bar under the roll: the step legend, the roll's keys, the page keys (the lane toolbox is on the lock lane's header row, 70-seq.js) */
function genBarHtml(){return`<div class="genbar">${rollKeysHtml()}${stepLegend()}<i class="gdiv"></i>${pageKeys()}</div>`}
/* ===== The GEN dialog (Radek, 2026-10-14; the Machinedrum Editor's mdDeskGenUi.js has the same one). Opened by the dice key of a track
   in the rail; it fills that track. One session: opening it starts one, DONE (Enter) keeps what it wrote, CANCEL (Esc) takes it back
   (Undo, once for each run the session made: a run is one undo step, and the session has one run for each track it was on). The
   piano roll is not covered: the modal layer puts the dialog under it and draws no backdrop, so the roll shows the result live;
   another track's dice key moves the dialog to that track, any other click outside is refused. The head drags it (shared/deskModal.js
   `drag`; the place is kept for the session). The bars' pieces (gbg, gv) and the values' clicks, keys and wheel: shared/deskGenBar.js. ===== */
const genDlgOpen=()=>{const p=$("#genpop");return!!p&&!p.hidden};
function openGen(t){if(S.ws!=="seq"||!trk(t))return;
 if(S.rec){toast("The generators wait while the machine records live.");return}
 const was=genDlgOpen();if(!was){genEnd();S.gen.session={n:0}}
 if(t!==S.sel)select(t);else if(!was)render();
 genSpecs();genRealise(S.sel);genDraw(true);const pop=$("#genpop");pop.hidden=false;
 if(typeof Modal!=="undefined"&&Modal.place)Modal.place("genpop");
 if(!was)pop.querySelector(".gv")?.focus({preventScroll:true})}
/* where the dialog opens (shared/deskModal.js `place`): centred in the window, over the grid (right of the track list, which stays in reach) */
function placeGen(el){const rail=$("#rail"),l=rail?rail.getBoundingClientRect().right:0,h=el.offsetHeight,w=el.offsetWidth;
 return{left:l+(innerWidth-l-w)/2,top:(innerHeight-h)/2}}
/* done: keep what the session wrote; otherwise (Esc, Cancel): Undo it, once for each run it made */
function closeGen(done){const pop=$("#genpop");if(!pop||pop.hidden)return;
 const n=done===true?0:(S.gen.session?S.gen.session.n:0);pop.hidden=true;genEnd();S.gen.session=null;
 for(let i=0;i<n;i++)undo();
 if(n)toast("GEN cancelled: the track is back as it was.")}
/* another track's key, or ↑ / ↓: the dialog goes to that track, the session goes on */
function genSwitch(t){if(t>=0&&t<12&&trk(t)&&t!==S.sel&&side().includes(t))openGen(t)}
/* the dialog's content again (only while it is open, or to fill it before it opens); the focus stays on the same control */
function genDraw(fill){const pop=$("#genpop");if(!pop||(pop.hidden&&!fill))return;
 const act=pop.contains(document.activeElement)?document.activeElement:null,ref=act&&["data-gv","data-genkind","data-genmode","data-rand","data-gen","data-genclose","data-gencancel","data-genkeep"].find(a=>act.hasAttribute(a)),key=ref?`[${ref}="${act.getAttribute(ref)}"]`:null;
 pop.innerHTML=genDialogHtml();if(key)pop.querySelector(key)?.focus({preventScroll:true})}
/* a click on a track's number or name (the modal layer lets it through): the dialog follows the track, the page's own select is not run twice */
document.addEventListener("click",e=>{const th=genDlgOpen()&&e.target.closest(".th[data-sel] .n,.th[data-sel] .nm,.th[data-sel] .sw");if(!th)return;e.stopPropagation();genSwitch(+th.closest("[data-sel]").dataset.sel)},true);
document.addEventListener("click",e=>{
 const o=e.target.closest("[data-genopen]");if(o){genDlgOpen()?genSwitch(+o.dataset.genopen):openGen(+o.dataset.genopen);return}
 if(e.target.closest("[data-genclose]")){closeGen(true);return}
 if(e.target.closest("[data-gencancel]")){closeGen(false);return}
 const kp=e.target.closest("[data-genkeep]");if(kp)genKeep(kp.checked)});
/* Enter anywhere in the dialog but on a key (a value box too: type a value with ⌘-click): Done; ↑ / ↓ off a value box: the previous / next track of the side */
document.addEventListener("keydown",e=>{
 if(!genDlgOpen()||!e.target.closest?.("#genpop")||e.metaKey||e.ctrlKey||e.altKey)return;
 if(e.key==="Enter"&&!e.target.closest("button")){e.preventDefault();e.stopPropagation();closeGen(true)}
 else if((e.key==="ArrowUp"||e.key==="ArrowDown")&&!e.target.closest(".gv")){e.preventDefault();e.stopPropagation();genSwitch(S.sel+(e.key==="ArrowDown"?1:-1))}},true);
/* KEEP: only "⌥R all (and every all-tracks run) skips this track". It switches nothing off in the dialog: the mode, the boxes, R and Defaults
   still write this track. A track whose machine has no generator (FX, GND: a Keep spec) counts as kept; the dialog gives it the generator it would
   have (genRealise) the moment it opens, and the track stays marked kept. The marker is a lock on the track's dice key and next to the title. */
const genKept=t=>S.gen.kept.has(t),genIsKept=t=>genKept(t)||genSpec(t).kind==="keep";
function genRealise(t){if(genSpec(t).kind!=="keep")return;S.gen.kept.add(t);S.gen.specs[t]=genShown(t)}
function genKeepT(t,on){if(on)S.gen.kept.add(t);else{S.gen.kept.delete(t);if(genSpec(t).kind==="keep")S.gen.specs[t]=genShown(t)}render();genDraw();toast(on?`${tLabel(t)} kept: ⌥R all skips it.`:`${tLabel(t)} is no longer kept.`)}
function genKeep(on){genKeepT(S.sel,on)}
/* ⌘-click (Ctrl off a Mac) on a track's dice key: Keep on or off for that track, the dialog not opened. Keep is a setting of the generators, not of the pattern: no undo step */
document.addEventListener("click",e=>{const o=e.target.closest?.("[data-genopen]");if(!o||!Modifiers.cmd(e))return;e.stopPropagation();e.preventDefault();const t=+o.dataset.genopen;genKeepT(t,!genIsKept(t))},true);
/* the spec the dialog's boxes show: the track's own, or while it is kept the generator it will come back to */
function genShown(t){const sp=genSpec(t);if(sp.kind!=="keep")return sp;const l=S.gen.last[t]||{},len=S.len||64,d=mmGenDefault(genInfo(t),len,isMidiT(t));
 return genFit(l[l.was],len)||(d.kind!=="keep"?d:{kind:"euclid",k:4,n:Math.min(16,len),rot:0,seed:genSeed(),notes:d.notes})}
/* What a value box says, may hold and does by default (type a value: ⌘-click, shared/deskValueEdit.js; double-click: its default) */
const genBoxList=k=>{const sp=genSpec(),n=sp.notes;return k==="nscale"?MM_SCALES:k==="nmot"?(n&&(n.motion==="kit"||trk(S.sel).m==="DPRO-BBOX")?["off","kit"]:["off","step","leap"]):null};
const GenBox={
 range(el){const k=el.dataset.gv,sp=genSpec(),n=sp.notes,l=genBoxList(k);if(l)return[0,l.length-1];return{k:[0,sp.n],n:[1,Math.min(64,S.len||64)],rot:[0,Math.max(0,sp.n-1)],dens:[0,100],seed:[1,99999],nroot:[0,127-12*(n?n.range:1)],nrange:[1,2]}[k]},
 shown(el,v){const k=el.dataset.gv,l=genBoxList(k);if(l)return String(l[v]);return k==="nroot"?[noteName(v),String(v)]:k==="dens"?[v+"%",String(v)]:k==="nrange"?[v+" oct",String(v)]:String(v)},
 get(el){const k=el.dataset.gv,sp=genSpec(),n=sp.notes,l=genBoxList(k);if(l)return Math.max(0,l.indexOf(k==="nmot"?n.motion:n.scale));return{k:sp.k,n:sp.n,rot:sp.rot,dens:sp.density,seed:sp.seed,nroot:n&&n.root,nrange:n&&n.range}[k]},
 set(el,v){const k=el.dataset.gv,l=genBoxList(k);if(l){for(let i=0;i<l.length&&GenBox.get(el)!==v;i++)genVal(k,1);return}genVal(k,v-GenBox.get(el))},
 find:el=>$(`#genpop [data-gv="${el.dataset.gv}"]`),say:t=>toast(t),
 def(k){const t=S.sel,d=mmGenDefault(genInfo(t),S.len||64,isMidiT(t));return{k:d.k,n:d.n,rot:d.rot||0,dens:25,seed:genSeed(),nroot:d.notes&&d.notes.root,nrange:d.notes&&d.notes.range}[k]}};
document.addEventListener("pointerdown",e=>{const el=e.target.closest("#genpop .gv[data-gv]");if(el&&ValueEdit.isOpenClick(e)){e.preventDefault();e.stopPropagation();ValueEdit.open(el,GenBox)}},true);
document.addEventListener("dblclick",e=>{const el=e.target.closest("#genpop .gv[data-gv]");if(!el||ValueEdit.isOpenClick(e))return;
 const v=GenBox.def(el.dataset.gv),r=GenBox.range(el);if(v==null||!r)return;GenBox.set(el,Math.max(r[0],Math.min(r[1],v)))});
/* The dialog (compact, one size in every mode): the head (the drag handle), MODE, the mode's values in an area of fixed height (the rhythm's groups, then NOTES
   on a synth track), the KEEP switch, then the footer: the summary at the left, R and Defaults, Cancel and Done at the right. */
function genDialogHtml(){const sp=genShown(S.sel),t=S.sel,tr=trk(t),all=S.alt,kept=genIsKept(t),[from,to]=genRange(all),{run,base,r}=genPreview(t,from,to);
 const sc=(attr,cur,items,tips,label)=>`<span class="gsc" role="radiogroup" aria-label="${label}">${items.map(([k,n])=>`<button ${attr}="${k}" role="radio" aria-checked="${cur===k}" aria-pressed="${cur===k}" title="${tips[k]}">${n}</button>`).join("")}</span>`;
 const mode=sc("data-genkind",sp.kind,[["euclid","Euclid"],["random","Random"]],{euclid:"k hits spread evenly over n steps, rotated",random:"each step on by chance, from a seed"},"Mode");
 const write=sc("data-genmode",sp.mode,[["replace","Replace"],["add","Add"],["thin","Thin"]],{replace:"the track becomes the result",add:"only steps that are off may turn on",thin:"only steps that are on may turn off"},"Write");
 const rhythm=sp.kind==="euclid"?gv("k","Hits",sp.k,"How many hits in a cycle")+gv("n","Steps",sp.n,"The cycle's length in steps, at most the pattern's; it repeats over the pattern")+gv("rot","Rotate",sp.rot,"Moves the hits later")
  :gv("dens","Density",sp.density+"%","The chance of each step")+gv("seed","Seed",sp.seed,"The same seed gives the same steps")+write;
 const notes=genNotesHtml(sp,t,true)||`<span class="gnone">${isMidiT(t)?"A MIDI track has no notes of its own":"No notes"}</span>`;
 let sum="";
 {const on=r.steps.filter(([,st])=>mmTrig(st)).length,b=[];for(let s=from;s<to;s++)if(mmTrig(base[s]))b.push(s);const now=new Set(r.steps.filter(([,st])=>mmTrig(st)).map(([s])=>s));
  const add=[...now].filter(s=>!mmTrig(base[s])).length,gone=b.filter(s=>!now.has(s)).length;
  sum=all?`every track · steps ${from+1}–${to}`:`${sp.kind==="euclid"?genSummary(sp,S.len)+" · ":""}${on} on${run&&(add||gone)?` <em>+${add} −${gone}</em>`:""} · steps ${from+1}–${to}`}
 const target=all?`all ${isMidiT(t)?"MIDI":"synth"} tracks`:`${tLabel(t)} · ${isMidiT(t)?"CH"+String(tr.ch).padStart(2,"0"):tr.m.replace("SWAVE-","SW-")}`;
 const lock=kept?`<svg class="gdlock" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" aria-label="Kept"><title>Kept: ⌥R all leaves this track alone</title><rect x="3" y="7" width="10" height="7" rx="1.5"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/></svg>`:"";
 return`<div class="gdlg${kept?" kept":""}">
  <div class="gdhead" data-drag title="Drag to move this window; double-click: back to the middle"><b>Gen</b><span class="gdt ${all?"all":""}">${target}</span>${lock}<button class="gdesc" data-gencancel="1" aria-label="Close" title="Close (Esc): same as Cancel">ESC</button></div>
  <div class="gdrow"><span class="gdl">Mode</span><div class="gvs">${mode}</div></div>
  <div class="gdrow"><span class="gdl">Rhythm</span><div class="gvs">${rhythm}</div></div>
  <div class="gdrow"><span class="gdl">Notes</span><div class="gvs">${notes}</div></div>
  <div class="gdsum" title="${plainText(sum)}">${sum}</div>
  <div class="gdfoot"><label class="gdkeep" title="Keep this track: ⌥R all (and every all-tracks change) leaves it alone. This window still writes it"><input type="checkbox" data-genkeep="1" ${kept?"checked":""}><span>Keep on ⌥R all</span></label>
   <button class="gdkey cream" data-rand="1" aria-label="Randomise" title="Randomise ${tLabel(t)} (R): a new variation, ${sp.kind==="random"?"a new seed":"random hits and rotation in the cycle"}. ⌥R or Alt-click: every track of the side">R</button>
   <button class="gdkey" data-gen="fill" aria-label="Defaults" title="Defaults: this track's values from its machine (Alt: every track of the side). The track follows, as with any change">↺</button>
   <div class="gdbtns"><button class="gdcancel" data-gencancel="1" title="Cancel (Esc): every track this window wrote goes back as it was">Cancel</button><button class="gdone" data-genclose="1" title="Done (Enter): keep what it wrote. One Undo takes a run back">Done</button></div></div>
</div>`}
/* ---- MUTATE ---- */
const MUT_SCOPES=[["SYN","Syn","the machine's SYNTHESIS page (an FX machine's INP stays)"],["AMP","Amp","the AMP page (VOL stays)"],["FLT","Flt","the FILTER page"],["EFX","Efx","the EFFECTS page"],["LFO","Lfo","the three LFOs (their PAGE and DEST stay: where an LFO goes is routing)"]];
/* the groups in the scope (a group's title on the Sound page, "SYN:unison", "LF2:lfo"): their knobs on each
   track, by that track's machine (a machine without the group gives none) */
function mutGroupKnobs(tracks,base){const keys=[...S.mut.scope].filter(x=>x.includes(":")),out={};if(!keys.length)return out;
 for(const t of tracks){const g=mmSoundGroups(base[t].m);if(!g)continue;const list=[];
  for(const id of keys){const[pg,key]=id.split(":");if(/^LF\d$/.test(pg)){[2,3,4,5,6,7].forEach(i=>list.push([pg,i]));continue}const x=(g[pg]||[]).find(y=>y.key===key);if(x)x.idx.forEach(i=>list.push([pg,i]))}
  out[t]=list}
 return out}
function mutInfo(t,pg,i){const name=pnames(t,pg)?.[i];return name?{name,max:maxOf(meta(t,pg,i))}:null}
/* one apply of the trial: always from its base (R gives a fresh random sound, it never walks away), one gesture */
function mutApply(all){
 if(!all&&isMidiT(S.sel)){toast("MUTATE moves the synth tracks' sounds: a MIDI track's page is not a sound (Alt+R: every synth track).");return}
 if(!S.mut.scope.size){toast("Pick what to move: SYN, AMP, FLT, EFX or LFO, or a group's title.");return}
 genStale();let tr=S.mut.trial;
 if(!tr||tr.key!==mutKey()){genStart(mutKey());S.mut.seed=genSeed();tr=S.mut.trial={key:mutKey(),base:S.tracks.map(x=>({m:x.m,v:JSON.parse(JSON.stringify(x.v))})),touched:new Set(),all:false,applied:0}}
 tr.all=all;const tracks=all?[0,1,2,3,4,5]:[S.sel];
 const spec={tracks,pages:[...S.mut.scope].filter(x=>!x.includes(":")),extra:mutGroupKnobs(tracks,tr.base),amount:S.mut.amount,seed:S.mut.seed,protect:["VOL","TUNE"]};
 const values=mmMutate(spec,tr.base,mutInfo),now=new Set(values.map(([t,pg,i])=>t+":"+pg+":"+i));
 /* what an earlier apply moved and this one does not goes back to the base */
 for(const k of tr.touched)if(!now.has(k)){const[t,pg,i]=k.split(":");values.push([+t,pg,+i,tr.base[+t].v[pg][+i]])}
 if(!values.length){toast("Nothing to move here: no knobs in that scope.");return}
 for(const[t,pg,i,v] of values){S.tracks[t].v[pg][i]=v;const k=t+":"+pg+":"+i;v!==tr.base[t].v[pg][i]?tr.touched.add(k):tr.touched.delete(k)}
 S.genOwn=true;try{edit("params",{values:values.map(([t,pg,i,v])=>[t,PAGES.indexOf(pg),i,v])})}finally{S.genOwn=false}
 tr.applied++;
 const moved=new Set(values.map(([t])=>t)).size;S.mut.note=`seed ${S.mut.seed} · ${moved} track${moved===1?"":"s"}, ${values.length} values`;
 if(S.ws==="sound")render();else{renderTop();toast(`MUTATE: ${all?"every synth track":tLabel(S.sel)}, ${S.mut.note}.`)}}
/* amount or scope moved during a trial: heard at once, the same seed */
function mutLive(){if(S.mut.trial&&S.mut.trial.key===mutKey()&&S.mut.trial.applied)mutApply(S.mut.trial.all)}
/* R on Sound: a fresh random sound (a new seed) from the trial's base; all: every synth track */
function mutAgain(all=false){S.mut.seed=genSeed();mutApply(all)}
function mutStripHtml(){const t=S.sel,all=S.alt,tr=S.mut.trial&&S.mut.trial.key===mutKey()?S.mut.trial:null,midi=isMidiT(t);
 const chips=MUT_SCOPES.map(([g,n,tip])=>`<button data-mutg="${g}" aria-pressed="${S.mut.scope.has(g)}" title="Every knob of ${tip}">${n}</button>`).join("");
 return`${gtitle("Mutate",all?"every synth track":midi?`${tLabel(t)} · MIDI page`:`${tLabel(t)} · ${trk(t).m.replace("SWAVE-","SW-")}`,all,"Mutate: each knob in scope is pulled toward a random target by the amount, from a seed. A trial is one undo step; Undo takes it back in one step. VOL and TUNE stay. Alt: every synth track.")}
  ${gbg("Move",gv("amt","Amount",S.mut.amount+"%","How far each knob moves toward its random target"))}
  ${gbg("Scope",`<span class="seg">${chips}</span>${(n=>`<span class="ghint">${n?`+ ${n} group${n===1?"":"s"}`:"+ a group's title"}</span>`)([...S.mut.scope].filter(x=>x.includes(":")).length)}`,"gscope","The DATA pages Mutate moves; click a group's title below to add that group")}
  <div class="gsum" title="${S.mut.note}">${S.mut.note||(midi?"A MIDI track has no sound to move: Alt+R moves every synth track.":"")}</div>
  <div class="gkeys">${randKey(`${all?"Randomise every synth track":`Randomise ${tLabel(t)}`}: a fresh random sound, from the sound before the trial${tr?"":" (this sound)"}. One trial is one undo step (R; Alt+R or Alt-click: every synth track)`)}</div>`}
function mutBarHtml(){return`<div class="genband mutband" id="mutband" title="The groups follow the sound's path: synthesis and amp, filter and effects, then the three LFOs. Drag a dot or a box; hold Alt to move the same knob on every synth track (Control All).">${mutStripHtml()}</div>`}
function renderMutStrip(){const host=$("#mutband");if(host)host.innerHTML=mutStripHtml();$$("[data-mutsg]").forEach(b=>b.setAttribute("aria-pressed",S.mut.scope.has(b.dataset.mutsg)))}

/* ---- the bars' clicks, values and keys: shared/deskGenBar.js (genMode below is the Write group's); here the
   step legend's ? key and a value's drag ---- */
/* the Write mode of a random spec (Replace, Add, Thin) */
function genMode(mode){const sp=genSpec();if(sp.mode===mode)return;sp.mode=mode;genEdited();genLive()}
document.addEventListener("click",e=>{if(e.target.closest("#steplegend")){toggleKeys(true);e.stopPropagation()}},true);
let gvDrag=null;
document.addEventListener("pointerdown",e=>{const v=e.target.closest(".gv[data-gv]");if(!v||e.button!==0)return;gvDrag={v,y:e.clientY,k:v.dataset.gv,acc:0};delete v.dataset.dragged;try{v.setPointerCapture(e.pointerId)}catch(_){}});
document.addEventListener("pointermove",e=>{if(!gvDrag)return;const d=Math.trunc((gvDrag.y-e.clientY)/6)-gvDrag.acc;if(!d)return;
 gvDrag.acc+=d;gvDrag.v.dataset.dragged="1";genVal(gvDrag.k,d*gvDragStep(gvDrag.k));
 const n=document.querySelector(`.gv[data-gv="${gvDrag.k}"]`);if(n){n.dataset.dragged="1";gvDrag.v=n}});
document.addEventListener("pointerup",()=>{if(!gvDrag)return;const k=gvDrag.k;gvDrag=null;setTimeout(()=>{const n=document.querySelector(`.gv[data-gv="${k}"]`);if(n)delete n.dataset.dragged},0)});
Keys.bind({id:"randomise-track",short:"Randomise",scope:"any",keys:["R"],code:"KeyR",group:"Selected track",modal:"genpop",when:()=>kbOn()||genDlgOpen(),run:()=>randomise(false),
 does:"Randomise the selected track: on Sound a fresh random sound (MUTATE, from the sound before the trial); everywhere else a new GEN variation: a new seed, or random hits and rotation"});
Keys.bind({id:"randomise-all",short:"Randomise all",scope:"any",keys:["R"],code:"KeyR",mod:"alt",group:"All",modal:"genpop",when:()=>kbOn()||genDlgOpen(),run:()=>randomise(true),
 does:"Randomise every track: on Sound every synth track's sound, everywhere else every GEN spec of the side shown over the whole pattern"});
Keys.bind({id:"gen-value-all",scope:"seq",area:"GEN",keys:["GEN value"],mod:"alt",group:"All",does:"Change a GEN value: every track of the side shown, the whole pattern (one undo step per run)"});
Keys.bind({id:"rkey-all",scope:"any",area:"GEN",keys:["R key"],mod:"alt",group:"All",does:"Click: randomise every track (Sound: every synth track; VOL and TUNE stay)"});
