/* ===== COPY / PASTE / CLEAR what (0.6 wave 4; the dialog, the ▾ menu and the remembered ticks are shared/deskWhat.js) =====
   The selected track's parts as the Monomachine keeps them: PATTERN (notes, melody, slide, swing, locks, arp, transpose:
   every step of the pattern, the track's settings in it) and KIT (machine + sound, a synth track's). One intent each,
   trackCopy / trackPaste / trackClear (mmDesk::trackParts), one undo step; the page shows the result's documents. A synth
   track's parts paste onto synth tracks, a MIDI track's onto MIDI tracks. WCLIP: the page's note of what was copied. */
const MM_WHAT=[["notes","Notes","pat"],["melody","Melody","pat"],["slide","Slide","pat"],["swing","Swing","pat"],["locks","Locks","pat"],["arp","Arp","pat"],["transpose","Transpose","pat"],["sound","Machine + sound","kit"]];
let WCLIP=null;
/* what each step part of track t holds now (arp and transpose are settings: no number) */
function whatCounts(t){const tr=trk(t),st=tr.steps.filter(x=>x&&!x.off);let locks=0;
 for(const[k,m] of S.locks)if(+k.split("|")[0]===t)locks+=m.size;
 return{notes:st.length,melody:st.filter(x=>x.n&&x.n.length).length,slide:tr.slide.size,swing:tr.swing.size,locks}}
const whatName=t=>tLabel(t)+" "+trk(t).m;
function whatOpen(verb){
 const t=S.sel,clip=WCLIP;
 if(verb==="paste"&&!clip){toast("Copy a track's parts first: ▾ Copy… on the LCD.");return}
 const counts=verb==="paste"?clip.counts:whatCounts(t),midi=verb==="paste"?clip.midi:isMidiT(t);
 const why=id=>verb==="paste"&&!clip.what.includes(id)?"Not copied: Copy… did not tick it":id==="sound"&&midi?"A MIDI track has no machine: sound is a synth track's":"";
 const item=([id,label])=>({id,label,n:counts[id]!=null?String(counts[id]):"",why:why(id)});
 const groups=[{name:"Pattern",note:patName(S.pat),info:NA.recvSession||"",items:MM_WHAT.filter(p=>p[2]==="pat").map(item)},
  {name:"Kit",note:kitName(S.kit),info:NA.workingKitMemory||"",items:MM_WHAT.filter(p=>p[2]==="kit").map(item)}];
 const marked=S.marks&&S.marks.size?[...S.marks]:[t];
 What.open({verb,editor:"mm",groups,src:whatName(verb==="paste"?clip.t:t),
  srcNote:verb==="paste"?"copied from "+tLabel(clip.t):"pattern "+patName(S.pat)+" · all steps",
  to:verb==="paste"?Array.from({length:12},(_,i)=>({t:i,label:tLabel(i),name:whatName(i),on:marked.includes(i),
   why:isMidiT(i)!==clip.midi?(clip.midi?"A MIDI track's parts paste onto MIDI tracks":"A synth track's parts paste onto synth tracks"):""})):null,
  defaults:verb==="copy"?["notes","slide","swing","locks"]:verb==="paste"?clip.what:["locks"],
  done:(what,to)=>{
   if(verb==="copy"){WCLIP={t,what,midi:isMidiT(t),counts:whatCounts(t)};edit("trackCopy",{t,what});return}
   if(verb==="paste")edit("trackPaste",{to,what});else edit("trackClear",{t,what});commit()}})}
addEventListener("click",e=>{const m=e.target.closest?.("[data-secwhat]");if(m){e.preventDefault();e.stopImmediatePropagation();What.menu(m,whatOpen)}},true);
Keys.bind({id:"copy-what",short:"Copy what",scope:"any",keys:["C"],mod:"cmd+shift",group:"Anywhere",does:"Copy what: choose which parts of the selected track to copy (the machine's SUPER COPY)",run:()=>whatOpen("copy")});
Keys.bind({id:"paste-what",short:"Paste what",scope:"any",keys:["V"],mod:"cmd+shift",group:"Anywhere",does:"Paste what: choose which copied parts go into which tracks",run:()=>whatOpen("paste")});
Keys.bind({id:"clear-what",short:"Clear what",scope:"any",keys:["Backspace"],mod:"cmd+shift",group:"Anywhere",does:"Clear what: choose which parts of the selected track to clear (the machine's SUPER CLEAR)",run:()=>whatOpen("clear")});
