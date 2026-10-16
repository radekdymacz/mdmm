
/* ===== Mix: routing drawn as a signal graph ===== */
const BUSES=["AB","CD","EF"],ROUTES=["3xSTEREO","3xSTEREO+AB=MIX","6xMONO"],INPUTS=["NEIBOR","INP A","INP B","INP AB","BUS AB","BUS CD","BUS EF"];
const shortM=m=>m.replace("SWAVE-","SW-").replace("DPRO-","DP-");
function busFlow(b){const T=S.tracks;let items=[];const notes=[];
 T.forEach((tr,t)=>{const lab=(tr.inp==="NEIBOR"&&isFx(tr.m)&&t>0?`T${t}›`:"")+`T${t+1} ${shortM(tr.m)}`;
  if(isFx(tr.m)&&tr.inp==="BUS "+b){if(tr.out[b]){items=[`(${items.join(" + ")||"silence"}) › ${lab} INSERT`]}else notes.push(`${lab} takes a copy`);return}
  if(tr.out[b]&&!tr.mute)items.push(lab)});
 return{items,notes}}
function outOf(b){if(S.routing==="6xMONO")return"not sent out";if(b==="AB")return"OUT A/B";return S.routing==="3xSTEREO+AB=MIX"?`OUT ${b[0]}/${b[1]} + A/B`:`OUT ${b[0]}/${b[1]}`}
/* compact: the node row, then the three buses close under it with the INPUT jack inline on their left, the
   outputs on their right and the mode label in the bottom corner */
/* I-032: the output meters, under the graph's bus lines. The plug-in has three stereo outputs, A/B, C/D, E/F, and measures each
   (mixLevels, about 25 a second, only while this page is shown: HOST.mixMeters); the emulation gives no audio per track,
   so a meter is a bus's, never a track's. Per pair, just under its line, two thin bars (left, right) on the LCD's ground: the RMS solid, the peak
   behind it paler, a hold tick at the largest peak (1.5 s, then it falls), and a clip mark on the left (lit 4 s after a
   sample over 0 dBFS). -60 dB at the left end, 0 dBFS at the right. Decay is the page's: 30 dB a second, the bars fall
   on their own between messages. An output the host did not enable is dimmed. The LCD's ink only. */
const MX0=1052,MXW=90,MFLOOR=-60,MFALL=0.03,MHOLD=1500,MCLIP=4000,MQ=-96;
const MIXM={want:false,raf:0,els:null,drawn:"",pairs:BUSES.map(()=>({on:false,clipAt:-1e9,ch:[0,1].map(()=>({pk:MQ,rm:MQ,hv:MQ,ht:-1e9,t:0}))}))};
const mdecay=(v,t0,now)=>Math.max(MQ,v-MFALL*Math.max(0,now-t0));
const mholdAt=(c,now)=>now-c.ht<MHOLD?c.hv:mdecay(c.hv,c.ht+MHOLD,now);
const mpos=db=>Math.max(0,Math.min(1,(db-MFLOOR)/-MFLOOR));
/* a message's reading into the state at time now (pure on the state) */
function mixFeed(m,now){(m.pairs||[]).slice(0,3).forEach((q,k)=>{const P=MIXM.pairs[k];P.on=!!q.on;if(q.clip)P.clipAt=now;
 [0,1].forEach(i=>{const c=P.ch[i],pk=q.peak?.[i]??MQ,rm=q.rms?.[i]??MQ,fp=mdecay(c.pk,c.t,now),fr=mdecay(c.rm,c.t,now);
  if(pk>=mholdAt(c,now)){c.hv=pk;c.ht=now}else if(now-c.ht>=MHOLD){c.hv=mholdAt(c,now);c.ht=now-MHOLD}
  c.pk=Math.max(fp,pk);c.rm=Math.max(fr,rm);c.t=now})})}
/* what is drawn for pair k, channel i at time now: bar ends as fractions of the meter */
function mixShown(k,i,now){const P=MIXM.pairs[k],c=P.ch[i];return{pk:mpos(mdecay(c.pk,c.t,now)),rm:mpos(mdecay(c.rm,c.t,now)),hd:mpos(mholdAt(c,now)),clip:now-P.clipAt<MCLIP,on:P.on}}
function meterSvg(k,y){const nm=["A/B","C/D","E/F"][k],bar=(i,yy)=>`<rect class="mbg" x="${MX0}" y="${yy}" width="${MXW}" height="3.5"/><rect class="mpk" data-mp="${k}.${i}" x="${MX0}" y="${yy}" width="0" height="3.5"/><rect class="mrm" data-mr="${k}.${i}" x="${MX0}" y="${yy}" width="0" height="3.5"/><rect class="mhd" data-mh="${k}.${i}" x="${MX0}" y="${yy}" width="1.5" height="3.5"/>`;
 return`<g class="mtr" data-mt="${k}"><title>${nm} meter: RMS (solid), peak (pale) and the peak hold, in dBFS from -60 to 0, left over right. Measured on the output, after the volume.</title><rect class="mgnd" x="${MX0-10}" y="${y+4}" width="${MXW+12}" height="9"/>${bar(0,y+4.5)}${bar(1,y+9)}<rect class="mclip" data-mc="${k}" x="${MX0-8}" y="${y+4.5}" width="4.5" height="8"/></g>`}
function mixMeterEls(){const E=MIXM.els;if(E&&E.root.isConnected)return E;const root=document.querySelector("svg.route");if(!root)return MIXM.els=null;
 const one=a=>{const o={};root.querySelectorAll(`[${a}]`).forEach(e=>{o[e.getAttribute(a)]=e});return o};
 return MIXM.els={root,pk:one("data-mp"),rm:one("data-mr"),hd:one("data-mh"),clip:one("data-mc"),grp:one("data-mt")}}
function mixMeterPaint(now,force){const E=mixMeterEls();if(!E)return;if(force)MIXM.drawn="";let key="";
 BUSES.forEach((b,k)=>{const sh=[0,1].map(i=>mixShown(k,i,now));key+=sh.map(x=>[x.pk,x.rm,x.hd,x.clip,x.on].map(v=>typeof v==="number"?Math.round(v*MXW):+v).join(",")).join(";")+"|"});
 if(key===MIXM.drawn)return;MIXM.drawn=key;
 BUSES.forEach((b,k)=>{const P=MIXM.pairs[k];E.grp[k]?.classList.toggle("off",!P.on);
  [0,1].forEach(i=>{const x=mixShown(k,i,now),id=k+"."+i;
   E.pk[id]?.setAttribute("width",(x.pk*MXW).toFixed(1));E.rm[id]?.setAttribute("width",(x.rm*MXW).toFixed(1));
   E.hd[id]?.setAttribute("x",(MX0+Math.max(0,x.hd*MXW-1.5)).toFixed(1));E.hd[id]?.setAttribute("opacity",x.hd>0?"1":"0")});
  E.clip[k]?.classList.toggle("on",mixShown(k,0,now).clip)})}
function mixMeterFrame(){MIXM.raf=0;if(!MIXM.want)return;mixMeterPaint(performance.now());MIXM.raf=requestAnimationFrame(mixMeterFrame)}
/* the host's message: into the state, drawn at once when this page is shown; a message while it is not (a restarted page,
   a host that did not hear the page leave) is answered with off */
function mixLevels(m){if(!MIXM.want){if(HOST.mixMeters)HOST.mixMeters(false);return}mixFeed(m,performance.now());mixMeterPaint(performance.now())}
/* called after every render and when the window hides or shows: the page asks the host for levels only while Mix is on screen */
function mixMetersSync(){const want=S.ws==="mix"&&!document.hidden;
 if(want===MIXM.want){if(want){mixMeterPaint(performance.now(),true);if(!MIXM.raf)MIXM.raf=requestAnimationFrame(mixMeterFrame)}return}
 MIXM.want=want;if(HOST.mixMeters)HOST.mixMeters(want);
 if(want){mixMeterPaint(performance.now(),true);if(!MIXM.raf)MIXM.raf=requestAnimationFrame(mixMeterFrame)}else{if(MIXM.raf)cancelAnimationFrame(MIXM.raf);MIXM.raf=0}}
document.addEventListener("visibilitychange",mixMetersSync);
const mixMeterState=()=>({want:MIXM.want,running:!!MIXM.raf,drawn:!!(MIXM.els&&MIXM.els.root.isConnected),pairs:MIXM.pairs.map(P=>({on:P.on}))});
function routeSvg(){const T=S.tracks,W=1200,NW=140,nx=i=>118+172*i,NY=30,NH=44,by={AB:94,CD:110,EF:126},H=146,BX=110,mono=S.routing==="6xMONO";let h="";
 const IX=6,IY=by.AB-10,IW=78,IH=by.EF-by.AB+20;h+=`<g><rect x="${IX}" y="${IY}" width="${IW}" height="${IH}" rx="3" class="jack"/><text x="${IX+8}" y="${IY+15}" font-size="9">INPUT</text><text x="${IX+8}" y="${IY+IH-9}" font-size="12">A  B</text></g>`;
 BUSES.forEach(b=>{h+=`<line x1="${BX}" y1="${by[b]}" x2="1146" y2="${by[b]}" class="bus ${mono?"dim":""}"/><text x="${BX-4}" y="${by[b]+3}" font-size="8" text-anchor="end">${b}</text>`});
 h+=`<text x="1194" y="${H-3}" font-size="8" text-anchor="end">${mono?"6 X MONO":S.routing==="3xSTEREO"?"3 X STEREO":"3 X STEREO · AB = MIX"}</text>`;
 if(!mono)BUSES.forEach(b=>{h+=`<circle cx="1158" cy="${by[b]}" r="6" class="jack ${busFlow(b).items.length?"live":""}"/><text x="1169" y="${by[b]+4}" font-size="9">${b}</text>`;
  if(S.routing==="3xSTEREO+AB=MIX"&&b!=="AB")h+=`<path d="M1146 ${by[b]} C1130 ${by[b]-8},1130 ${by.AB+6},1146 ${by.AB}" class="cord dash"/>`});
 T.forEach((tr,i)=>{const x=nx(i),fx=isFx(tr.m),sel=i===S.sel;
  if(mono)h+=`<path d="M${x+NW/2} ${NY+NH} L${x+NW/2} ${H-12}" class="cord ${tr.mute?"dash":""}" opacity=".5"/><text x="${x+NW/2+4}" y="${H-3}" font-size="8">OUT ${"ABCDEF"[i]}</text>`;
  BUSES.forEach((b,k)=>{if(!tr.out[b])return;const dx=x+24+k*18;h+=`<line x1="${dx}" y1="${NY+NH}" x2="${dx}" y2="${by[b]}" class="cord ${mono?"dash":""}"/><circle cx="${dx}" cy="${by[b]}" r="4" class="tap"/>`});
  if(fx&&tr.inp?.startsWith("BUS")){const b=tr.inp.slice(4),dx=x+NW-20;h+=`<path d="M${dx} ${by[b]} L${dx} ${NY+NH+6}" class="cord dash"/><path d="M${dx-4} ${NY+NH+8} L${dx} ${NY+NH+2} L${dx+4} ${NY+NH+8}" class="cord"/><circle cx="${dx}" cy="${by[b]}" r="3.5" class="jack"/><text x="${dx-7}" y="${NY+NH+13}" font-size="8" text-anchor="end">IN ${b}</text>`}
  if(fx&&tr.inp==="NEIBOR"&&i>0)h+=`<path d="M${nx(i-1)+NW} ${NY+NH/2} L${x-3} ${NY+NH/2}" class="cord"/><path d="M${x-9} ${NY+NH/2-5} L${x-2} ${NY+NH/2} L${x-9} ${NY+NH/2+5}" class="cord"/><text x="${x-16}" y="${NY-5}" font-size="7" text-anchor="middle">NEIBOR</text>`;
  if(fx&&tr.inp?.startsWith("INP"))h+=`<path d="M${IX+IW} ${by.EF+6} L${x+NW/2-8} ${by.EF+9} Q${x+NW/2} ${by.EF+9},${x+NW/2} ${by.EF}L${x+NW/2} ${NY+NH}" class="cord dash"/><text x="${x+NW/2+6}" y="${NY+NH+13}" font-size="8">${tr.inp}</text>`;
  if(tr.m==="SID-6581"&&i>0&&sv2(tr,"MOD")&&sv2(tr,"MSRC")===1)h+=`<path d="M${nx(i-1)+NW-10} ${NY} C${nx(i-1)+NW} ${NY-18},${x+10} ${NY-18},${x+18} ${NY}" class="cord dot"/><text x="${x-10}" y="${NY-17}" font-size="7">PRCH</text>`;
  if(tr.trigpos!=null){const j=tr.trigpos;h+=`<path d="M${x+NW/2} ${NY} C${x+NW/2} ${NY-24},${nx(j)+NW/2} ${NY-24},${nx(j)+NW/2} ${NY}" class="cord dot"/><text x="${(x+nx(j))/2+NW/2-18}" y="${NY-20}" font-size="7">TRIG ›T${j+1}</text>`}
  h+=`<g class="node ${fx?"fx":""} ${sel?"sel":""} ${audible(i)?"":"muted"}" data-node="${i}"><rect class="body" x="${x}" y="${NY}" width="${NW}" height="${NH}" rx="3"/>${sel?`<rect class="frame" x="${x-4}" y="${NY-4}" width="${NW+8}" height="${NH+8}" rx="5"/>`:""}
   <text x="${x+8}" y="${NY+13}" font-size="9">T${i+1}${fx?" · FX":""}</text><text x="${x+8}" y="${NY+28}" font-size="11">${shortM(tr.m)}</text><text x="${x+8}" y="${NY+39}" font-size="7" opacity=".8">${tr.name.toUpperCase().slice(0,18)}</text></g>`});
 BUSES.forEach((b,k)=>{h+=meterSvg(k,by[b])});
 return`<svg class="route" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" role="img" aria-label="Routing: tracks, mix buses, outputs">${h}</svg>`}
function sv2(tr,n){const i=MACH[tr.m].p.indexOf(n);return i<0?0:tr.v.SYN[i]}
/* A channel strip, top to bottom in signal order (manual 1-26..1-29, 1-33): the sound's own mix values, then PAN,
   then the LEVEL fader at the end of the track's path, then where it goes (OUT buses, IN for an FX machine) and
   M / S. AMP VOL is part of the sound (lockable, LFO-able), so it sits with DIST and DSND as the strip's trim;
   the fader is LEVEL (the LEVEL knob, CC 7), the track's mix level, which can be neither locked nor modulated.
   Every row is the same height on every strip, so the six line up. */
const MIXTIP={
 VOL:"AMP VOL: the voice's volume, part of the sound (AMP page). It comes before LEVEL, can be locked per step and moved by an LFO. Balance tracks with the LEVEL fader; use AMP VOL for movement inside the sound.",
 DIST:"DIST: overload distortion and headroom (AMP page). Below 0 adds headroom: quieter and cleaner.",
 DSND:"DSND: delay send, into this track's own delay (EFFECTS page). Minus keeps the stereo image, plus is ping-pong. 0: no delay.",
 PAN:"PAN: the track's place in the stereo field (AMP page), L64 to R63. Drag sideways, double-click for centre.",
 LEV:"LEVEL: the track's mix level (the LEVEL knob, CC 7), at the end of its path, after AMP VOL. It cannot be locked or modulated."};
const mixBox=(g,n,i,label,tip)=>pc(g,n,{t:i,label,cls:"mini",extra:`title="${tip}"`});
function mixStrip(tr,i){const fx=isFx(tr.m);
 return`<div class="strip6 ${i===S.sel?"sel":""}" data-sel="${i}" style="${audible(i)?"":"opacity:.5"}">
   <div class="shead"><span class="tn">${i+1}</span><b class="mc" title="${tr.name}">${shortM(tr.m)}</b><i class="trigsq" data-trig="${i}" aria-hidden="true" title="Flashes when T${i+1} trigs"></i></div>
   <div class="trim">${mixBox("AMP",5,i,"AMP VOL",MIXTIP.VOL)}${mixBox("AMP",4,i,"DIST",MIXTIP.DIST)}${mixBox("EFX",4,i,"DSND",MIXTIP.DSND)}</div>
   <div class="pc pan hz" role="slider" tabindex="0" data-g="AMP" data-n="6" data-t="${i}" aria-label="T${i+1} PAN" title="${MIXTIP.PAN}"><span>PAN</span><i class="pt"></i><b></b></div>
   <div class="lvl"><div class="scale" aria-hidden="true">${[127,96,64,32,0].map(v=>`<i style="bottom:${v/127*100}%">${v}</i>`).join("")}</div>
    <div class="fader" role="slider" tabindex="0" aria-label="T${i+1} LEVEL" data-g="lev" data-t="${i}" title="${MIXTIP.LEV}"><div class="tr"><i></i></div><div class="cap2"></div><b class="lread" data-show="${i}"></b></div>
    <small class="lcap" title="${MIXTIP.LEV}">LEVEL</small></div>
   <div class="busrow"><span class="inlab">Out</span><div class="busk">${BUSES.map(b=>`<button data-bus="${b}" data-t="${i}" aria-pressed="${tr.out[b]}" title="${tr.out[b]?"Sends to":"Not sent to"} mix bus ${b}">${b}</button>`).join("")}</div></div>
   <div class="busrow"><span class="inlab">In</span>${fx?`<select id="inp${i}" data-inp="${i}" aria-label="T${i+1} input">${tr.inp==null?`<option value="" selected disabled>none</option>`:""}${INPUTS.filter(x=>!(x==="NEIBOR"&&i===0)).map(x=>opt(x,x,tr.inp)).join("")}</select>`:`<button class="kselbtn" disabled title="Only FX machines take an input"><span>synth · none</span></button>`}</div>
   <div class="mrow"><button class="ms m ${ARMED.has(i)?"prep":""}" ${ARMED.has(i)?`data-prep="${ARMED.get(i)?"X":"+"}"`:""} data-mute="${i}" aria-pressed="${tr.mute}" aria-label="Mute T${i+1}">M</button><button class="ms s" data-solo="${i}" aria-pressed="${tr.solo}" aria-label="Solo T${i+1}">S</button></div></div>`}
function renderMix(){const T=S.tracks;
 const flows=BUSES.map(b=>{const f=busFlow(b);return`<span>${b}: ${f.items.join(" + ")||"<i>empty</i>"} <i>›</i> ${outOf(b)}${f.notes.length?" <i>· "+f.notes.join(", ")+"</i>":""}</span>`}).join("");
 $("#main").innerHTML=`<div class="routewrap">
  <div class="strips6 mixrow">${T.map((tr,i)=>mixStrip(tr,i)).join("")}</div>
  <div class="routebar"><span class="cap">Routing</span><span class="seg" data-set="routing">${ROUTES.map(r=>`<button data-v="${r}" aria-pressed="${S.routing===r}">${r.replace("+"," + ")}</button>`).join("")}</span>
   <span class="grow"></span><span class="hint">Tracks sum into a bus in track order, so an FX on a bus only hears the tracks before it. Click a node to pick its strip.</span></div>
  ${routeSvg()}<div class="flowl">${flows}</div></div>`;
 syncControls()}
