/* ===== Control (from the MD Editor): the plug-in's MIDI mappings against the tracks, app-only LFO / Random =====
   The CC rows (the eight knob rows, then any other learned CC) show the plug-in's mappings, from the learn document
   (setLearn): a controller CC that moves a DATA page value or a level (MIDI Learn, 0.8; DESIGN-learn-0.8.md). They are
   the plug-in's, saved with the project; the page keeps no links of its own for them. The app LFO and Random rows keep
   their own links (min, max, curve): those are the plug-in's modulators and send CCs to the machine (Appendix B: SYN 48-55,
   AMP 56-63, FLT 72-79, EFX 80-87, LFO1 88-95, LFO2 104-111, LFO3 112-119). Locks are not involved. */
S.ctl={sel:"cc21",selT:null,sent:0,addT:0,phase:0,
 /* the eight knobs (CC 21-28: the knob rows' CCs; the Monomachine has no setting for them yet), no app sources: the
    browser mockup's example adds its own (demo/126-example.js) */
 sources:Array.from({length:8},(_,k)=>({id:"cc"+(21+k),kind:"cc",cc:21+k,label:"Knob "+(k+1),val:[64,40,0,0,0,0,0,0][k]})),
 xsrc:{},links:[],doc:null,left:""};
/* the learn document (host to page; the mockup builds its own) and its words */
const NOLEARN={enabled:false,mappings:[],learning:null};
const LD=()=>S.ctl.doc||NOLEARN;
const LEVELPG=7;
const knobRows=()=>S.ctl.sources.filter(x=>x.kind==="cc");
/* a CC row: a knob row (any channel, the knob's CC) or "x<ch>:<cc>" for any other learned (channel, CC) */
const rowIdOf=m=>{if(m.ch===255){const k=knobRows().find(x=>x.cc===m.cc);if(k)return k.id}return"x"+m.ch+":"+m.cc};
const srcById=id=>S.ctl.sources.find(x=>x.id===id)||(/^x\d+:\d+$/.test(id)?(S.ctl.xsrc[id]||(S.ctl.xsrc[id]={id,kind:"cc",val:0})):undefined);
function ccRows(){const rows=knobRows().map(x=>({id:x.id,ch:255,cc:x.cc,label:x.label}));
 for(const m of LD().mappings){const id=rowIdOf(m);if(!rows.some(r=>r.id===id))rows.push({id,ch:m.ch,cc:m.cc,label:m.ch===255?"CC "+m.cc:"CC "+m.cc+" ch "+(m.ch+1)})}
 return rows}
const mapsOf=id=>LD().mappings.filter(m=>rowIdOf(m)===id);
/* the learn document's names are the plug-in's parameter names; the page shows its own (the machine's SYN names) */
const tgtPid=x=>PAGES[x.pg]+"."+x.i;
const tgtName=x=>x.pg===LEVELPG?"LEVEL":(pname(x.t,tgtPid(x))||x.name||PAGES[x.pg]+" "+x.i);
const tgtLabel=x=>tLabel(x.t)+" "+(x.pg===LEVELPG?"LEVEL":PAGES[x.pg]+" "+tgtName(x));
const chWords=ch=>ch===255?"any channel":"channel "+(ch+1);
/* what a mapping hides: the machine's own targets of that (channel, CC), one line */
function overrideLine(m){const o=m.overrides||[];if(!o.length)return"";const it=o.slice(0,4).map(x=>`on channel ${x.ch+1}: ${tgtLabel(x)}`);
 return`Overrides the machine's CC ${m.cc} ${it.join("; ")}${o.length>4?`; +${o.length-4} more`:""}`}
const learnedText=m=>`Learned CC ${m.cc} on ${chWords(m.ch)}: ${tgtLabel(m)}.`+(m.overrides&&m.overrides.length?" "+overrideLine(m)+".":"");
const limitMax=()=>LD().limits?.max||128;
/* the targets the plug-in's learn takes: the document's limits (without a host: the synth tracks' DATA pages and levels) */
const canLearn=(t,pg,i)=>{const L=LD().limits;return L?t<L.tracks&&L.params.some(q=>q.pg===pg&&q.i===i):t<6&&pg<=LEVELPG&&(pg<LEVELPG||i===0)};
const learnTracks=()=>LD().limits?.tracks??6;
const RATES={"1/16":1,"1/8":2,"1/4":4,"1/2":8,"1":16,"2":32,"4":64};
function curveF(c,x){return c==="exp"?x*x:c==="log"?Math.sqrt(x):x}
function ccOf(t,pid){const[pg,i]=pid.split(".");if(pg==="MID")return"NRPN "+(0x38+ +i);return"CC "+(CCBASE[pg]+ +i)}
function applySrc(src){S.ctl.links.filter(l=>l.src===src.id).forEach(l=>{if(!pname(l.t,l.pid))return;let x=src.val/127;if(l.inv)x=1-x;x=curveF(l.curve,x);const[pg,i]=l.pid.split(".");const m=meta(l.t,pg,+i);trk(l.t).v[pg][+i]=clamp(Math.round((l.min+(l.max-l.min)*x)/127*maxOf(m)),0,maxOf(m));S.ctl.sent++})}
/* the on-screen knob row drives the plug-in's mappings of its CC (absolute: its value over 0-127, Inv turns it round) */
function applyMaps(id){const row=srcById(id);let n=0;
 for(const m of mapsOf(id)){let x=row.val/127;if(m.invert)x=1-x;
  if(m.pg===LEVELPG){const v=clamp(Math.round(x*127));if(trk(m.t).lev!==v){trk(m.t).lev=v;edit("level",{t:m.t,v})}n++;continue}
  const pid=tgtPid(m);if(!pname(m.t,pid))continue;const[pg,i]=pid.split("."),mt=meta(m.t,pg,+i);trk(m.t).v[pg][+i]=clamp(Math.round(x*maxOf(mt)),0,maxOf(mt));n++}
 S.ctl.sent+=n}
let ctlRaf=0;function ctlRefresh(){if(ctlRaf)return;ctlRaf=requestAnimationFrame(()=>{ctlRaf=0;syncControls();$$(".srch").forEach(h=>{const s2=srcById(h.dataset.src);h.style.setProperty("--f",s2.val/127*100+"%");h.querySelector(".sv").textContent=s2.val})})}
setInterval(()=>{const r=$("#ccrate"),n=S.ctl.rate??S.ctl.sent;if(r){r.textContent=`${n}/s`;r.classList.toggle("hot",n>300)}S.ctl.sent=0},1000);
function ctlTick(){S.ctl.phase++;S.ctl.sources.forEach(sr=>{const n=RATES[sr.RATE]||8;
 if(sr.kind==="lfo"){const ph=(S.ctl.phase%n)/n;sr.val=clamp(Math.round(64+lshape(sr.SHAPE,ph)*63*sr.DEPTH/100));applySrc(sr)}
 if(sr.kind==="rnd"){if(S.ctl.phase%n===0)sr._t=Math.round(Math.random()*127);const a=1-sr.SMOOTH/140;sr.val=clamp(Math.round(sr.val+(sr._t-sr.val)*a));applySrc(sr)}});if(S.ws==="control")ctlRefresh()}
/* The app sources and their links, as a value (a host's engine runs them): the LFO and Random
   sources (not the controller's knob rows) and the links from them. */
function ctlSetup(){const app=S.ctl.sources.filter(x=>x.kind!=="cc");return JSON.parse(JSON.stringify({sources:app,links:S.ctl.links.filter(l=>app.some(x=>x.id===l.src))}))}
/* the app sources' setup changed: a host that runs them gets the new one */
function ctlChanged(){tx();if(HOST.modulators)HOST.modulators(ctlSetup())}
/* The browser mockup has no plug-in: the same edits on its own learn document. A host answers with the document. */
function localLearn(op,a){const d=S.ctl.doc||(S.ctl.doc={enabled:true,mappings:[],learning:null}),ms=d.mappings;
 if(op==="add"){if(ms.some(m=>m.cc===a.cc&&m.ch===a.ch&&m.t===a.t&&m.pg===a.pg&&m.i===a.i)){toast("Already mapped.");return}
  ms.push({index:ms.length,t:a.t,pg:a.pg,i:a.i,name:"",cc:a.cc,ch:a.ch,mode:"Absolute",invert:false,overrides:[]})}
 else if(op==="remove")ms.splice(a.index,1);else if(op==="invert")ms[a.index].invert=!ms[a.index].invert;
 ms.forEach((m,n)=>m.index=n);if(S.ws==="control")render();else syncControls()}
const pidRef=pid=>pid==="LVL.0"?{pg:LEVELPG,i:0}:{pg:PAGES.indexOf(pid.split(".")[0]),i:+pid.split(".")[1]};
/* LEARN's digit k: the value clicked gets knob row k's CC (the row's own CC, as set) on any channel */
function learnBind(k){const lt=S.learnT,row=knobRows()[k-1];if(!lt||!row)return;
 if(HOST.learnBind)HOST.learnBind(lt,row.cc);else{localLearn("add",{t:lt.t,...pidRef(lt.pid),cc:row.cc,ch:255});toast(`Knob ${k} (CC ${row.cc}) → ${tLabel(lt.t)} ${pidLabel(lt.t,lt.pid)}.`)}
 S.learnT=null;S.ctl.sel=row.id;S.ctl.selT=null;syncControls();if(S.ws==="control")render()}
/* the host's learn document: progress, the result of a learn, paused, what a load left out */
function setLearn(doc){const prev=S.ctl.doc;S.ctl.doc=doc;const ms=doc.mappings||[];
 if(prev&&prev.learning&&!doc.learning){S.learnT=null;if(ms.length>prev.mappings.length)toast(learnedText(ms[ms.length-1]))}
 else if(doc.learning&&(!prev||!prev.learning||doc.learning.got>prev.learning.got)&&doc.learning.got>0)toast(`Turn the knob both ways (${doc.learning.got} of ${doc.learning.need}).`);
 if(doc.paused&&S.learn){S.learn=false;S.learnT=null;document.body.classList.remove("learn");renderTop();toast("LEARN is paused: "+doc.paused)}
 const lf=(doc.left||[]).join("\n");if(lf&&lf!==S.ctl.left)toast(`${doc.left.length} saved mapping${doc.left.length===1?"":"s"} could not be loaded (see the log).`);S.ctl.left=lf;
 if(S.ws==="control")render();else syncControls()}
const ALLT=[0,1,2,3,4,5,6,7,8,9,10,11];
function targetOpts(t){return pagesOf(t).flatMap(pg=>pnames(t,pg).map((n,i)=>n?opt(pg+"."+i,pg+" "+n,""):"")).join("")}
/* the values a CC row can take: only what the plug-in's learn takes (limits), the level last */
function learnOpts(t){if(t>=learnTracks())return"";const o=[];PAGES.forEach((pg,p)=>pnames(t,pg).forEach((n,i)=>{if(n&&canLearn(t,p,i))o.push(opt(pg+"."+i,pg+" "+n,""))}));if(canLearn(t,LEVELPG,0))o.push(opt("LVL.0","LEVEL",""));return o.join("")}
const clampT=t=>t<learnTracks()?t:0;
function renderControl(){const C=S.ctl,rows=ccRows();
 const isCc=rows.some(r=>r.id===C.sel);
 if(!isCc&&!C.sources.some(x=>x.id===C.sel&&x.kind!=="cc"))C.sel=rows[0].id;
 const selRow=rows.find(r=>r.id===C.sel),sel=selRow?{...selRow,kind:"cc"}:srcById(C.sel);
 const cs=rows.map(r=>({...r,kind:"cc",val:srcById(r.id).val})),srcs=[...cs,...C.sources.filter(x=>x.kind!=="cc")];
 const mx=`<div class="mx"><span></span>${ALLT.map(i=>`<span class="mxh" title="${trk(i).name}"><b>${tLabel(i)}</b><small>${i<6?shortM(trk(i).m):"CH"+String(trk(i).ch).padStart(2,"0")}</small></span>`).join("")}
  ${srcs.map(sr=>{const cc=sr.kind==="cc",ms=cc?mapsOf(sr.id):[];return`<button class="srch ${sr.id===C.sel?"sel":""} k-${sr.kind}" data-src="${sr.id}" style="--f:${sr.val/127*100}%"${HOST.notes?` title="${cc?HOST.notes.ccSource:HOST.notes.appSource}"`:""}><span class="sk">${cc?"CC "+sr.cc:"APP"}</span><b>${sr.label}</b><span class="sv mono">${sr.val}</span></button>
   ${ALLT.map(i=>{const sl=sr.id===C.sel&&C.selT===i?"sel":"";
    if(cc){const ls=ms.filter(m=>m.t===i);return`<button class="mxc ${ls.length?"on":""} ${sl}" data-mxsrc="${sr.id}" data-mxt="${i}" title="${ls.map(tgtLabel).join(", ")||"no mapping"}">${ls.slice(0,2).map(m=>`<i>${tgtName(m)}</i>`).join("")}${ls.length>2?`<i>+${ls.length-2}</i>`:""}</button>`}
    const ls=C.links.filter(l=>l.src===sr.id&&l.t===i);return`<button class="mxc ${ls.length?"on":""} ${sl}" data-mxsrc="${sr.id}" data-mxt="${i}" title="${ls.map(l=>pidLabel(i,l.pid)).join(", ")||"no link"}">${ls.slice(0,2).map(l=>`<i>${pname(i,l.pid)}</i>`).join("")}${ls.length>2?`<i>+${ls.length-2}</i>`:""}</button>`}).join("")}`}).join("")}</div>`;
 let insp;
 if(sel.kind==="cc"){
  const D=LD(),all=sel.id?mapsOf(sel.id):[],ms=all.filter(m=>C.selT==null||m.t===C.selT),full=D.mappings.length>=limitMax(),addT=clampT(C.addT),lt=D.learning;
  const status=D.paused?`<div class="note" data-learnnote="paused">LEARN is paused: ${D.paused}</div>`
   :lt?`<div class="note" data-learnnote="learning">Learning <b>${tgtLabel(lt)}</b>: turn a knob on your controller both ways (${lt.got} of ${lt.need}).</div>`
   :`<div class="note" data-learnnote="hint">Pick a target below, or press LEARN, click any value and turn a knob on your controller (or press 1-8 for a knob row).</div>`;
  const left=D.left&&D.left.length?`<div class="note" data-learnnote="left">Left out when the project loaded (${D.left.length}): ${D.left.slice(0,3).join("; ")}${D.left.length>3?`; +${D.left.length-3} more`:""}</div>`:"";
  insp=`<section class="card"><header><h3>${sel.label}</h3><span>CC ${sel.cc} · ${chWords(sel.ch)} · saved with the project</span></header>
  ${status}${left}
  <div class="lhead"><span class="cap">Targets</span>${C.selT!=null?`<button class="ptog on" data-selt="all"><i class="led"></i>${tLabel(C.selT)} only</button>`:`<span class="note">${ms.length} target${ms.length===1?"":"s"} · ${D.mappings.length} of ${limitMax()} mappings</span>`}</div>
  <div class="lnks">${ms.map(m=>`<div class="lnk"><span class="lcdchip" title="${tgtLabel(m)}">${tgtLabel(m)}</span><span class="note" style="grid-column:span 2">${m.mode==="RelativeSigned"?"Relative (signed)":m.mode==="RelativeOffset"?"Relative (offset)":"Absolute"}</span><span></span>
   <button class="ptog ${m.invert?"on":""}" data-minv="${m.index}"><i class="led"></i>Inv</button><button class="iconkey" data-mdel="${m.index}" aria-label="Remove mapping" title="Remove">×</button></div>${m.overrides&&m.overrides.length?`<div class="note" style="font-size:12px" data-ovr="${m.index}">${overrideLine(m)}</div>`:""}`).join("")||`<div class="note">Not mapped: this row does nothing yet.</div>`}</div>
  ${full?`<div class="note" data-learnnote="full">${limitMax()} mappings at most: remove one to add another.</div>`:""}
  <div class="irow addrow"><span class="ilab">Add</span><select id="lt" aria-label="Target track">${ALLT.filter(i=>i<learnTracks()).map(i=>opt(i,tLabel(i)+" · "+trk(i).m,addT)).join("")}</select>
   <select id="lp" aria-label="Target value">${learnOpts(addT)}</select><button class="cream" id="laddl"${full?" disabled":""}>Add target</button></div>
  <div class="irow"><span class="ilab"></span><button data-addsrc="lfo">+ App LFO</button><button data-addsrc="rnd">+ Random</button></div></section>`;
 }else{
 const links=C.links.map((l,li)=>({l,li})).filter(o=>o.l.src===sel.id&&(C.selT==null||o.l.t===C.selT));
 const appParams=sel.kind==="lfo"?`<div class="irow"><span class="ilab">Shape</span><div class="shapes">${[0,2,4,6,8,10].map(i=>`<button data-srcshape="${i}" aria-pressed="${sel.SHAPE===i}" title="${LWAVE[i]}">${shapeIcon(i)}</button>`).join("")}</div></div>
   <div class="irow"><span class="ilab">Rate</span><span class="seg" data-set="srcrate">${Object.keys(RATES).map(r=>`<button data-v="${r}" aria-pressed="${sel.RATE===r}">${r}</button>`).join("")}</span></div>
   <div class="irow"><span class="ilab">Depth</span><div style="width:140px"><div class="pc" role="slider" tabindex="0" aria-label="DEPTH" data-g="src" data-n="DEPTH" data-src="${sel.id}"><span>DEPTH</span><b></b></div></div></div>`
  :`<div class="irow"><span class="ilab">Rate</span><span class="seg" data-set="srcrate">${Object.keys(RATES).map(r=>`<button data-v="${r}" aria-pressed="${sel.RATE===r}">${r}</button>`).join("")}</span></div>
   <div class="irow"><span class="ilab">Smooth</span><div style="width:140px"><div class="pc" role="slider" tabindex="0" aria-label="SMOOTH" data-g="src" data-n="SMOOTH" data-src="${sel.id}"><span>SMOOTH</span><b></b></div></div></div>`;
 insp=`<section class="card"><header><h3>${sel.label}</h3><span><b class='apponly'>App only</b> · not saved in the kit</span></header>
  <div class="note">${HOST.notes?.appSource||"Runs in the app and sends CCs to the Monomachine while it plays. A lock wins on its step."}</div>
  ${appParams}
  <div class="lhead"><span class="cap">Targets</span>${C.selT!=null?`<button class="ptog on" data-selt="all"><i class="led"></i>${tLabel(C.selT)} only</button>`:`<span class="note">${links.length} target${links.length===1?"":"s"}</span>`}</div>
  <div class="lnks">${links.map(({l,li})=>`<div class="lnk"><span class="lcdchip" title="${ccOf(l.t,l.pid)} on the track channel">${tLabel(l.t)} ${pidLabel(l.t,l.pid)}</span>
   <div class="pc" role="slider" tabindex="0" aria-label="Min" data-g="link" data-n="min" data-li="${li}"><span>MIN</span><b></b></div><div class="pc" role="slider" tabindex="0" aria-label="Max" data-g="link" data-n="max" data-li="${li}"><span>MAX</span><b></b></div>
   <span class="seg" data-set="lcurve" data-li="${li}">${["lin","exp","log"].map(c=>`<button data-v="${c}" aria-pressed="${l.curve===c}">${c.toUpperCase()}</button>`).join("")}</span>
   <button class="ptog ${l.inv?"on":""}" data-linv="${li}"><i class="led"></i>Inv</button><button class="iconkey" data-ldel="${li}" aria-label="Remove target" title="Remove">×</button></div>`).join("")||`<div class="note">No targets yet. Add one below.</div>`}</div>
  <div class="irow addrow"><span class="ilab">Add</span><select id="lt" aria-label="Target track">${ALLT.map(i=>opt(i,tLabel(i)+" · "+(i<6?trk(i).m:"MIDI CH"+trk(i).ch),C.addT)).join("")}</select>
   <select id="lp" aria-label="Target value">${targetOpts(C.addT)}</select><button class="cream" id="laddl">Add target</button></div>
  <div class="irow"><span class="ilab"></span><button data-addsrc="lfo">+ App LFO</button><button data-addsrc="rnd">+ Random</button></div></section>`}
 $("#main").innerHTML=`<div class="ctlui"><section class="card"><header><h3>Mapping matrix</h3><span>rows = sources · columns = tracks · drag a knob row to turn it</span></header>${mx}</section>${insp}</div>`;
 syncControls()}
let knobDrag=null;
document.addEventListener("pointerdown",e=>{const h=e.target.closest(".srch.k-cc");if(h){knobDrag={h,src:srcById(h.dataset.src),y:e.clientY,x:e.clientX,v:srcById(h.dataset.src).val,moved:false};h.setPointerCapture(e.pointerId)}},true);
document.addEventListener("pointermove",e=>{if(!knobDrag)return;if(e.buttons===0&&e.pointerType==="mouse"){knobDrag=null;return}const d=((e.clientX-knobDrag.x)+(knobDrag.y-e.clientY))/2;if(Math.abs(d)>2)knobDrag.moved=true;knobDrag.src.val=clamp(Math.round(knobDrag.v+d));
 /* the knob row drives its targets through the editor: the kit values it moved, as param intents */
 const was={};for(let t=0;t<6;t++)was[t]=pagesCopy(t);applyMaps(knobDrag.src.id);editParams(was);ctlRefresh()});
document.addEventListener("pointerup",()=>{if(knobDrag){const k=knobDrag;knobDrag=null;if(k.moved)k.h.dataset.moved="1"}},true);
document.addEventListener("click",e=>{if(S.ws!=="control")return;const C=S.ctl;
 const sh=e.target.closest(".srch");if(sh){if(sh.dataset.moved){sh.dataset.moved="";return}C.sel=sh.dataset.src;C.selT=null;render();return}
 const mc=e.target.closest(".mxc");if(mc){C.sel=mc.dataset.mxsrc;C.selT=+mc.dataset.mxt;C.addT=C.selT;render();return}
 if(e.target.closest("[data-selt]")){C.selT=null;render();return}
 const ss=e.target.closest("[data-srcshape]");if(ss){srcById(C.sel).SHAPE=+ss.dataset.srcshape;ctlChanged();render();return}
 const sr=e.target.closest(".seg[data-set=srcrate] button");if(sr){srcById(C.sel).RATE=sr.dataset.v;ctlChanged();render();return}
 const lc=e.target.closest(".seg[data-set=lcurve] button");if(lc){C.links[+lc.parentElement.dataset.li].curve=lc.dataset.v;ctlChanged();render();return}
 const li=e.target.closest("[data-linv]");if(li){const l=C.links[+li.dataset.linv];l.inv=!l.inv;ctlChanged();render();return}
 const ld=e.target.closest("[data-ldel]");if(ld){C.links.splice(+ld.dataset.ldel,1);ctlChanged();render();return}
 /* the plug-in's mappings: invert and remove by their index in the learn document */
 const mi=e.target.closest("[data-minv]");if(mi){if(HOST.learnInvert)HOST.learnInvert(+mi.dataset.minv);else localLearn("invert",{index:+mi.dataset.minv});return}
 const md=e.target.closest("[data-mdel]");if(md){if(HOST.learnRemove)HOST.learnRemove(+md.dataset.mdel);else localLearn("remove",{index:+md.dataset.mdel});return}
 if(e.target.closest("#laddl")){const pid=$("#lp").value,t=C.addT,row=ccRows().find(r=>r.id===C.sel);
  if(row){if(!pid)return;const a={cc:row.cc,t,...pidRef(pid),ch:row.ch};if(HOST.learnAdd)HOST.learnAdd(a);else localLearn("add",a);return}
  if(C.links.some(l=>l.src===C.sel&&l.t===t&&l.pid===pid)){toast("Already a target.");return}C.links.push({src:C.sel,t,pid,min:0,max:127,curve:"lin",inv:false});ctlChanged();render();return}
 const as=e.target.closest("[data-addsrc]");if(as){const k=as.dataset.addsrc,n=C.sources.filter(x=>x.kind===k).length;const id=k+"X"+Date.now();C.sources.push(k==="lfo"?{id,kind:"lfo",label:"LFO "+"ABCDEFGH"[n],val:64,SHAPE:2,RATE:"1",DEPTH:80}:{id,kind:"rnd",label:"Random "+"ABCDEFGH"[n],val:64,RATE:"1/8",SMOOTH:0,_t:64});C.sel=id;ctlChanged();render();return}});
document.addEventListener("change",e=>{if(e.target.id==="lt"){S.ctl.addT=+e.target.value;render()}});
