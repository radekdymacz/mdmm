/* ===== DigiPRO: the MKII's 64 user waveforms (0.9 wave 2, doc/release/0.9/mm-digipro.md) =====
   GLOBAL › FILE › DIGIPRO MGR on the machine, so a card of the GLOBAL page here (117-global.js puts it under the global
   cards; it is no part of a global slot). The 64 positions as the machine counts them (W01 to W64; a user waveform has
   "u" and its name), the selected one drawn, and the manager's keys: Read, Load… (RECEIVE: a .syx of waveforms or a WAV /
   AIFF of one cycle, from the selected position on), Save .syx… (SEND: the selected one, Shift: every user waveform),
   Rename, Copy, Paste, Erase (Shift: all) and Undo (the card's own: the waveforms are no documents of the page's undo).
   The host does the work (HOST.waveList … waveSendNow, the plug-in's mdSyxWaves.h) and answers with the list
   (MMView.setWaves) and a Load's file (MMView.setWaveFile); the page asks before a change loses a user waveform. Without a
   host (the browser mockup) the example engine below plays it on two example waveforms. An MKI plate has none: the card
   says so and its keys are off. Over HW MIDI the person opens RECEIVE on the machine (Send) and erases there (panelKeys). */
const DG={sel:0,list:null,asked:false,renaming:false,clip:null};
const DGN=n=>"W"+String(n+1).padStart(2,"0");
const DG_TIP={read:"Read: the 64 positions again from the machine (a factory one answers nothing, so a reading takes a while)",
 load:"Load…: a .syx of DigiPRO waveforms, or a WAV or AIFF of one cycle, into the selected position and on (RECEIVE). Asked first",
 save:"Save .syx…: the selected user waveform to a file (SEND). Shift: every user waveform, a bank",
 rename:"Rename: up to four characters (A to Z, 0 to 9, space - + . / #). User waveforms only",
 copy:"Copy the selected user waveform", paste:"Paste the copied waveform into the selected position (asked first over a user one)",
 erase:"Erase the selected user waveform: the position's factory waveform comes back (asked first). Shift: every user waveform",
 undo:"Undo: the card's last change to the waveforms, taken back on the machine",
 send:"HW MIDI: the Monomachine is on GLOBAL › FILE › DIGIPRO MGR › RECEIVE › ORG (WAITING): send what waits"};
/* the example engine's waveforms (no host): W01 a saw, W04 a square */
const dgDemoWave=(n,name,f)=>({wave:n,known:true,user:true,name,points:Array.from({length:128},(_,i)=>Math.round(f(i/128)*120))});
function dgDemo(){if(DG.list)return;const w=Array.from({length:64},(_,n)=>({wave:n,known:true,user:false,name:"",points:[]}));
 w[0]=dgDemoWave(0,"SAW",x=>2*x-1);w[3]=dgDemoWave(3,"SQR",x=>x<.5?.6:-.6);DG.list={ok:true,running:false,waves:w,undo:0,waitsFor:"",text:"Example waveforms."}}
function dgWave(n){return DG.list&&DG.list.waves?DG.list.waves[n]:null}
function dgSvg(w){if(!w||!w.user||!w.points||!w.points.length)return"";const p=w.points.map((v,i)=>`${(i*128/(w.points.length-1)).toFixed(1)},${(32-v/4).toFixed(1)}`).join(" ");
 return`<svg class="dpdraw" viewBox="0 0 128 64" preserveAspectRatio="none" aria-label="${DGN(w.wave)} waveform"><line x1="0" y1="32" x2="128" y2="32"/><polyline points="${p}"/></svg>`}
function digiproCard(){
 if(!DG.asked){DG.asked=true;if(HOST.waveList)HOST.waveList(false);else dgDemo()}
 const L=DG.list,mk1=S.plate==="mk1",w=dgWave(DG.sel),busy=!L||L.running,user=!!(w&&w.user),known=!!(w&&w.known),noErase=NA.panelKeys||"";
 const off=c=>mk1||busy||!c?" disabled":"";
 const keys=Array.from({length:64},(_,n)=>{const x=dgWave(n),u=x&&x.user;return`<button class="dpk${u?" user":""}${x&&!x.known?" unk":""}" data-ga="dpwave" data-v="${n}" aria-pressed="${n===DG.sel}" title="${DGN(n)}${u?" · user waveform "+escH(x.name||"(no name)"):x&&x.known?" · factory waveform":" · not read yet"}"><small>${DGN(n)}</small><b>${u?"u"+escH(x.name||"----"):""}</b></button>`}).join("");
 const what=!w||!known?`<p class="note">${DGN(DG.sel)} is not read from the machine yet.</p>`:user
  ?(DG.renaming?`<input class="lsin dpin" id="dpin" maxlength="4" value="${escH(w.name||"")}" aria-label="Name of ${DGN(DG.sel)}, up to 4 characters" spellcheck="false" autocomplete="off">`:`<b class="dpname mono">u${escH(w.name||"----")}</b>`)+`<span class="note">user waveform</span>`
  :`<span class="note">the factory waveform: the machine sends, renames and erases user waveforms only</span>`;
 const waits=L&&L.waitsFor?`<p class="gwarn">${escH(L.waitsFor)}</p>`:"";
 return`<section class="card dpcard"><header><h3>DigiPRO</h3><span>the 64 user waveforms · GLOBAL › FILE › DIGIPRO MGR · not part of a global slot</span></header>
  ${mk1?`<p class="gwarn">An MKI has no user waveforms. The MKII plate (engine menu) has them.</p>`:""}
  <div class="dpbody"><div class="dpgrid" role="group" aria-label="DigiPRO positions">${keys}</div>
   <div class="dpsel"><div class="dphead"><b class="mono">${DGN(DG.sel)}</b>${what}</div>${dgSvg(w)}
    <div class="dpkeys"><button data-ga="dpread" title="${DG_TIP.read}"${mk1||busy?" disabled":""}>Read</button><button data-ga="dpload" title="${DG_TIP.load}"${off(known)}>Load…</button><button data-ga="dpsave" title="${DG_TIP.save}"${off(true)}>Save .syx…</button><button data-ga="dprename" title="${DG_TIP.rename}"${off(user)}>Rename</button><button data-ga="dpcopy" title="${DG_TIP.copy}"${off(user)}>Copy</button><button data-ga="dppaste" title="${DG_TIP.paste}"${off(DG.clip!=null&&known)}>Paste</button><button class="danger" data-ga="dperase" title="${noErase||DG_TIP.erase}"${off(!noErase)}>Erase</button><button data-ga="dpundo" title="${DG_TIP.undo}"${off(L&&L.undo>0)}>Undo</button>${L&&L.waitsFor?`<button class="cream" data-ga="dpsend" title="${DG_TIP.send}">Send</button>`:""}</div>
    ${waits}<p class="note dpnews" aria-live="polite">${escH(L?(L.running&&L.total?`Reading ${L.done} of ${L.total}. `:"")+(L.text||""):"Reading the waveforms from the machine.")}</p></div></div></section>`}
const dgUsers=()=>(DG.list?.waves||[]).filter(x=>x.user);
function dgRename(ok){if(!DG.renaming)return;const v=(document.getElementById("dpin")?.value||"").toUpperCase().replace(/[^A-Z0-9 \-+./#]/g,"").slice(0,4).trimEnd();DG.renaming=false;
 const w=dgWave(DG.sel);if(ok&&w&&w.user&&v!==(w.name||"")){if(HOST.waveRename)HOST.waveRename(DG.sel,v);else{w.name=v;toast("Renamed "+DGN(DG.sel)+" (example).")}}drawGlobal()}
function digiproClick(a){const f=a.dataset.ga,w=dgWave(DG.sel),shift=GP.shift;
 if(f!=="dprename"&&DG.renaming){DG.renaming=false}
 if(f==="dpwave"){DG.sel=+a.dataset.v;drawGlobal();return}
 if(S.plate==="mk1")return;
 if(f==="dpread"){if(HOST.waveList)HOST.waveList(true);else toast("In the plug-in: the 64 positions are read from the machine again.");return}
 if(f==="dpload"){if(HOST.waveChoose)HOST.waveChoose(DG.sel);else toast("In the plug-in: a .syx or a WAV of one cycle goes to "+DGN(DG.sel)+".");return}
 if(f==="dpsave"){const all=shift;if(!all&&!(w&&w.user)){toast(DGN(DG.sel)+" holds a factory waveform: the machine sends user waveforms only. Shift: every user waveform.");return}
  const r={kinds:["wave"],ranges:{wave:all?[0,63]:[DG.sel,DG.sel]}};if(HOST.syxExport)HOST.syxExport(r);else toast("In the plug-in: the save dialog, then the .syx.");return}
 if(f==="dprename"){if(!(w&&w.user))return;DG.renaming=true;drawGlobal();const i=document.getElementById("dpin");if(i){i.focus({preventScroll:true});i.select()}return}
 if(f==="dpcopy"){if(!(w&&w.user))return;DG.clip=DG.sel;toast("Copied "+DGN(DG.sel)+(w.name?" ("+w.name+")":"")+".");drawGlobal();return}
 if(f==="dppaste"){const from=DG.clip;if(from==null||from===DG.sel)return;const go=()=>{if(HOST.waveCopy)HOST.waveCopy(from,DG.sel);else{const s=dgWave(from);DG.list.waves[DG.sel]={...s,wave:DG.sel};drawGlobal()}};
  if(w&&w.user)ask(`Paste <b>${DGN(from)}</b> into <b>${DGN(DG.sel)}</b>? It replaces the user waveform <b>${escH(w.name||DGN(DG.sel))}</b> there (Undo on this card brings it back).`,[["Replace","danger",go],["Cancel","",()=>{}]]);else go();return}
 if(f==="dperase"){if(NA.panelKeys){toast(NA.panelKeys);return}
  if(shift){const n=dgUsers().length;if(!n){toast("The machine holds no user waveform.");return}
   ask(`Erase every user waveform (<b>${n}</b>)? The factory waveforms of those positions come back (Undo on this card brings them back).`,[["Erase all","danger",()=>{if(HOST.waveErase)HOST.waveErase(-1);else{DG.list.waves.forEach((x,n)=>{if(x.user)DG.list.waves[n]={wave:n,known:true,user:false,name:"",points:[]}});drawGlobal()}}],["Cancel","",()=>{}]]);return}
  if(!(w&&w.user))return;
  ask(`Erase <b>${DGN(DG.sel)}</b> (<b>${escH(w.name||"no name")}</b>)? The factory waveform of that position comes back (Undo on this card brings it back).`,[["Erase","danger",()=>{if(HOST.waveErase)HOST.waveErase(DG.sel);else{DG.list.waves[DG.sel]={wave:DG.sel,known:true,user:false,name:"",points:[]};drawGlobal()}}],["Cancel","",()=>{}]]);return}
 if(f==="dpundo"){if(HOST.waveUndo)HOST.waveUndo();else toast("In the plug-in: the last change is taken back on the machine.");return}
 if(f==="dpsend"){if(HOST.waveSendNow)HOST.waveSendNow();return}}
/* the host's answers: the list (redrawn unless a name is being typed), a Load's file (asked before it goes) */
function setWaves(m){DG.list=m;if(GP.open&&!DG.renaming)drawGlobal()}
function setWaveFile(m){if(!m.ok){toast(m.text);return}
 const rep=(m.waves||[]).filter(x=>x.replaces),list=(m.waves||[]).map(x=>`<li><b>${DGN(x.wave)}</b> ${escH(x.name||"(no name)")}${x.replaces?` <span class="gwarn">replaces ${escH(x.replaces)}</span>`:""}</li>`).join("");
 ask(`<b>${escH(m.file)}</b>: ${escH(m.text)}<ul class="recvsteps">${list}</ul>${rep.length?`<p>${rep.length===1?"One user waveform is":rep.length+" user waveforms are"} replaced (Undo on the DigiPRO card brings ${rep.length===1?"it":"them"} back).</p>`:""}`,
  [[rep.length?"Replace":"Load","cream",()=>{if(HOST.waveLoad)HOST.waveLoad()}],["Cancel","",()=>{}]])}
document.addEventListener("keydown",e=>{if(e.target.id!=="dpin")return;if(e.key==="Enter"){e.preventDefault();e.stopImmediatePropagation();dgRename(true)}});
document.addEventListener("input",e=>{if(e.target.id!=="dpin")return;const i=e.target,v=i.value.toUpperCase().replace(/[^A-Z0-9 \-+./#]/g,"").slice(0,4);if(v!==i.value)i.value=v});
