"use strict";
/* ===================================================================
   Monomachine Editor page (OS 1.32). It starts empty (50-state.js); the browser
   mockup's example is its own (doc/modern-ux/mm-mockup/demo/).
   Values are firmware units (0-127, or small enums); display converts.
   =================================================================== */

/* ===== Data from the manual ===== */
const PAGES=["SYN","AMP","FLT","EFX","LF1","LF2","LF3"];
const PAGEN={SYN:"Synthesis",AMP:"Amplification",FLT:"Filter",EFX:"Effects",LF1:"LFO 1",LF2:"LFO 2",LF3:"LFO 3",MID:"MIDI page"};
const FIXED={AMP:["ATK","HOLD","DEC","REL","DIST","VOL","PAN","PORT"],FLT:["BASE","WDTH","HPQ","LPQ","ATK","DEC","BOFS","WOFS"],EFX:["EQF","EQG","SRR","DTIM","DSND","DFB","DBAS","DWID"],
 LF1:["PAGE","DEST","TRIG","WAVE","MULT","SPD","INTL","DPTH"],LF2:["PAGE","DEST","TRIG","WAVE","MULT","SPD","INTL","DPTH"],LF3:["PAGE","DEST","TRIG","WAVE","MULT","SPD","INTL","DPTH"],
 MID:["LEN","VEL","PB","PCHG","CC1","CC2","CC3","CC4"]};
/* CC map, Appendix B: per track channel (base + track) */
const CCBASE={SYN:48,AMP:56,FLT:72,EFX:80,LF1:88,LF2:104,LF3:112};
/* Machines, Appendix A. id = the SysEx 0x5B machine number (Appendix C). The 8 SYN slots follow the OS 1.32B screens ("" = unused knob), which differ from the manual text in places. */
const MACH={
 "GND-GND":{id:0,p:[],about:"Silence. A clean slot."},
 "GND-SIN":{id:1,p:["","","","","","","","TUNE"],about:"A plain sine. Clearing a machine gives this one."},
 "GND-NOIS":{id:2,p:["ST","RED","STON","","","","","TUNE"],about:"Noise from white (RED 0) through pink (64) to red (127)."},
 "SID-6581":{id:3,p:["PW","PWAD","PWRS","WAVE","MOD","MSRC","MFRQ","TUNE"],about:"MOS 6581 oscillator with ring mod and sync. MSRC = PRCH takes the second frequency from the track before."},
 "SWAVE-SAW":{id:4,p:["UNIL","UNIW","UNIX","","SUBX","SUB1","SUB2","TUNE"],about:"Eight saw oscillators: base, unison pair, extended pair, three subs."},
 "SWAVE-PULS":{id:5,p:["UNIL","UNIW","SUB1","SUB2","PW","PWAD","PWRS","TUNE"],about:"Five pulse oscillators, three with pulse width sweep."},
 "DPRO-WAVE":{id:6,p:["WAVE","WP","WPM","WPRS","SYNC","SFRQ","","TUNE"],about:"32 raw 12-bit waveforms. WP morphs into the next one."},
 "DPRO-BBOX":{id:7,p:["PTCH","STRT","","","RTRG","RTIM","",""],about:"24 drum sounds from C-3 upwards. The key picks the sound."},
 "FM+STAT":{id:8,p:["1FRQ","1FIN","1ENV","1FB","2FRQ","2VOL","TONE","TUNE"],about:"The versatile FM+: two listed-frequency modulators."},
 "FM+PAR":{id:9,p:["1FRQ","1ENV","2FRQ","2ENV","3FRQ","3ENV","TONE","TUNE"],about:"Three parallel copies of the FM+ block."},
 "FM+DYN":{id:10,p:["1FRQ","1FEN","1VOL","1VEN","2FRQ","2ENV","2FB","TUNE"],about:"Continuous modulator frequencies with their own envelopes."},
 "VO-6":{id:11,p:["VOC1","VOC2","V-SW","VOIC","CONS","CLEN","CVOL","TUNE"],about:"Formant voice. A trig is a consonant then a vowel: lock them per step to spell words."},
 "SWAVE-ENS":{id:14,p:["PCH2","PCH3","PCH4","WAVE","PW","CHRL","CHRW","TUNE"],about:"Up to four-note chords from one track. Lock PCH2-4 to change chord."},
 "DPRO-DDRW":{id:32,p:["WAV1","MIX","WAV2","TIME","BR1","WID","BR2","TUNE"],mk2:true,about:"Two of the 64 waveforms (factory or user) blended. MKII only."},
 "DPRO-DENS":{id:33,p:["PCH2","PCH3","PCH4","WAVE","","CHRL","CHRW","TUNE"],mk2:true,about:"Chords from one of the 64 waveforms. MKII only."},
 "FX-THRU":{id:12,p:["","","","","","","","INP"],fx:1,about:"Passes its input through the track effects. Needs one trig to open."},
 "FX-REVERB":{id:13,p:["DEC","DAMP","GATE","MIX","HP","LP","","INP"],fx:1,about:"A gated reverb. GATE 127 turns the gate off."},
 "FX-CHORUS":{id:15,p:["DEL","DEP","SPD","MIX","FB","WID","LP","INP"],fx:1,about:"2 × 3 tap stereo chorus."},
 "FX-DYNAMIX":{id:16,p:["ATK","REL","THRS","MIX","RAT","GAIN","RMS","INP"],fx:1,about:"Compressor. RAT 127 = limiter."},
 "FX-RINGMOD":{id:17,p:["WAVE","EXT","","MIX","","","","INP"],fx:1,about:"Ring-modulates the input with a sine-to-triangle carrier."},
 "FX-PHASER":{id:18,p:["CNTR","DEP","SPD","MIX","FB","WID","","INP"],fx:1,about:"Sweeping phaser, also widens."},
 "FX-FLANGER":{id:19,p:["DEL","DEP","SPD","MIX","FB","WID","","INP"],fx:1,about:"Flanger: notches spread evenly."}};
const FAMS=[["SWAVE","SuperWave · analogue style"],["SID","SID · 6581 chip"],["DPRO","DigiPRO · digital waves"],["FM+","FM+ · frequency modulation"],["VO","VO · voice"],["GND","GND · basic"],["FX","FX · processes other audio"]];
const famKey=m=>m.startsWith("FM+")?"FM+":m.split("-")[0];
const machName=m=>({"SWAVE-SAW":"SuperWave saw","SWAVE-PULS":"SuperWave pulse","SWAVE-ENS":"SuperWave ensemble","SID-6581":"SID 6581","DPRO-WAVE":"DigiPRO wave","DPRO-BBOX":"DigiPRO beat box","DPRO-DDRW":"DigiPRO double draw","DPRO-DENS":"DigiPRO ensemble","FM+STAT":"FM+ static","FM+PAR":"FM+ parallel","FM+DYN":"FM+ dynamic","VO-6":"VO-6 voice","GND-GND":"Ground","GND-SIN":"Sine","GND-NOIS":"Noise","FX-THRU":"Through","FX-REVERB":"Gate reverb","FX-CHORUS":"Chorus","FX-DYNAMIX":"Dynamix","FX-RINGMOD":"Ring modulator","FX-PHASER":"Phaser","FX-FLANGER":"Flanger"})[m]||m;
const isFx=m=>!!MACH[m]?.fx;

/* Enumerated values. Everything else is 0-127. */
/* LFO / ASSIGN PAGE, WAVE, MULT and PTCH lists in firmware order (index = firmware value, read from the OS 1.32B screens) */
const LPAGES=["PTCH","SYN","AMP","FLT","EFX","LF1","LF2","LF3","MID"];
const PTCHD=["1/12","2/12","7/12","1OCT","2OCT","4OCT","8OCT","16OCT"];
const LTRIG=["FREE","TRIG","HOLD","ONE","HALF"];
const LWAVE=["TRI","ITRI","SAW","ISAW","SQR","ISQR","EXP","IEXP","RMP","IRMP","RND"];
const LMULT=["1X","2X","4X","8X","16X","32X","64X"];
const CONS=["-","B","D","F","G","H","J","K","L","M","N","P","R","RR","S","SJ","T","TH","TJ","V","Z"];
const EN={"SID-6581.WAVE":["TRI","SAW","PULS","MIX","NOIS"],"SID-6581.MOD":["OFF","RING","SYNC","R+S"],"SID-6581.MSRC":["MFRQ","PRCH"],
 PWRS:["OFF","ON"],WPRS:["OFF","ON"],STON:["OFF","ON"],"V-SW":["OFF","ON"],CONS};
/* Value lists the machine shows (B-149, B-150, B-151): a value is 0-127 and goes to the machine as it is; the page shows
   the entry it falls in, as the LCD writes it, and a step (wheel, arrows) moves one entry. An entry is {lo, t, r}: from
   value lo up to the next entry's lo, the text t, and r what a drawing needs (a ratio, semitones, a wave's index). Read
   on OS 1.32B from the LCD, every value 0-127 sent as its CC and the screen read back (mmEditorProbeFirmwareTest enums,
   2026-10-16; a CC writes the kit's byte as it is). */
const tabRuns=rows=>rows.map(([lo,t,r])=>({lo,t,r}));
const tabAt=(tab,v)=>{let e=tab[0];for(const x of tab){if(x.lo>v)break;e=x}return e};
/* d entries on from v's (a step past either end stays there): the entry's first value */
const tabStep=(tab,v,d)=>{const i=tab.indexOf(tabAt(tab,v));return tab[Math.max(0,Math.min(tab.length-1,i+d))].lo};
const num=t=>t.includes("/")?t.split("/").reduce((a,b)=>a/b):+t;
/* FM+STAT and FM+PAR 1FRQ 2FRQ 3FRQ: the modulator's frequency, 24 entries. The machine writes 5/32 for 48-53, between
   3/8 and 7/16 (13/32 in four characters): the drawing takes 13/32 there. */
const FMFRQ=tabRuns([[0,"1/64"],[6,"1/32"],[11,"1/16"],[16,"3/32"],[22,"1/8"],[27,"3/16"],[32,"1/4"],[38,"5/16"],[43,"3/8"],[48,"5/32",13/32],[54,"7/16"],[59,"1/2"],
 [64,"5/8"],[70,"3/4"],[75,"7/8"],[80,"1"],[86,"1.25"],[91,"1.5"],[96,"1.75"],[102,"2"],[107,"2.5"],[112,"3"],[118,"3.5"],[123,"4"]].map(([lo,t,r])=>[lo,t,r??num(t)]));
/* FM+DYN 1FRQ and 2FRQ: a text per value. 1FRQ is value / 64 (0.0 to 1.54, 2.0 at 40); 2FRQ a curve (0.0 to 2.39, 4.0 at
   40). On 11-40 (but 21 and 32) the machine writes the decimal point one place (1FRQ) or two places (2FRQ) to the right:
   1.56 there is 0.156 (between 5/32 at 10 and .171 at 21). The drawing takes the number in line. */
const dynTab=(texts,div)=>texts.split(" ").map((t,lo)=>{let r=num(t);if(lo>=11&&lo<=40&&r>=1)r/=div;return{lo,t,r}});
const FMDYN1=dynTab("0.0 1/64 1/32 .046 1/16 .078 3/32 .109 1/8 .140 5/32 1.56 1.57 1.59 1.60 1.62 1.64 1.65 1.67 1.68 1.70 .171 1.71 1.73 1.75 1.76 1.78 1.79 1.81 1.82 1.84 1.85 "+
 "3/16 1.87 1.89 1.90 1.92 1.93 1.95 1.96 2.0 .203 .218 .234 1/4 .265 .281 .296 5/16 .328 .343 .359 3/8 .390 .406 .421 7/16 .453 .468 .484 1/2 .515 .531 .546 "+
 "9/16 .578 .593 .609 5/8 .640 .656 .671 .687 .703 .718 .734 3/4 .765 .781 .796 .812 .828 .843 .859 7/8 .890 .906 .921 .937 .953 .968 .984 1.0 1.01 1.03 1.04 "+
 "1.06 1.07 1.09 1.10 1.12 1.14 1.15 1.17 1.18 1.20 1.21 1.23 1.25 1.26 1.28 1.29 1.31 1.32 1.34 1.35 1.37 1.39 1.40 1.42 1.43 1.45 1.46 1.48 1.5 1.51 1.53 1.54",10);
const FMDYN2=dynTab("0.0 .000 .001 .002 .003 .006 .008 .011 1/64 .019 .024 2.44 2.49 2.54 2.59 2.64 2.69 2.74 2.79 2.84 2.90 .029 2.95 3.0 3.06 3.11 3.17 3.22 3.28 3.34 3.39 3.45 "+
 ".035 3.51 3.57 3.63 3.69 3.75 3.81 3.87 4.0 .041 .047 .054 1/16 .070 .079 .088 .097 .107 .118 .129 9/64 .152 .165 .177 .191 .205 .219 .234 1/4 .265 .282 .299 "+
 ".316 .334 .352 .371 .390 .410 .430 .451 .472 .494 .516 .539 9/16 .586 .610 .635 .660 .685 .711 .738 .765 .793 .821 .849 .878 .908 .938 .968 1.0 1.03 1.06 1.09 "+
 "1.12 1.16 1.19 1.23 1.26 1.30 1.33 1.37 1.41 1.44 1.48 1.52 1.56 1.60 1.64 1.68 1.72 1.76 1.80 1.84 1.89 1.93 1.97 2.02 2.06 2.11 2.15 2.20 2.25 2.29 2.34 2.39",100);
/* B-151: SWAVE-ENS and DPRO-DENS PCH2 PCH3 PCH4, a chord note: 33 entries, OFF in the middle (63-65), semitones to
   ±12 and interval ratios among them (2/3 3/4 4/5 5/6 below, 6/5 5/4 4/3 3/2 above); r: semitones (a ratio's 12 × log2),
   null for OFF */
const PCHTAB=tabRuns([[0,"-12"],[4,"-11"],[8,"-10"],[12,"-09"],[16,"-08"],[20,"2/3"],[24,"-07"],[28,"-06"],[32,"-05"],[35,"3/4"],[39,"-04"],[43,"4/5"],[47,"5/6"],[51,"-03"],
 [55,"-02"],[59,"-01"],[63,"OFF"],[66,"+01"],[70,"+02"],[74,"+03"],[78,"6/5"],[82,"5/4"],[86,"+04"],[90,"4/3"],[94,"+05"],[97,"+06"],[101,"+07"],[105,"3/2"],
 [109,"+08"],[113,"+09"],[117,"+10"],[121,"+11"],[125,"+12"]].map(([lo,t])=>[lo,t,t==="OFF"?null:t.includes("/")?12*Math.log2(num(t)):+t]));
const pchRatio=e=>e.t.includes("/");
/* B-150: DigiPRO waves. DPRO-DDRW WAV1 WAV2 and DPRO-DENS WAVE: D01-D64, two values a wave (71 = D36, 127 = D64);
   r: the wave's index. DPRO-WAVE WAVE is S01-S32, four values a wave (10 = S03, 126 = S32): an enumeration of the
   catalogue (mmSynthEnum), so the page holds its index (EN below) and the host sends the machine's value */
const WAVD=Array.from({length:64},(_,k)=>({lo:k*2,t:"D"+String(k+1).padStart(2,"0"),r:k}));
const WAVS=Array.from({length:32},(_,k)=>"S"+String(k+1).padStart(2,"0"));
EN["DPRO-WAVE.WAVE"]=WAVS;
const TAB={"FM+STAT.1FRQ":FMFRQ,"FM+STAT.2FRQ":FMFRQ,"FM+PAR.1FRQ":FMFRQ,"FM+PAR.2FRQ":FMFRQ,"FM+PAR.3FRQ":FMFRQ,"FM+DYN.1FRQ":FMDYN1,"FM+DYN.2FRQ":FMDYN2,
 "SWAVE-ENS.PCH2":PCHTAB,"SWAVE-ENS.PCH3":PCHTAB,"SWAVE-ENS.PCH4":PCHTAB,"DPRO-DENS.PCH2":PCHTAB,"DPRO-DENS.PCH3":PCHTAB,"DPRO-DENS.PCH4":PCHTAB,
 "DPRO-DDRW.WAV1":WAVD,"DPRO-DDRW.WAV2":WAVD,"DPRO-DENS.WAVE":WAVD};
/* B-148: the filter envelope's BOFS and WOFS are -64 to +63 on the machine (OS 1.32B LCD at both ends; 64 = no sweep) */
const SIGNED=new Set(["PAN","EQG","DIST","DSND","TUNE","PB","BOFS","WOFS"]);
const DEFV={SYN:[0,0,0,0,0,0,0,64],AMP:[0,40,64,20,64,100,64,0],FLT:[0,127,0,0,0,40,64,64],EFX:[64,64,0,32,64,0,0,127],LFO:[2,1,1,0,1,32,0,0],MID:[64,100,64,0,0,0,0,0]};

/* Note names, the MM way: C-4 = MIDI 60 */
const NN=["C-","C#","D-","D#","E-","F-","F#","G-","G#","A-","A#","B-"];
const noteName=n=>n==null?"---":n<12?"LOW":NN[((n%12)+12)%12]+(Math.floor(n/12)-1);
const KEYS=["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
const MAJ=[0,2,4,5,7,9,11],MIN=[0,2,3,5,7,8,10];
const BBOX={48:"BD1",49:"SD1",50:"TOM1",51:"TOM2",52:"BONG",53:"CLAP",54:"RIM",55:"COW",56:"CH",57:"OH",58:"RIDE",59:"CRSH",60:"BD2",61:"SD2",62:"TIMB",63:"AGGO",64:"TIMP",65:"SNAP",66:"WOOD",67:"TRI",68:"SHKR",69:"MARA",70:"WHSL",71:"BLIP"};
