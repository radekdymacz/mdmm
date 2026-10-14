/* The lane toolbox (Sequence, the Machinedrum Editor's mdDeskLaneTools.js): on the lock lane's title row, shapes and tools for the lane shown. The
   bar is drawn by renderSeq (laneToolsHtml), its clicks are the listener below; the state, LT, is a value of this file (the shape's cycles, the
   steps' filter, Flat's level), kept across renders. The shapes and the maths are shared/deskLaneShapes.js.
   Shapes: ramp up, ramp down, triangle, sine, square, decay, random, flat (each press the next level: 50, 75, 100, 25, 0 %); ×1 ×2 ×4 cycles over
   the steps shown. A click replaces the lane's values; ⌘-click adds the shape (around the middle) to them, ⌥-click subtracts it, ⇧-click scales them
   by it. Hovering a shape previews it on the lane (faint bars).
   Which steps: ALL, every 2nd, 3rd, 4th, or OFF (the offbeats), of the steps shown that hold a note (a lock rides a note; a trigless one too). Tools on
   the locks there: HUMAN (a little random), scale down / up (towards / away from the middle), INV (upside down). An apply is one run of ordinary
   "lock" intents in one go, so the next commit makes it one undo step; a lane with no lock yet needs one of the machine's 62 locked parameters, and
   when they are all used the apply is refused whole, as a drawn lock is (setLock). */
const LT={cycles:1,every:"all",flat:0};
const laneFlatTip=()=>`Flat at ${LANE_FLAT[LT.flat]*100} % (each press: the next level)`;
const laneTitleOf=tip=>`${tip}: click replaces · ⌘ adds · ⌥ subtracts · ⇧ scales`;
/* the steps the tools act on: shown, holding a note, and through the filter */
function laneTargets(){const tr=trk(S.sel),vis=steps().filter(s=>{const st=tr.steps[s];return st&&!st.off}),
 keep={all:()=>true,"2":(s,k)=>k%2===0,"3":(s,k)=>k%3===0,"4":(s,k)=>k%4===0,off:s=>s%2===1}[LT.every];return{vis,list:vis.filter((s,k)=>keep(s,k))}}
const laneTop=()=>{const[pg,i]=S.lane.split(".");return maxOf(meta(S.sel,pg,+i))};
/* a step's lock now, or the lane's own (kit) value */
function laneExisting(s){const v=S.locks.get(lkKey(S.sel,S.lane))?.get(s);return v!=null?v:(getP(S.sel,S.lane)??0)}
/* the new value of each target step: [[step, value]]; mode: replace, add, sub, scale (a 0 is a lock like any value) */
function laneShapeValues(id,mode){const{vis,list}=laneTargets(),n=Math.max(1,vis.length),mx=laneTop();
 return list.map(s=>[s,laneMix(mode,laneExisting(s),laneShapeAt(id,vis.indexOf(s)/n*LT.cycles,LT.flat)*mx,mx)])}
/* HUMAN, scale down / up, INV on the locked steps (none locked yet: on the lane's own value) */
function laneToolValues(id){const{list}=laneTargets(),m=S.locks.get(lkKey(S.sel,S.lane)),locked=list.filter(s=>m&&m.has(s)),on=locked.length?locked:list,mx=laneTop();
 return on.map(s=>[s,laneTool(id,laneExisting(s),Math.random(),mx)])}
/* one run: every lock written in one go (the next commit: one undo step); refused whole when the lane needs a 63rd locked parameter */
function laneWrite(values){
 if(S.rec){toast("The lane tools wait while the machine records live.");return}
 if(!values.length){toast("No step with a note in that scope: nothing to write.");return}
 const t=S.sel;let n=0;
 for(const[s,v] of values){if(!setLock(t,S.lane,s,v,n>0))return;edit("lock",{t,...pidArgs(S.lane),s,v});n++}
 renderTop();renderLane()}
const laneModeOf=e=>Modifiers.cmd(e)?"add":e.altKey?"sub":e.shiftKey?"scale":"replace";
function laneToolsHtml(){
 const seg=(k,opts)=>`<span class="xlseg" data-xg="${k}">${opts.map(([v,l,tip])=>`<button data-xv="${v}" aria-pressed="${String(LT[k])===String(v)}" title="${tip}">${l}</button>`).join("")}</span>`;
 const ico=(id,tip,d)=>`<button class="ico" data-xt="${id}" aria-label="${tip}" title="${tip}"><svg viewBox="0 0 16 16" aria-hidden="true"><path d="${d}"/></svg></button>`;
 return`<span class="xlane" role="group" aria-label="Lane shapes and tools">
  <span class="xlseg shapes">${LANE_SHAPES.map(([id,name,,svg])=>`<button data-xs="${id}" aria-label="${name}" title="${laneTitleOf(id==="flat"?laneFlatTip():name)}"><svg viewBox="0 0 16 16" aria-hidden="true">${svg||laneFlatSvg(LT.flat)}</svg></button>`).join("")}</span>
  ${seg("cycles",[[1,"×1","One cycle over the steps shown"],[2,"×2","Two cycles"],[4,"×4","Four cycles"]])}
  ${seg("every",[["all","All","Every step with a note"],["2","/2","Every 2nd step with a note"],["3","/3","Every 3rd"],["4","/4","Every 4th"],["off","Off","The offbeats"]])}
  <span class="xlseg tools"><button data-xt="human" title="Human: a little random on each lock">Human</button>${ico("shrink","Scale down: the locks closer to the middle","M8 3V13M4 9L8 13L12 9")}${ico("stretch","Scale up: the locks further from the middle","M8 13V3M4 7L8 3L12 7")}<button data-xt="invert" title="Inv: the locks upside down">Inv</button></span>
</span>`}
/* the preview: a faint bar per step over the lane */
const laneClearPreview=()=>$$("#lane .xghost").forEach(x=>x.remove());
function lanePreview(values){laneClearPreview();const mx=laneTop();for(const[s,v] of values||[])$(`#lane .lb[data-s="${s}"]`)?.insertAdjacentHTML("beforeend",`<b class="xghost" style="--g:${(v/mx).toFixed(3)}"></b>`)}
document.addEventListener("click",e=>{
 const sh=e.target.closest(".xlane [data-xs]"),sg=e.target.closest(".xlane [data-xg] [data-xv]"),tl=e.target.closest(".xlane [data-xt]");if(!sh&&!sg&&!tl)return;
 if(sg){const k=sg.parentElement.dataset.xg;LT[k]=k==="cycles"?+sg.dataset.xv:sg.dataset.xv;sg.parentElement.querySelectorAll("button").forEach(b=>b.setAttribute("aria-pressed",b===sg));return}
 laneClearPreview();
 if(sh){laneWrite(laneShapeValues(sh.dataset.xs,laneModeOf(e)));if(sh.dataset.xs==="flat"){LT.flat=(LT.flat+1)%LANE_FLAT.length;sh.querySelector("svg").innerHTML=laneFlatSvg(LT.flat);sh.title=laneTitleOf(laneFlatTip())}}
 else laneWrite(laneToolValues(tl.dataset.xt))});
/* hover a shape (or a tool): its result, faint, on the lane; Random and Human are not previewed (each apply differs) */
document.addEventListener("pointerover",e=>{const sh=e.target.closest?.(".xlane [data-xs]"),tl=e.target.closest?.(".xlane [data-xt]");
 if(sh&&sh.dataset.xs!=="random")lanePreview(laneShapeValues(sh.dataset.xs,laneModeOf(e)));else if(tl&&tl.dataset.xt!=="human")lanePreview(laneToolValues(tl.dataset.xt))});
document.addEventListener("pointerout",e=>{if(e.target.closest?.(".xlane [data-xs],.xlane [data-xt]"))laneClearPreview()});
