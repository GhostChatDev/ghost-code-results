import {Game,TYPES,refund,towerStats} from './game-core.js';
import {draw,AudioEngine} from './game-view.js';
const $=id=>document.getElementById(id), canvas=$('board'),ctx=canvas.getContext('2d');
const audio=new AudioEngine();let game=new Game(),speed=1,best=0,savedBest=0,paused=false,started=false,storageWarning='';
try{best=Math.max(0,Math.min(10,Number(localStorage.getItem('lantern-best'))||0));audio.muted=localStorage.getItem('lantern-muted')==='true';}catch{storageWarning='Local storage is unavailable; best wave cannot be saved.';}
const ui={type:'spark',selected:null,hover:null,overlay:true};let overlayMode='start',signature='';
function persist(){
  if(best===savedBest)return;
  try{localStorage.setItem('lantern-best',String(best));savedBest=best;}catch{storageWarning='Local storage is unavailable; best wave cannot be saved.';}
}
function showOverlay(mode){
  overlayMode=mode;ui.overlay=true;$('overlay').hidden=false;
  const data={start:['The Hollow is approaching','Keep the light alive.','Raise lanterns. Shape their path. Hold the woodland gate through ten waves, until dawn returns.','Light the keep'],pause:['The light waits','Take a breath.','Your defense is paused. Resume when you are ready.','Resume defense'],restart:['Begin again?','Rekindle the keep?','This run will be lost. Your best wave stays saved.','Start a new run'],won:['Ten waves survived','Dawn returns.','The Hollow retreats. Your lanterns have carried the woodland safely through the night.','Play again'],lost:['The Hollow broke through','The light will return.',`You reached wave ${game.wave} and defeated ${game.kills} enemies. Try new paths and upgrade your lanterns.`,'Try again']}[mode];
  ['overlayKicker','overlayTitle','overlayText','overlayAction'].forEach((id,i)=>$(id).textContent=data[i]);
  $('guide').hidden=mode!=='start';$('overlayRestart').hidden=!['pause','restart'].includes(mode);
  $('overlayRestart').textContent=mode==='restart'?'Keep this run':'Restart run';
}
function hideOverlay(){ui.overlay=false;$('overlay').hidden=true;}
function reset(){game=new Game();ui.selected=null;paused=false;started=true;speed=1;hideOverlay();signature='';sync();}
function sync(){
  best=Math.max(best,game.best);persist();
  const tower=game.towers.find(t=>t.id===ui.selected);
  const sig=JSON.stringify([game.gold,game.wave,game.lives,game.state,game.message,game.enemies.length,game.queue.length,ui.type,tower?.id,tower?.level,speed,best,paused,started,audio.muted,ui.overlay,storageWarning]);
  if(sig===signature)return;signature=sig;
  $('gold').textContent=game.gold;$('wave').textContent=`${game.wave} / 10`;$('lives').textContent=game.lives;$('best').textContent=best;
  $('message').textContent=storageWarning?`${game.message} ${storageWarning}`:game.message;
  $('remaining').textContent=game.state==='wave'?`${game.enemies.length+game.queue.length} enemies remain`:`${10-game.wave} waves until dawn`;
  $('waveButton').textContent=game.state==='wave'?`Wave ${game.wave} in progress`:game.wave===10?'Dawn has arrived':`Send wave ${game.wave+1}`;
  $('waveButton').disabled=!started||paused||ui.overlay||game.state!=='ready';
  $('pause').disabled=!started||['won','lost'].includes(game.state);
  $('pause').textContent=paused?'Resume':'Pause';$('pause').setAttribute('aria-pressed',String(paused));
  $('speed').textContent=`Speed ×${speed}`;$('speed').setAttribute('aria-pressed',String(speed===2));
  $('mute').textContent=audio.muted?'Sound off':'Sound on';$('mute').setAttribute('aria-pressed',String(audio.muted));
  document.querySelectorAll('[data-type]').forEach(b=>b.setAttribute('aria-pressed',String(!tower&&ui.type===b.dataset.type)));
  $('towerActions').hidden=!tower;$('buildHint').hidden=!!tower;
  if(tower){
    const stats=towerStats(tower);$('selectedName').textContent=`${stats.name} · level ${tower.level+1}`;
    $('selectedInfo').textContent=`${Math.round(stats.damage)} damage · ${stats.range.toFixed(1)} range · ${stats.interval.toFixed(2)}s firing`;
    const cost=stats.upgrades[tower.level];$('upgrade').textContent=tower.level===2?'Fully upgraded':`Upgrade · ${cost} gold`;
    $('upgrade').disabled=tower.level===2||game.gold<cost||paused;
    $('sell').textContent=`Sell · +${refund(tower)} gold`;$('sell').disabled=paused;
  }else{$('selectedName').textContent=`${TYPES[ui.type].name} lantern`;$('selectedInfo').textContent=TYPES[ui.type].description;}
}
function interact(x,y){
  if(ui.overlay||paused||!started||['lost','won'].includes(game.state))return;
  const tower=game.towers.find(t=>t.x===x&&t.y===y);
  if(tower){ui.selected=tower.id;game.message='Upgrade this lantern, or sell it to reopen the route.';}
  else{ui.selected=null;const result=game.place(x,y,ui.type);if(result.ok)audio.tone(620);else audio.tone(150);}
  sync();
}
function cell(event){
  const r=canvas.getBoundingClientRect(),scale=Math.min(r.width/1280,r.height/800);
  const left=r.left+(r.width-1280*scale)/2,top=r.top+(r.height-800*scale)/2;
  const x=Math.floor((event.clientX-left)/(80*scale)),y=Math.floor((event.clientY-top)/(80*scale));
  return x>=0&&x<16&&y>=0&&y<10?{x,y}:null;
}
canvas.addEventListener('pointermove',e=>{ui.hover=cell(e);});canvas.addEventListener('pointerleave',()=>ui.hover=null);
canvas.addEventListener('pointerdown',e=>{e.preventDefault();audio.unlock();const p=cell(e);if(p){ui.hover=p;interact(p.x,p.y);}});
canvas.addEventListener('keydown',e=>{
  const moves={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};
  if(moves[e.key]){e.preventDefault();const p=ui.hover||{x:0,y:0},[dx,dy]=moves[e.key];ui.hover={x:Math.max(0,Math.min(15,p.x+dx)),y:Math.max(0,Math.min(9,p.y+dy))};}
  if(e.key==='Enter'){e.preventDefault();const p=ui.hover||{x:0,y:0};audio.unlock();interact(p.x,p.y);}
});
document.querySelectorAll('[data-type]').forEach(b=>b.addEventListener('click',()=>{audio.unlock();ui.type=b.dataset.type;ui.selected=null;game.message=`${TYPES[ui.type].name} selected. Tap an open tile to build.`;sync();}));
$('upgrade').onclick=()=>{if(!paused&&game.upgrade(ui.selected))audio.tone(780);sync();};
$('sell').onclick=()=>{if(!paused&&game.sell(ui.selected)){ui.selected=null;audio.tone(320);}sync();};
$('waveButton').onclick=()=>{audio.unlock();if(game.startWave())audio.tone(260,.25);sync();};
function pauseToggle(){if(!started||['won','lost'].includes(game.state))return;if(paused){paused=false;hideOverlay();}else{paused=true;showOverlay('pause');}sync();}
$('pause').onclick=pauseToggle;
$('speed').onclick=()=>{speed=speed===1?2:1;game.message=`Time now moves at ×${speed} speed.`;sync();};
$('mute').onclick=()=>{audio.unlock();audio.muted=!audio.muted;try{localStorage.setItem('lantern-muted',String(audio.muted));}catch{storageWarning='Sound preference cannot be saved on this device.';}if(!audio.muted)audio.tone();sync();};
$('restart').onclick=()=>{if(!started){reset();return;}paused=true;showOverlay('restart');sync();};
$('overlayAction').onclick=()=>{audio.unlock();if(overlayMode==='pause'){paused=false;hideOverlay();}else reset();audio.tone(520,.2);sync();};
$('overlayRestart').onclick=()=>{if(overlayMode==='restart'){paused=false;hideOverlay();}else reset();sync();};
window.addEventListener('keydown',e=>{if(e.key.toLowerCase()==='p' && !e.repeat)pauseToggle();if(e.key==='Escape'&&ui.selected){ui.selected=null;sync();}});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&started&&!paused&&!ui.overlay){paused=true;showOverlay('pause');sync();}});
let previous=0,accumulator=0;const STEP=1/60;
function frame(ms){
  const elapsed=previous?Math.min(.1,(ms-previous)/1000):0;previous=ms;
  if(started&&!paused&&(!ui.overlay||['lost','won'].includes(game.state))){
    accumulator+=elapsed*speed;let count=0;
    while(accumulator>=STEP&&count++<14){const kills=game.kills;game.update(STEP);if(game.kills>kills)audio.tone(440,.08);accumulator-=STEP;
      if(!ui.overlay&&['lost','won'].includes(game.state)){showOverlay(game.state);break;}}
  }else accumulator=0;
  sync();draw(ctx,game,ui,ms/1000);requestAnimationFrame(frame);
}
sync();requestAnimationFrame(frame);
