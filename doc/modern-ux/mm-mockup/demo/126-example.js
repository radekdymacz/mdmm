/* ===== The browser mockup's example (doc/modern-ux/mm-mockup, build.sh; a demo part of skins/mmStudio/src/page.txt) =====
   The page starts empty (50-state.js, as MMView.startEmpty); on its own the mockup plays an example built from the
   manual's own tips: the example kit and pattern, the MIDI tracks' notes, its kit library (eight named kits, made of
   the example kit) and patterns A01-A08 (variations of A01), a song, the song slots' names, and the Control
   workspace's app sources and links. Its documents are demo-docs.json (54-demo.js shows them); this is the library,
   song slots and Control setup around them. After 125-lib.js, before the page draws (130-main.js). Never in the
   plug-in's page. */
(()=>{
S.tracks=[newTrack("SWAVE-SAW","Bass"),newTrack("FX-CHORUS","Bass chorus"),newTrack("SID-6581","Arp lead"),newTrack("VO-6","Monomachine"),newTrack("DPRO-BBOX","Drums"),newTrack("FX-REVERB","Room")];
S.midi[0].name="Drum machine";S.midi[1].name="Poly pad";
S.patKit=Array.from({length:128},(_,p)=>p===2?1:p===5?2:p>=16?p%128:0);
S.len=32;S.swingAmt=58;
S.songs={names:["DEMO SONG","ACID LIVE","VOCODER JAM",...Array(21).fill("")],rows:[8,20,7,...Array(21).fill(0)],slot:0,current:0};
/* Example kit + pattern, built from the manual's own tips */
(()=>{const T=S.tracks;
 /* 1: SuperWave bass. The manual's "synth-bass bump": WDTH ~64, WOFS ~32, LPQ up. Outputs off: track 2 processes it. */
 T[0].v.SYN=[60,18,24,0,0,40,20,64];T[0].v.AMP=[0,4,16,24,72,104,64,0];T[0].v.FLT=[6,64,0,70,0,44,0,32];T[0].v.EFX=[64,64,0,48,64,0,0,127];T[0].out={AB:false,CD:false,EF:false};
 T[0].v.LF1=[3,1,1,0,1,32,0,20];
 const bass=[[0,36],[3,36],[6,48],[8,36],[10,39],[11,36],[14,43],[16,36],[19,36],[22,48],[24,34],[26,41],[27,34],[30,46]];
 bass.forEach(([s,n])=>T[0].steps[s]=note(n,[1,1,s%16===0?1:0]));T[0].steps[12]={off:1};T[0].steps[28]={off:1};T[0].slide=new Set([8,24]);
 /* 2: FX chorus on the bass (NEIBOR). One trig opens it; DEC and REL at 127 let the audio through. */
 T[1].inp="NEIBOR";T[1].v.SYN=[40,50,30,70,20,100,110,100];T[1].v.AMP=[0,127,127,127,64,110,64,0];T[1].steps[0]=note(60);
 /* 3: SID arp: the manual's "computer game" chords: low SPD, SID mode, envelope trigs off. */
 T[2].v.SYN=[80,30,1,2,0,0,0,64];T[2].v.AMP=[0,60,70,40,64,80,50,0];T[2].v.FLT=[20,90,0,30,0,50,0,0];T[2].v.EFX=[64,64,0,24,-40+64,50,10,100];
 T[2].v.LF1=[0,0,0,0,2,64,0,6];T[2].v.LF2=[5,7,1,4,0,16,0,40];
 [[0,[60,63,67]],[8,[56,60,63]],[16,[53,56,60]],[24,[55,59,62]]].forEach(([s,ch])=>T[2].steps[s]=note(ch));
 Object.assign(T[2].arp,{MODE:2,PLAY:1,SPD:3,RNGE:2,OJMP:0,amp:0,flt:0,lfo:0,len:8});T[2].arp.ofs=[0,0,12,0,0,7,0,-12,0,0,0,0,0,0,0,0];T[2].arp.rhy[3]=false;
 /* 4: VO-6 spells "monomachine" (the manual's tutorial): mo, no, ma, shi, n. */
 T[3].v.SYN=[35,5,1,0,9,5,100,64];T[3].v.AMP=[0,0,127,0,64,110,64,0];T[3].out={AB:false,CD:true,EF:false};
 [0,3,6,9,12].forEach(s=>T[3].steps[s]=note(41));T[3].steps[5]={off:1};
 [[16,19,22,25,28]].forEach(a=>a.forEach(s=>T[3].steps[s]=note(41)));T[3].steps[21]={off:1};
 /* 5: DigiPRO BeatBox. The key picks the drum. Transpose SCALE = FIX keeps it out of song and multi-trig transposes. */
 T[4].v.SYN=[64,0,0,0,0,0,0,0];T[4].v.AMP=[0,60,60,30,70,100,64,0];T[4].tr.SCALE=1;
 const dr={0:48,2:56,4:49,6:56,8:48,10:48,12:49,14:57,16:48,18:56,20:49,22:56,24:48,26:56,28:49,29:49,30:49,31:49};Object.entries(dr).forEach(([s,n])=>T[4].steps[+s]=note(n));
 /* 6: Gate reverb as an insert on mix bus AB: only tracks 1-5 on AB reach it. */
 T[5].inp="BUS AB";T[5].v.SYN=[60,50,70,40,20,110,0,100];T[5].v.AMP=[0,127,127,127,64,100,64,0];T[5].steps[0]=note(60);
 /* MIDI track 2: pad chords with real lengths */
 const M=S.midi[1];M.v.MID=[96,90,64,0,40,0,0,0];M.steps[0]=note([48,51,55,58]);M.steps[16]=note([44,48,51,55]);
 S.midi[0].steps[0]=note(36);S.midi[0].steps[8]=note(36);
 const L=(t,pid,pairs)=>pairs.forEach(([s,v])=>setLock(t,pid,s,v,true));
 L(0,"FLT.1",[[0,40],[8,96],[16,40],[24,110]]);
 L(3,"SYN.0",[[0,35],[3,35],[6,127],[9,40],[12,40],[16,35],[19,35],[22,127],[25,40],[28,40]]);
 L(3,"SYN.1",[[0,5],[3,5],[6,60],[9,110],[12,110],[16,5],[19,5],[22,60],[25,110],[28,110]]);
 L(3,"SYN.4",[[0,9],[3,10],[6,9],[9,15],[12,10],[16,9],[19,10],[22,9],[25,15],[28,10]]);
 L(3,"SYN.5",[[0,5],[3,5],[6,5],[9,0],[12,5],[16,5],[19,5],[22,5],[25,0],[28,5]]);
 L(3,"SYN.2",[[12,0],[28,0]]);
 L(4,"SYN.4",[[29,40],[30,80],[31,127]]);L(4,"SYN.5",[[29,20],[30,14],[31,8]]);
 L(2,"FLT.0",[[16,50],[24,70]]);
 L(7,"MID.1",[[16,70]]);
})();
S.ctl.sources.push({id:"lfoA",kind:"lfo",label:"LFO A",val:64,SHAPE:0,RATE:"1/2",DEPTH:100},{id:"rndA",kind:"rnd",label:"Random A",val:64,RATE:"1/16",SMOOTH:30,_t:64});
/* the plug-in's mappings, as its learn document says them (the page keeps no links of its own for the knob rows): Knob 1 and
   Knob 2 on any channel, and one learned CC on channel 2 that hides the machine's own CC (T1 FLT BASE is CC 73) */
S.ctl.links=[{src:"lfoA",t:2,pid:"AMP.6",min:30,max:98,curve:"lin",inv:false},{src:"rndA",t:7,pid:"MID.4",min:0,max:127,curve:"lin",inv:false}];
S.ctl.doc={enabled:true,learning:null,limits:{tracks:6,max:128,params:[]},mappings:[
 {index:0,t:0,pg:2,i:1,name:"",cc:21,ch:255,mode:"Absolute",invert:false,overrides:[]},{index:1,t:2,pg:2,i:0,name:"",cc:21,ch:255,mode:"Absolute",invert:false,overrides:[]},
 {index:2,t:2,pg:3,i:4,name:"",cc:22,ch:255,mode:"Absolute",invert:true,overrides:[]},{index:3,t:3,pg:0,i:0,name:"",cc:22,ch:255,mode:"Absolute",invert:false,overrides:[]},
 {index:4,t:0,pg:2,i:1,name:"",cc:73,ch:1,mode:"RelativeSigned",invert:false,overrides:[{ch:1,t:1,pg:2,i:1}]}]};
S.ctl.doc.limits.params=[...Array(7).keys()].flatMap(pg=>[...Array(8).keys()].map(i=>({pg,i,name:""}))).concat([{pg:7,i:0,name:"Level"}]);
S.song=[{pat:0,rep:2},{pat:1,rep:2,trn:69},{pat:0,rep:2,mutes:[3]},{pat:2,rep:1,ofs:8,len:16},{pat:1,rep:2,ttr:[64,64,64,71,64,64,64,64,64,64,64,64]},{pat:3,rep:1,bpm:124,mutes:[4,7]},{type:"loop",to:1,count:2},{type:"end"}];
S.songSel=1;
/* the kit library: kit 1 is the example kit, the other named ones made from it (factoryKit) */
FACTORY=captureKit();
const KITN={0:"MONOMACHINE",1:"ACID BATH",2:"VOCODED",3:"FM BELLS",4:"DIGI CHOIR",5:"SID LEADS",6:"NOISE TOYS",7:"DUB CHORDS"};
S.kits=Array.from({length:128},(_,k)=>({name:KITN[k]||"",empty:!KITN[k],data:null}));S.workName=S.kits[0].name;
/* patterns A01-A08: A01 the example pattern, the others variations of it */
S.patInfo=Array.from({length:128},(_,p)=>({has:p<8,len:[32,16,32,64,16,48,32,16][p%8]}));S.patData={};
(()=>{const base=capturePat();for(let p=1;p<8;p++){const d=clone(base),r=(p*2)%d.len,tn=[0,5,7,-2,3,-5,10,12][p];d.len=S.patInfo[p].len;
 d.tr.forEach((x,i)=>{const s=x.steps.slice(0,32);x.steps=Array.from({length:64},(_,k)=>{const st=s[(k+r)%32];if(!st||!st.n||i===4)return st&&clone(st);return{...clone(st),n:st.n.map(n=>clamp(n+tn))}})});d.locks=[];S.patData[p]=d}})();
})();
