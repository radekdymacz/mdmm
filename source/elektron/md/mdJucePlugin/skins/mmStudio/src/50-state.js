
/* ===== State ===== */
const $=q=>document.querySelector(q),$$=q=>[...document.querySelectorAll(q)];
function clamp(v,a=0,b=127){return Math.max(a,Math.min(b,v))}
const newArp=()=>({MODE:0,PLAY:1,SPD:6,RNGE:1,OJMP:0,amp:1,flt:1,lfo:1,len:8,rhy:Array(16).fill(true),ofs:Array(16).fill(0)});
const newAssign=()=>({mirr:true,hpf:true,lpf:true,tabs:{"JOY RL":[{pg:3,d:1,add:88},{pg:2,d:5,add:64}],"JOY U":[{pg:5,d:7,add:94},{pg:3,d:3,add:64}],"JOY D":[{pg:3,d:0,add:40},{pg:2,d:5,add:64}],VEL:[{pg:2,d:5,add:84},{pg:3,d:7,add:64}],KEY:[{pg:3,d:0,add:64},{pg:3,d:1,add:64}]}});
function synDefaults(m){const p=MACH[m].p;return Array.from({length:8},(_,i)=>{const n=p[i];if(!n)return 0;if(n==="TUNE")return 64;if(n==="INP")return 100;if(n==="MIX")return 64;return({UNIL:40,UNIW:20,UNIX:0,SUB1:30,PW:64,VOC1:64,VOC2:64,"V-SW":1,CVOL:100,LP:127,GATE:127,DEC:64,"1ENV":80,TONE:64})[n]??0})}
function newTrack(m,name){return{m,name,v:{SYN:synDefaults(m),AMP:[...DEFV.AMP],FLT:[...DEFV.FLT],EFX:[...DEFV.EFX],LF1:[...DEFV.LFO],LF2:[...DEFV.LFO],LF3:[...DEFV.LFO]},
 lev:100,out:{AB:true,CD:false,EF:false},inp:"NEIBOR",mute:false,solo:false,steps:Array(64).fill(null),slide:new Set(),swing:new Set([1,3,5,7,9,11,13,15].flatMap(x=>[x,x+16,x+32,x+48])),
 arp:newArp(),tr:{TRACK:64,SCALE:0,KEY:0},trigpos:null,port:0,leg:{amp:1,flt:1,lfo:1},assign:newAssign()}}
function newMidi(ch){return{m:"MIDI",name:"MIDI "+ch,ch,v:{MID:[...DEFV.MID]},cc:[74,71,1,10],mute:false,solo:false,steps:Array(64).fill(null),slide:new Set(),swing:new Set([1,3,5,7,9,11,13,15].flatMap(x=>[x,x+16,x+32,x+48])),arp:newArp(),tr:{TRACK:64,SCALE:0,KEY:0}}}
const note=(n,bits=[1,1,1])=>({n:Array.isArray(n)?n:[n],a:bits[0],f:bits[1],l:bits[2]});

const S={ws:"seq",sel:0,side:"int",len:16,mult:"1X",swingAmt:50,playing:false,step:-1,bpm:120,pat:0,kit:0,kitState:"clean",queued:null,trigSel:"ALL",
 lane:"FLT.1",lanePage:"FLT",locks:new Map(),patTrn:64,routing:"3xSTEREO+AB=MIX",glob:{slot:0,base:0,span:6,auto:8,multiTrig:6,multiMap:7,clockIn:false,transportIn:false},plate:"mk2",engine:"emu",pend:0,patSent:"live",rec:false,
 mode:"normal",songs:{names:Array(24).fill(""),rows:Array(24).fill(0),slot:0,current:0},multi:{mode:0,splitKey:60,splitTrack:3,timing:4},menv:{ATK:0,DEC:127,SUS:127,REL:127,PORT:0},kbOct:3,
 mmap:[{hi:47,pat:0,ofs:0,len:0,trn:64,tim:4},{hi:59,pat:1,ofs:0,len:16,trn:64,tim:4},{hi:71,pat:0,ofs:0,len:0,trn:69,tim:4},{hi:127,pat:2,ofs:8,len:8,trn:64,tim:1}],mmapSel:1,
 gmutes:null,rollLo:36,ghost:true,asTab:"JOY RL",joy:{x:0,y:0},
 /* whether the machine takes input (machine.input); null while no host has said (the standalone
    mockup, which has no host), so engReady() falls back to the engine label (S.eng) */
 input:null};
/* The page starts empty, as MMView.startEmpty leaves it (130-main.js): six sine tracks, no notes, no locks, every
   pattern on kit 1. The machine's documents fill it (MMView.show); the browser mockup's example is its own
   (doc/modern-ux/mm-mockup/demo/126-example.js), never the plug-in's. */
S.tracks=Array.from({length:6},()=>newTrack("GND-SIN",machName("GND-SIN")));
S.midi=[1,2,3,4,5,6].map(k=>newMidi([10,3,4,5,6,7][k-1]));
S.patKit=Array(128).fill(0);

/* ===== Model helpers ===== */
const trk=t=>t<6?S.tracks[t]:S.midi[t-6];
const isMidiT=t=>t>=6;
const tLabel=t=>t<6?"T"+(t+1):"M"+(t-5);
function side(){return(S.ws==="seq"||S.ws==="sound")&&S.side==="midi"?[6,7,8,9,10,11]:[0,1,2,3,4,5]}
function pagesOf(t){return isMidiT(t)?["MID"]:PAGES}
function pnames(t,pg){if(pg==="SYN")return MACH[trk(t).m].p;return FIXED[pg]}
function pname(t,pid){const[pg,i]=pid.split(".");return pnames(t,pg)[+i]||null}
function pidLabel(t,pid){const[pg]=pid.split(".");return pg+" "+pname(t,pid)}
function destNames(t,pidx){const pg=LPAGES[pidx];if(pg==="PTCH")return PTCHD;if(pg==="MID")return FIXED.MID;const a=[...pnames(t,pg)].map(n=>n||"—");while(a.length<8)a.push("—");return a}
function meta(t,pg,i){const tr=trk(t),name=pnames(t,pg)[i];
 if(pg.startsWith("LF")){if(i===0)return{name,en:LPAGES};if(i===1)return{name,en:destNames(t,tr.v[pg][0])};if(i===2)return{name,en:LTRIG};if(i===3)return{name,en:LWAVE};if(i===4)return{name,en:LMULT};return{name,max:127}}
 if(pg==="SYN"){const en=EN[tr.m+"."+name]||EN[name];if(en)return{name,en};if(tr.m==="DPRO-WAVE"&&name==="WAVE")return{name,max:31}}
 return{name,max:127,signed:SIGNED.has(name)||(pg==="SYN"&&/^PCH/.test(name))}}
/* LEN (P7): a click steps a page and goes round (16 32 48 64 16 ...), shift-click back; a scroll one step, 2-64.
   It used to stop at 64: a click on the factory patterns' LEN 64 did nothing. */
function lenStep(len,d,fine){if(fine)return clamp(len+d,2,64);const p=Math.ceil(len/16)+d;return(((p-1)%4+4)%4+1)*16}
const maxOf=m=>m.en?m.en.length-1:m.max;
function fmt(m,v){if(v==null)return"—";if(m.en)return m.en[clamp(v,0,m.en.length-1)];if(m.signed){const d=v-64;return(d>0?"+":"")+d}return String(v)}
function getP(t,pid){const[pg,i]=pid.split(".");return trk(t).v[pg]?.[+i]}
function lkKey(t,pid){return t+"|"+pid}
function setLock(t,pid,s,v,quiet){const k=lkKey(t,pid);if(!S.locks.has(k)){if(S.locks.size>=62){if(!quiet)toast("All 62 locked parameters are in use. Clear one before you lock a new parameter.");return false}S.locks.set(k,new Map())}S.locks.get(k).set(s,v);return true}
function stepLocked(t,s){for(const[k,m] of S.locks)if(+k.split("|")[0]===t&&m.has(s))return true;return false}
function trackLockPids(t){return[...S.locks.keys()].filter(k=>+k.split("|")[0]===t).map(k=>k.split("|")[1])}
function clearStepLocks(t,s){for(const[k,m] of [...S.locks])if(+k.split("|")[0]===t){m.delete(s);if(!m.size)S.locks.delete(k)}}
function audible(t){const all=[...S.tracks,...S.midi],any=all.some(x=>x.solo);return any?trk(t).solo:!trk(t).mute}
function stepKind(st){if(!st)return null;if(st.off)return"off";if(st.a&&st.f&&st.l)return"full";if(!st.a&&!st.f&&!st.l)return"trigless";return"part"}
/* LED colour the way the hardware shows it for the current TRIG SELECT */
function lampOf(t,st){if(!st)return"";if(st.off)return"y";if(isMidiT(t))return"r";const k=S.trigSel;if(k==="ALL")return stepKind(st)==="full"?"r":"g";const b={AMP:"a",FLT:"f",LFO:"l"}[k];return st[b]?"r":"g"}
function lastNote(t,s){const tr=trk(t);for(let k=s-1;k>=-S.len;k--){const st=tr.steps[(k+S.len)%S.len];if(st?.n)return st.n[0]}return isMidiT(t)?60:48}
const patName=p=>"ABCDEFGH"[p>>4]+String((p&15)+1).padStart(2,"0");
const kitName=k=>"K"+String(k+1).padStart(2,"0")+" "+((k===S.kit?S.workName:S.kits[k].name)||"EMPTY");
