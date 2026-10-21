
/* ===== Perform: keyboard modes, multi trig, multi map, multi env, assign, mutes ===== */
const PMODES=[["normal","Auto track","Keys play the track in focus (AUTO TRACK channel 9)."],["multi","Multi trig","One source plays all six tracks as one big mono synth (channel 7)."],["map","Multi map","Key ranges start patterns, with offset, length and transpose (channel 8)."],["poly","Poly","All six engines play the track in focus with six voices. Other tracks go quiet."]];
/* 0.6 wave 9 (B-064), measured (PROBES-manual-gaps.md P10): POLY plays the machine's track in focus, the one selected
   here (HOST.keyMode presses its TRACK key); the MULTI ENV per MULTI TRIG mode */
function polyHint(t){return`POLY: T${t+1} plays six voices (TRACK ${t+1} on the machine); the other five tracks are silent, notes on their channels too. The sequencer plays T${t+1}'s chord notes. Select another track to move POLY there (its first chord can sound as one note).`}
const MENV_SAY=["shapes the notes of the MULTI TRIG channel, which play all six tracks. After such a note, with REL under 127, every track stays silent until the next one or STOP.",
 "no effect in this mode. The envelope works in ALL TRK, SEQ START and SEQ TRNSP (Multi trig under Keyboard).",
 "shapes the pattern a MULTI TRIG note starts. After that note, with REL under 127, every track stays silent until the next one or STOP.",
 "shapes the pattern a MULTI TRIG note starts and transposes. After that note, with REL under 127, every track stays silent until the next one or STOP."];
function menvHint(){const m=S.multi.mode,play=S.mode!=="multi"&&m!==1;
 return`<b>${MTM[m]}:</b> ${MENV_SAY[m]}${play?` <span class="menvto">The keys play ${{normal:"AUTO TRACK",map:"MULTI MAP",poly:"POLY"}[S.mode]} now: choose <b>Multi trig</b> under Keyboard to hear it.</span>`:""}`}
const MTM=["ALL TRK","SPLIT KEY","SEQ START","SEQ TRNSP"],TIMS=["DIRECT","1/16","2/16","4/16","8/16","16/16","32/16"];
const isBlack=n=>[1,3,6,8,10].includes(n%12);
/* the on-screen keyboard: four octaves from C (MIDI 0 at the lowest stop), the last stop cut at note 127 (I-040). Keep the same key width at that stop (B-177) */
const KBOCT=[-1,6],KB_WHITE_COUNT=28;
function kbRange(){const lo=12*(S.kbOct+1);return[lo,Math.min(lo+47,127)]}
function zoneOf(n){if(S.mode!=="multi"||S.multi.mode!==1)return null;return n>=S.multi.splitKey?"up":"lo"}
function mapRow(n){let lo=0;for(let i=0;i<S.mmap.length;i++){const r=S.mmap[i];if(n>=lo&&n<=r.hi)return i;lo=r.hi+1}return -1}
function renderKb(){const[lo,hi]=kbRange(),whites=[];for(let n=lo;n<=hi;n++)if(!isBlack(n))whites.push(n);const ww=100/KB_WHITE_COUNT;let h="",wi=0;
 for(let n=lo;n<=hi;n++){if(isBlack(n)){h+=`<div class="b${kbLit(n)}" data-key="${n}" style="left:${wi*ww-ww*.3}%;width:${ww*.6}%" aria-label="${noteName(n)}"></div>`;continue}
  h+=`<div class="w${kbLit(n)}" data-key="${n}" style="left:${wi*ww}%;width:${ww}%" aria-label="${noteName(n)}">${n%12===0?`<small>${noteName(n)}</small>`:""}</div>`;wi++}
 if(S.mode==="multi"&&S.multi.mode===1){const sk=S.multi.splitKey;let idx=whites.findIndex(w=>w>=sk);if(idx<0)idx=whites.length;const x=idx*ww;
  h+=`<div class="zone" style="left:0;width:${x}%;background:var(--ledg)"></div><div class="zone" style="left:${x}%;width:${whites.length*ww-x}%;background:var(--led)"></div><div class="splitm" id="splitm" style="left:${x}%" title="Drag the split point"><span>SPLIT ${noteName(sk)} · T${S.multi.splitTrack}-6 above</span></div>`}
 return h}
function mapBands(){const[lo,hi]=kbRange(),whites=[];for(let n=lo;n<=hi;n++)if(!isBlack(n))whites.push(n);const ww=100/KB_WHITE_COUNT,xOf=n=>{let i=whites.findIndex(w=>w>=n);if(i<0)i=whites.length;return i*ww};let from=0;
 return S.mmap.map((r,i)=>{const a=Math.max(from,lo),b=Math.min(r.hi,hi);from=r.hi+1;if(b<lo||a>hi)return"";const x0=xOf(a),x1=xOf(b+1);return`<div class="band ${i===S.mmapSel?"sel":""}" data-band="${i}" style="left:${x0}%;width:${Math.max(2,x1-x0)}%">${r.pat<0?"CUR":patName(r.pat)}${r.trn!==0&&r.trn!==64?"":""}</div>`}).join("")}
/* The multi envelope as an ADSR (review 1, 2026-10-12: the old one drew REL 127 as a flat line with its dot left at the
   foot). Each stage has its own slot across the screen: ATK rises from 0 to the top, DEC falls to SUS, SUS holds, REL
   falls to 0; REL 127 is ∞ (the level holds until the next note), drawn as the sustain running on to the edge, dashed
   past its slot, with ∞. Every dot is on the curve. */
const MENV_G=W=>({a:W*.22,d:W*.22,hold:W*.16,r:W*.3});
function menvGeo(W,H){const e=S.menv,T=30,B=H-12,y=v=>B-v*(B-T),M=MENV_G(W),x0=4,ax=x0+e.ATK/127*M.a,dx=ax+e.DEC/127*M.d,s=e.SUS/127,hx=dx+M.hold,inf=e.REL>=127,rx=inf?hx+M.r:hx+e.REL/126*M.r;
 return{e,T,B,y,M,x0,ax,dx,s,hx,rx,inf}}
ED.menv={draw(g,W,H){const G=menvGeo(W,H),ink=cssv("--ink");grid(g,W,H);
  g.strokeStyle=ink;g.lineWidth=2;g.lineJoin="round";g.beginPath();g.moveTo(G.x0,G.y(0));g.lineTo(G.ax,G.y(1));g.lineTo(G.dx,G.y(G.s));g.lineTo(G.hx,G.y(G.s));
  if(G.inf){g.lineTo(G.rx,G.y(G.s));g.stroke();g.setLineDash([4,3]);g.beginPath();g.moveTo(G.rx,G.y(G.s));g.lineTo(W,G.y(G.s));g.stroke();g.setLineDash([]);
   g.fillStyle=ink;g.font="13px Silkscreen, monospace";g.fillText("∞",Math.min(W-14,G.rx+6),G.y(G.s)+(G.s>.85?16:-6))}
  else{g.lineTo(G.rx,G.y(0));g.stroke()}
  g.strokeStyle=inkA(.35);g.lineWidth=1;g.setLineDash([2,3]);g.beginPath();g.moveTo(G.hx+.5,G.T);g.lineTo(G.hx+.5,G.B);g.stroke();g.setLineDash([]);
  label(g,"ADSR over all tracks"+(G.inf?" · REL ∞":""))},
 handles(W,H){const G=menvGeo(W,H),e=G.e;return[{x:Math.max(G.x0+2,G.ax),y:G.y(1),k:"ATK",drag:x=>e.ATK=clamp(Math.round((x-G.x0)/G.M.a*127))},
  {x:G.dx,y:G.y(G.s),k:"DEC · SUS",drag:(x,yy)=>{e.DEC=clamp(Math.round((x-G.ax)/G.M.d*127));e.SUS=clamp(Math.round((G.B-yy)/(G.B-G.T)*127))}},
  {x:G.rx,y:G.inf?G.y(G.s):G.y(0),k:G.inf?"REL ∞":"REL",drag:x=>{const v=(x-G.hx)/G.M.r*126;e.REL=v>=126.5?127:clamp(Math.round(v),0,126)}}]}};
const ASG_SAY={"JOY RL":"Tabletop: pitch bend. MIRR off = right only.","JOY U":"Tabletop: mod wheel (CC 1).","JOY D":"Tabletop: breath controller (CC 2).",VEL:"Velocity from the keys. The sequencer always plays velocity 100.",KEY:"Follows the last key: low for C-1, near max for C-8."};
function asgT(){return S.sel<6?S.sel:S.sel-6}
function renderPerform(){const pm=PMODES.find(p=>p[0]===S.mode),t=asgT(),tr=S.tracks[t],A=tr.assign,rows=A.tabs[S.asTab];
 const mtCtl=S.mode==="multi"?`<span class="seg" data-set="mtmode">${MTM.map((m,i)=>`<button data-v="${i}" aria-pressed="${S.multi.mode===i}">${m}</button>`).join("")}</span>
   ${S.multi.mode===1?`<span class="stepper"><span class="ilab">Upper from</span><button data-strk="-1">−</button><b class="mono">T${S.multi.splitTrack}</b><button data-strk="1">+</button></span>`:""}
   ${S.multi.mode>=2?`<span class="stepper"><span class="ilab">Timing</span><button data-tim="-1">−</button><b class="mono">${TIMS[S.multi.timing]}</b><button data-tim="1">+</button></span>`:""}`:"";
 const asRow=(r,k)=>`<div class="asrow"><b>${k+1}</b><span class="lgw"${lgAttr(`T${t+1} ASSIGN ${ASN[S.asTab]} ${k+1} PAGE`)}><select id="asp${k}" aria-label="Assign ${k+1} page">${[...PAGES,"PTCH"].map(p=>opt(LPAGES.indexOf(p),p,r.pg)).join("")}</select></span><span class="lgw"${lgAttr(`T${t+1} ASSIGN ${ASN[S.asTab]} ${k+1} DEST`)}><select id="asd${k}" aria-label="Assign ${k+1} destination">${destNames(t,r.pg).map((d,i)=>opt(i,d,r.d)).join("")}</select></span>${pc("asg",k,{t,label:"ADD"})}</div>`;
 const joy=S.asTab.startsWith("JOY");
 const selTrack=`<span class="seg trksel" data-set="astrk">${[0,1,2,3,4,5].map(k=>{const p=S.mode==="poly";return`<button data-v="${k}" aria-pressed="${k===t}"${p?` class="${k===t?"polyt":"polyoff"}" title="${k===t?`T${k+1} plays POLY: six voices`:`Silent in POLY. Click: T${k+1} plays POLY instead`}"`:""}><b>T${k+1}</b><small>${shortM(S.tracks[k].m)}</small>${p&&k===t?`<em class="x6">×6</em>`:""}</button>`}).join("")}</span>`;
 const tabsH=`<span class="seg" data-set="astab">${Object.keys(A.tabs).map(k=>`<button data-v="${k}" aria-pressed="${S.asTab===k}">${k}</button>`).join("")}</span>`;
 const extrasH=`${S.asTab==="JOY RL"?`<button class="lkey" data-mirr="1"${lgAttr(`T${t+1} ASSIGN MIRROR`)} aria-pressed="${A.mirr}" title="Left = −right"><i class="led"></i>MIRR (left = −right)</button>`:""}
    ${S.asTab==="KEY"?`<span class="keyrow"><button class="lkey" data-ktrk="hpf"${lgAttr(`T${t+1} ASSIGN HPF`)} aria-pressed="${A.hpf}"><i class="led"></i>HPF tracks keys</button><button class="lkey" data-ktrk="lpf"${lgAttr(`T${t+1} ASSIGN LPF`)} aria-pressed="${A.lpf}"><i class="led"></i>LPF tracks keys</button></span>`:""}`;
 const hintH=`<div class="hint onel" title="${ASG_SAY[S.asTab]} ADD −64…+63.">${ASG_SAY[S.asTab]} ADD −64…+63.</div>`;
 const padH=`${joy?`<div class="joy" id="joy" title="Drag the stick. It springs back."><span class="cross"></span><span class="cross2"></span><small class="jl">L</small><small class="jr">R</small><small class="ju">U</small><small class="jd">D</small><span class="knobj" id="knobj" style="left:${50+S.joy.x*42}%;top:${50-S.joy.y*42}%"></span></div>`
     :`<div class="joy padinfo"><b>${S.asTab}</b><span>${ASG_SAY[S.asTab]}</span></div>`}`;
 const rowsH=`<div class="asrows">${rows.map(asRow).join("")}</div>`;
 const menvH=`<section class="card menvcard"><header><h3>Multi envelope</h3><span title="Both DATA PAGE keys on the machine. Its effect depends on the kit's MULTI TRIG mode">all tracks · ${MTM[S.multi.mode]}</span></header><div class="menvplot"><canvas class="ed" data-ed="menv" aria-label="Multi envelope. Drag the dots."></canvas></div>
    <div class="ctl" style="grid-template-columns:repeat(5,minmax(0,1fr))">${["ATK","DEC","SUS","REL","PORT"].map(n=>pc("menv",n,{})).join("")}</div>
    <div class="hint menvsay" title="${menvHint().replace(/<[^>]+>/g,"")} On top of every track's own envelope. For no effect: ATK 0, DEC, SUS and REL at 127.">${menvHint()}</div></section>`;
 const mutesH=`<section class="card mutecard"><header><h3>Mutes</h3><span title="FUNCTION + BANK GROUP on the machine">global</span></header>
    <div class="mutelab">Synth tracks</div><div class="mutes12">${S.tracks.map((x,i)=>`<button class="${x.mute?"":"on"}" data-gmute="${i}" aria-pressed="${!x.mute}" title="T${i+1} ${x.m}"><i class="led"></i>T${i+1}</button>`).join("")}</div>
    <div class="mutelab">MIDI tracks</div><div class="mutes12">${S.midi.map((x,i)=>`<button class="${x.mute?"":"on"}" data-gmute="${i+6}" aria-pressed="${!x.mute}" title="M${i+1} CH${x.ch}"><i class="led"></i>M${i+1}</button>`).join("")}</div>
    <div class="hint">Mutes work on notes: a sound already playing rings out.</div>
</section>`;
 const scope=(w,tip)=>`<span class="scope" title="${tip}">${w}</span>`;
 const upper=`<div class="perf3">${menvH}
   <section class="card trkcard"><header><h3>Track</h3>${scope(shortM(tr.m),"These settings belong to the selected track")}</header>${selTrack}${tabsH}${padH}${rowsH}${extrasH}${hintH}</section>
   <div class="perfside">${mutesH}<section class="card kbcard"><header><h3>Keyboard</h3><span title="What the keys below play">plays · all keys</span></header>  <div class="perfbar kbtitle"><span class="keyrow">${PMODES.map(([k,n])=>`<button class="lkey" data-pmode="${k}" aria-pressed="${S.mode===k}"><i class="led"></i>${n}</button>`).join("")}</span>${mtCtl}
   <span class="stepper" style="margin-left:auto"><span class="ilab">Octave</span><button data-kboct="-1" aria-label="Octave down"${S.kbOct<=KBOCT[0]?" disabled":""}>−</button><b class="mono">${noteName(kbRange()[0])}</b><button data-kboct="1" aria-label="Octave up"${S.kbOct>=KBOCT[1]?" disabled":""}>+</button></span></div>
  <div class="hint kbhint">${S.mode==="poly"?polyHint(t):pm[2]} ${S.mode==="multi"?{0:"Notes go to all six tracks; each keeps its own arpeggiator.",1:`Keys from ${noteName(S.multi.splitKey)} play T${S.multi.splitTrack}-T6, keys below play T1-T${S.multi.splitTrack-1}. The multi envelope is not used here.`,2:"Each note restarts the pattern, transposed from C-4.",3:"The first note starts the pattern; later notes only transpose it, so the loop never breaks."}[S.multi.mode]:""}</div></section></div></div>`;
 $("#main").innerHTML=`<div class="perf ${S.mode==="map"?"map":""}">
  ${upper}

  ${S.mode==="map"?`<section class="card maprow"><header><h3>Multi map</h3><span>GLOBAL › CONTROL › MULTIMAP EDIT · stored in the global slot</span></header>
   <table class="mmap"><thead><tr><th>Range</th><th>Pattern</th><th>Offset</th><th>Length</th><th>Transpose</th><th>Timing</th><th></th></tr></thead><tbody>${(()=>{let lo=0;return S.mmap.map((r,i)=>{const a=lo;lo=r.hi+1;return`<tr class="${i===S.mmapSel?"sel":""}" data-mrow="${i}"><td class="mono">${noteName(a)} – <span class="stepper"><button data-mhi="-1" data-i="${i}" ${i===S.mmap.length-1?"disabled":""}>−</button><b class="mono">${i===S.mmap.length-1?"G-9":noteName(r.hi)}</b><button data-mhi="1" data-i="${i}" ${i===S.mmap.length-1?"disabled":""}>+</button></span></td>
    <td><select id="mpat${i}" data-mpat="${i}" aria-label="Pattern">${opt(-1,"CUR",r.pat)}${Array.from({length:128},(_,p)=>opt(p,patName(p),r.pat)).join("")}</select></td><td style="width:90px">${pc("mmap","ofs",{extra:`data-i="${i}"`,label:"OFS"})}</td><td style="width:90px">${pc("mmap","len",{extra:`data-i="${i}"`,label:"LEN"})}</td><td style="width:90px">${pc("mmap","trn",{extra:`data-i="${i}"`,label:"TRN"})}</td><td style="width:90px">${pc("mmap","tim",{extra:`data-i="${i}"`,label:"TIM"})}</td>
    <td><button class="iconkey" data-mdel="${i}" aria-label="Delete range" title="Delete range (FUNCTION + UP)" ${S.mmap.length<2?"disabled":""}>×</button></td></tr>`}).join("")})()}</tbody></table>
   <div class="btnrow"><button data-madd="1">Split selected range</button><span class="hint">A range's lower key is the key after the one above. LEN needs an offset first. Timing waits for a bar line.</span></div></section>`:""}

  <div class="kbsec">
  <div class="kbwrap">${S.mode==="map"?`<div class="mapbands">${mapBands()}</div>`:""}<div class="kb" id="kb">${renderKb()}</div>
   <div class="trklamps" id="trklamps">${S.tracks.map((x,i)=>{const p=S.mode==="poly";return`<span${p?` class="${i===t?"polyt":"polyoff"}" title="${i===t?"Six voices in POLY":"Silent in POLY"}"`:""}><i class="led" data-lamp="${i}"></i>T${i+1} ${shortM(x.m)}${p&&i===t?`<em class="x6">×6</em>`:""}</span>`}).join("")}<span class="hint" id="kbinfo" style="margin-left:auto">Click or drag across the keys to play.</span></div></div>
  </div></div>`;
 /* the cards keep their hints in view (tipify went with the Sound page's groups) */
 syncControls();redraw()}
let kbDown=null,lampT={};
function flashTracks(ts){ts.forEach(i=>{const l=$(`[data-lamp="${i}"]`);if(!l)return;l.classList.add("on");clearTimeout(lampT[i]);lampT[i]=setTimeout(()=>l.classList.remove("on"),160)})}
/* B-062, I-002: the keys lit, one state the keyboard is drawn from (so a render during a hold keeps it): dn the key the
   mouse holds and those the computer keyboard holds (KB.held), mi those a MIDI keyboard holds (the plug-in's midiHeld) */
const KBLIT={mouse:null,midi:new Set()};
function kbLit(n){return(KBLIT.mouse===n||[...KB.held.values()].some(h=>h.n===n)?" dn":"")+(KBLIT.midi.has(n)?" mi":"")}
function paintKb(){$$("canvas.roll[data-big]").forEach(drawEd);$$(".kb [data-key]").forEach(k=>{const c=kbLit(+k.dataset.key);k.classList.toggle("dn",c.includes("dn"));k.classList.toggle("mi",c.includes("mi"))})}
function setMidiHeld(notes){KBLIT.midi=new Set(notes||[]);paintKb()}
/* a key shown held by the mouse (null: none) and the keyboard's info line (null: unchanged) */
function setKeyDown(n,info){KBLIT.mouse=n;paintKb();const el=$("#kbinfo");if(el&&info!=null)el.textContent=info}
function playKey(n){if(HOST.playKey)return HOST.playKey(n);setKeyDown(n,null);let ts=[],msg="";
 if(S.mode==="normal"||S.mode==="poly"){const t=asgT();ts=[t];msg=`${S.mode==="poly"?"POLY ":""}T${t+1} ${noteName(n)}`}
 else if(S.mode==="multi"){const m=S.multi.mode;if(m===0){ts=[0,1,2,3,4,5];msg=`All tracks ${noteName(n)}`}else if(m===1){const up=n>=S.multi.splitKey,a=S.multi.splitTrack-1;ts=up?[0,1,2,3,4,5].filter(i=>i>=a):[0,1,2,3,4,5].filter(i=>i<a);msg=`${up?"Upper":"Lower"} zone ${noteName(n)}`}
  else{S.mtTrn=n-60;msg=`${m===2?"Restart":"Transpose"} pattern ${S.mtTrn>=0?"+":""}${S.mtTrn}${S.multi.timing?" at the next "+TIMS[S.multi.timing]:""}`;if(!S.playing)togglePlay();else if(m===2){S.step=-1}ts=[0,1,2,3,4,5]}}
 else{const i=mapRow(n);if(i>=0){const r=S.mmap[i];S.mmapSel=i;msg=`${noteName(n)} › ${r.pat<0?"current":patName(r.pat)} from step ${r.ofs+1}${r.len?", "+r.len+" steps":""}${r.trn!==64&&r.trn?"":""}`;$$(".band").forEach(b=>b.classList.toggle("sel",+b.dataset.band===i))}}
 flashTracks(ts);setKeyDown(n,msg)}
