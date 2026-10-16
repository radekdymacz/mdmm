"use strict";
/* v61 (P5): GLOBAL settings (manual pp.57-62, 80-81): the machine's FUNCTION + PATTERN/SONG menu as one page,
   opened from the GLOBAL key or the engine menu (GLOBAL…); 0.6: TRIG IN A / B editable, the map editor's LEARN dots
   (a note from a MIDI keyboard, the plug-in's midiIn) and Reset map, Copy / Paste of the slot. Since B-051 the panel's frame is shared with the Monomachine Editor
   (skins/shared/deskGlobal.js); this file is the Machinedrum's host of it: glob() gives the view, mdGlobalCards its
   cards, globSend(field, value) changes one setting. What was
   measured on the firmware is plain; what could not be is marked "not verified". */
const NOTE=n=>["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"][n%12]+(Math.floor(n/12)-1);
/* The MAP EDITOR's targets (measured on the firmware, 0.3.5): 0-15 a track, 16-143 a pattern A01-H16, 144 START,
   145 STOP. The machine keeps any other byte as sent (a backup can hold one); it is shown as its number. */
const KTGT=v=>v==null?"--":v<16?"TRACK "+(v+1):v<144?"ABCDEFGH"[(v-16)>>4]+String((v-16)%16+1).padStart(2,"0"):v===144?"START":v===145?"STOP":"#"+v;
const GTIP={
 base:"The first of four MIDI channels the machine listens and sends on (channel n to n+3). OFF: the machine takes no notes, mutes or sound values over MIDI, so the editor cannot play it; + or − sets 1–4",
 tempoIn:"INTERNAL: its own BPM. EXTERNAL: follows MIDI clock (MIDI Start waits for the clock). In a DAW: EXT follows the DAW's tempo and transport (a new plug-in starts so); INT runs the machine on its own clock and tempo, kept with the project",
 ctrlIn:"React to MIDI Start, Stop and Continue",tempoOut:"Send MIDI clock",ctrlOut:"Send MIDI Start, Stop and Continue",
 pcIn:"Program change selects a pattern",pcOut:"Selecting a pattern sends a program change",
 pcCh:"BASE: in on the four base channels, out on the first",
 trig:"How a note mapped to a pattern starts it. GATE: plays while the key is held. START: at once. QUE: at the end of the playing pattern",
 local:"OFF: the TRIG keys and the sequencer do not play the internal sounds. Stored in the global; its effect could not be verified in the emulator",
 map:"The note that plays each track. A key maps one function: choosing a used key frees it elsewhere",
 mapNote:"A note mapped to a pattern (A01-H16, GROUP PAT A-H on the machine) or to START / STOP (GROUP CTRL). Pick the note, then what it plays",
 inputs:"TRIG IN A and B: the external inputs as trig pads (GLOBAL > ROUTING on the machine). Gate, Sens, Vmin, Vmax 0-127; Dest: the track a pulse plays, or - for none. Click − or + (Shift: 10 at a time). The emulator has no trig inputs, so what they do is not verified here",
 learn:"LEARN: click, then play a note on a MIDI keyboard: that note plays this track (any channel). Click again to stop",
 resetMap:"Back to Elektron's note map (the machine's own: tracks from C2, patterns from E4), asked first; Undo brings yours back" };
/* the cards of the shared GLOBAL page (skins/shared/deskGlobal.js draws the frame: the head with the slots, Copy · Paste · Clear) */
function mdGlobalCards(G){
 const tog=GlobalUi.tog,step=GlobalUi.step;
 const trackKey=t=>{const n=G.keymap.indexOf(t);return`<div class="gmk key${n<0?" none":""}" title="${GTIP.map}"><small>TRACK ${t+1}<button class="glearn" data-ga="learn" data-t="${t}" aria-pressed="${GP.learn===t}" aria-label="LEARN track ${t+1}" title="${GTIP.learn}"></button></small><span class="stepper"><button data-ga="map" data-t="${t}" data-d="-1" aria-label="Lower note">‹</button><b>${n<0?"--":NOTE(n)}</b><button data-ga="map" data-t="${t}" data-d="1" aria-label="Higher note">›</button></span></div>`};
 const pats=G.keymap.map((v,n)=>v!=null&&v>=16?`${NOTE(n)}→${KTGT(v)}`:null).filter(Boolean);
 const cur=G.keymap[GP.note],tgts=[null,...Array.from({length:146},(_,v)=>v)];if(cur!=null&&!tgts.includes(cur))tgts.push(cur);
 const outs=["A","B","C","D","E","F","MAIN"];
 return`
  <section class="card"><header><h3>Control</h3><span>MIDI</span></header>
   <div class="grow2"><span class="ilab">Base channel</span>${step("base",G.baseChannel>12?"OFF":(G.baseChannel+1)+"–"+(G.baseChannel+4),GTIP.base)}</div>
   <div class="grow2"><span class="ilab">Prg change in</span>${tog("pcIn",G.pcIn,GTIP.pcIn)}</div>
   <div class="grow2"><span class="ilab">Prg change out</span>${tog("pcOut",G.pcOut,GTIP.pcOut)}</div>
   <div class="grow2"><span class="ilab">Prg channel</span>${step("pcCh",G.pcChannel?G.pcChannel:"BASE",GTIP.pcCh)}</div>
   <div class="grow2"><span class="ilab">Local ctrl</span>${tog("local",G.local,GTIP.local)}<span class="gnv" title="${GTIP.local}">not verified</span></div></section>
  <section class="card"><header><h3>Sync</h3><span>clock and transport</span></header>
   <div class="grow2"><span class="ilab">Tempo in</span>${tog("tempoIn",G.tempoIn==="external",GTIP.tempoIn,"EXT","INT")}</div>
   <div class="grow2"><span class="ilab">Ctrl in</span>${tog("ctrlIn",G.ctrlIn,GTIP.ctrlIn)}</div>
   <div class="grow2"><span class="ilab">Tempo out</span>${tog("tempoOut",G.tempoOut,GTIP.tempoOut)}</div>
   <div class="grow2"><span class="ilab">Ctrl out</span>${tog("ctrlOut",G.ctrlOut,GTIP.ctrlOut)}</div></section>
  <section class="card"><header><h3>Trig in A / B</h3><span>external pads<span class="gnv" title="${GTIP.inputs}">not verified</span></span></header>
   <div class="ginputs" title="${GTIP.inputs}"><span></span><span>Gate</span><span>Sens</span><span>Vmin</span><span>Vmax</span><span>Dest</span>
    ${["A","B"].map((x,i)=>`<span>${x}</span>`+[["gate",2],["sens",4],["vmin",6],["vmax",8],["dest",0]].map(([p,k])=>{const v=G.inputs[k+i];return`<span class="stepper"><button data-ga="trigin" data-i="${i}" data-p="${p}" data-d="-1" aria-label="${p} ${x} less">‹</button><b>${p==="dest"?(v<16?"T"+(v+1):"-"):v}</b><button data-ga="trigin" data-i="${i}" data-p="${p}" data-d="1" aria-label="${p} ${x} more">›</button></span>`}).join("")).join("")}</div></section>
  <section class="card wide"><header><h3>Map editor</h3><span><button class="mini" data-ga="resetmap" title="${GTIP.resetMap}">Reset map</button>${GP.learn!=null?`<b class="glearnhint">LEARN: play a note for TRACK ${GP.learn+1}</b>`:"MIDI notes → tracks and patterns"}</span></header>
   <div class="grow2"><span class="ilab">Pattern trig</span><span class="seg" title="${GTIP.trig}">${["gate","start","que"].map((m,i)=>`<button data-ga="trig" data-v="${i}" aria-pressed="${G.trigMode===m}">${m.toUpperCase()}</button>`).join("")}</span><span class="note" title="${pats.join(" ")}">${pats.length?pats.length+" notes play patterns or the transport: "+pats.slice(0,6).join(" ")+(pats.length>6?" …":""):"No notes play patterns."}</span></div>
   <div class="grow2" title="${GTIP.mapNote}"><span class="ilab">Map a note</span><span class="stepper"><button data-ga="mapnote" data-d="-1" aria-label="Lower note">‹</button><b class="mono">${NOTE(GP.note)}</b><button data-ga="mapnote" data-d="1" aria-label="Higher note">›</button></span><select id="gmapsel" data-gsel="map" aria-label="What ${NOTE(GP.note)} plays">${tgts.map(v=>`<option value="${v==null?"":v}"${v===cur?" selected":""}>${KTGT(v)}</option>`).join("")}</select></div>
   <div class="gmap">${Array.from({length:16},(_,t)=>trackKey(t)).join("")}</div></section>
  <section class="card"><header><h3>Routing</h3><span>track outputs · A–F skip the master effects</span></header>
   <div class="grout">${G.routing.map((o,t)=>`<button class="${o!=="MAIN"?"on":""}" data-ga="route" data-t="${t}" title="Track ${t+1}: ${o==="MAIN"?"main output, through the master effects":"output "+o+", skips the master effects"}. Click for the next output."><small>${t+1}</small><b>${o}</b></button>`).join("")}</div></section>
`}
function mdGlobalClick(a,G){const f=a.dataset.ga,v=a.dataset.v!=null?+a.dataset.v:null,d=a.dataset.d!=null?+a.dataset.d:0;
 if(f==="base"){globSend("baseChannel",G.baseChannel>12?0:Math.max(0,Math.min(12,G.baseChannel+d)));return}
 if(f==="pcCh"){globSend("programChangeChannel",Math.max(0,Math.min(16,(G.pcChannel||0)+d)));return}
 if(f==="trig"){globSend("trigMode",v);return}
 if(f==="route"){const outs=["MAIN","A","B","C","D","E","F"],t=+a.dataset.t;globSend("route",{t,out:outs[(outs.indexOf(G.routing[t])+1)%outs.length]});return}
 if(f==="mapnote"){GP.note=Math.max(0,Math.min(127,GP.note+d));drawGlobal();return}
 if(f==="learn"){const t=+a.dataset.t;GP.learn=GP.learn===t?null:t;drawGlobal();return}
 if(f==="resetmap"){DeskGlobal.host.ask(`Reset the map of <b>GLOBAL ${G.slot+1}</b> to Elektron's note map? Tracks from C2, patterns from E4; the rest of the global stays (Undo brings yours back).`,"Reset map",()=>globSend("resetMap",null));return}
 if(f==="trigin"){const i=+a.dataset.i,p=a.dataset.p,k={dest:0,gate:2,sens:4,vmin:6,vmax:8}[p]+i,cur=G.inputs[k],top=p==="dest"?16:127,step=GP.shift?10:1;
  /* DEST runs as the machine's knob: -, then tracks 1-16 */
  let v;if(p==="dest"){const order=[16,...Array.from({length:16},(_,n)=>n)],at=order.indexOf(cur<0||cur>16?16:cur);v=order[Math.max(0,Math.min(16,at+d*step))]}else v=Math.max(0,Math.min(top,cur+d*step));
  if(v!==cur)globSend("trigIn",{input:i,param:p,v});return}
 if(f==="map"){const t=+a.dataset.t;let n=G.keymap.indexOf(t);n=n<0?(d>0?0:127):n+d;n=Math.max(0,Math.min(127,n));globSend("keymap",{note:n,target:t});return}
 const map={pcIn:"programChangeIn",pcOut:"programChangeOut",local:"localControl",tempoIn:"tempoIn",ctrlIn:"ctrlIn",tempoOut:"tempoOut",ctrlOut:"ctrlOut"};
 if(map[f])globSend(map[f],v===1)}
/* The plug-in's side: the view from md-desk/global (its derived "control" view) and the desk's commands. */
function glob() {
	const g = Docs.global; if (!g) return null; const c = g.control || {};
	return { slot: g.slot, baseChannel: g.baseChannel, tempoIn: c.tempoIn, ctrlIn: c.ctrlIn, tempoOut: c.tempoOut, ctrlOut: c.ctrlOut, pcIn: c.programChangeIn,
		pcOut: c.programChangeOut, pcChannel: c.programChangeChannel, trigMode: c.trigMode, local: c.localControl, keymap: g.keymap, routing: g.routing, inputs: g.settings.inputSettings };
}
function globSend(f, v) {
	if (f === "slot") cmd("globalSlot", { slot: v });
	else if (f === "route") cmd("route", v);
	else if (f === "keymap") cmd("globalSet", { field: "keymap", note: v.note, target: v.target });
	else if (f === "trigIn") cmd("globalSet", { field: "trigIn", input: v.input, param: v.param, v: v.v });
	else if (f === "resetMap") cmd("globalSet", { field: "resetMap" });
	else if (typeof v === "boolean") cmd("globalSet", { field: f, on: v });
	else cmd("globalSet", { field: f, v });
}
Bridge.onMessage(m => {
	/* the machine document only when Copy filled the clipboard (Paste comes on): it comes often, a redraw each time would
	   replace the page under the pointer */
	const clip = m.type === "machine" ? m.doc?.clipboard?.global ?? null : GP.clip;
	if (GP.open && (m.type === "doc" && m.kind === "global" || m.type === "result" && !m.ok || clip !== GP.clip)) setTimeout(drawGlobal, 20);
	GP.clip = clip;
	/* LEARN (0.6): the next note played on a MIDI keyboard (the plug-in's midiIn) maps to the armed track */
	if (m.type === "midiIn" && GP.open && GP.learn != null) {
		const t = GP.learn; GP.learn = null;
		globSend("keymap", { note: m.note, target: t });
		toast(`LEARN: ${NOTE(m.note)} plays TRACK ${t + 1}`);
		setTimeout(drawGlobal, 20);
	}
});
/* the MD's host of the shared panel */
DeskGlobal.host = {
	view: glob, cards: mdGlobalCards, click: mdGlobalClick, menu: "FUNCTION + PATTERN/SONG",
	change: (s, G) => { if (s.dataset.gsel === "map") globSend("keymap", { note: GP.note, target: s.value === "" ? null : +s.value }); },
	slot: n => globSend("slot", n),
	reset: () => cmd("globalReset", {}),
	copy: G => cmd("globalCopy", { slot: G.slot }),
	paste: G => cmd("globalPaste", { slot: G.slot }),
	canPaste: () => V.clipboard?.global != null,
	back: () => ({ seq: "Pattern", sound: "Kit", mix: "Mix", sampler: "Sampler", song: "Song", control: "Control" })[S.ws] || "",
	ask: (html, label, yes) => ask(html, [[label, "danger", yes], ["Cancel", "", () => { }]])
};
