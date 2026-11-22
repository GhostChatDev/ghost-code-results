import {COLS,ROWS,ROCKS,GATE,KEEP,TYPES,towerStats} from './game-core.js';
const palette={ground:'#203931',alt:'#244137',grid:'#395148',route:'#bfa16b',ink:'#0b161c',text:'#f3ead3',muted:'#b4c4bf',gold:'#ffc76a',mist:'#91d9ed',danger:'#ff9c8b'};
export function draw(ctx,game,ui,time) {
  const S=80;ctx.clearRect(0,0,1280,800);
  for(let y=0;y<ROWS;y++) for(let x=0;x<COLS;x++) {
    ctx.fillStyle=(x+y)%2?palette.ground:palette.alt;ctx.fillRect(x*S,y*S,S,S);
    ctx.strokeStyle=palette.grid;ctx.lineWidth=.65;ctx.strokeRect(x*S,y*S,S,S);
    const seed=(x*73+y*31)%11;
    ctx.fillStyle=palette.grid;ctx.globalAlpha=.55;
    for(let i=0;i<3;i++) {ctx.beginPath();ctx.ellipse(x*S+12+(seed*7+i*19)%60,y*S+13+(seed*11+i*17)%55,2,4,.4,0,Math.PI*2);ctx.fill();}
    ctx.globalAlpha=1;
  }
  ctx.strokeStyle=palette.route;ctx.globalAlpha=.4;ctx.lineWidth=19;ctx.lineJoin='round';ctx.lineCap='round';ctx.beginPath();
  game.path.forEach((p,i)=>i?ctx.lineTo(p.x*S+40,p.y*S+40):ctx.moveTo(p.x*S+40,p.y*S+40));ctx.stroke();
  ctx.globalAlpha=.7;ctx.strokeStyle=palette.gold;ctx.lineWidth=2;ctx.setLineDash([3,15]);ctx.lineDashOffset=-time*10;ctx.stroke();ctx.setLineDash([]);ctx.globalAlpha=1;
  for(const k of ROCKS) {
    const [x,y]=k.split(',').map(Number);ctx.save();ctx.translate(x*S+40,y*S+40);
    ctx.fillStyle=palette.ink;ctx.beginPath();ctx.ellipse(1,18,31,17,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#526158';ctx.beginPath();ctx.moveTo(-29,12);ctx.lineTo(-23,-17);ctx.lineTo(0,-29);ctx.lineTo(25,-13);ctx.lineTo(30,17);ctx.lineTo(4,25);ctx.closePath();ctx.fill();
    ctx.strokeStyle='#718074';ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(-23,-17);ctx.lineTo(0,0);ctx.lineTo(25,-13);ctx.moveTo(0,0);ctx.lineTo(4,25);ctx.stroke();ctx.restore();
  }
  landmark(ctx,GATE,'GATE',false,time);landmark(ctx,KEEP,'KEEP',true,time);
  const selected=game.towers.find(t=>t.id===ui.selected);
  if(selected) {
    ctx.fillStyle=TYPES[selected.type].color;ctx.globalAlpha=.1;ctx.beginPath();ctx.arc(selected.x*S+40,selected.y*S+40,towerStats(selected).range*S,0,Math.PI*2);ctx.fill();
    ctx.globalAlpha=.55;ctx.lineWidth=2;ctx.strokeStyle=TYPES[selected.type].color;ctx.stroke();ctx.globalAlpha=1;
  }
  if(ui.hover && !ui.overlay && !selected) {
    const {x,y}=ui.hover;ctx.fillStyle=game.canPlace(x,y,ui.type)?palette.danger:palette.gold;ctx.globalAlpha=.25;ctx.fillRect(x*S,y*S,S,S);ctx.globalAlpha=1;
    ctx.strokeStyle=palette.gold;ctx.lineWidth=2;ctx.strokeRect(x*S+2,y*S+2,76,76);
  }
  for(const t of game.towers) {
    ctx.save();ctx.translate(t.x*S+40,t.y*S+40);
    ctx.fillStyle=palette.ink;ctx.beginPath();ctx.ellipse(0,22,28,13,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle='#7f8370';ctx.fillRect(-18,9,36,16);ctx.fillStyle='#a5a18a';ctx.fillRect(-23,7,46,8);
    const color=TYPES[t.type].color;ctx.shadowColor=color;ctx.shadowBlur=13;ctx.fillStyle=color;
    if(t.type==='spark') {ctx.beginPath();ctx.moveTo(4,-31);ctx.lineTo(-17,-3);ctx.lineTo(-2,-3);ctx.lineTo(-7,17);ctx.lineTo(18,-13);ctx.lineTo(4,-13);ctx.closePath();ctx.fill();}
    if(t.type==='bloom') {ctx.beginPath();ctx.arc(0,-5,20,0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;ctx.fillStyle=palette.ink;ctx.beginPath();ctx.arc(0,-5,10,0,Math.PI*2);ctx.fill();}
    if(t.type==='frost') {ctx.beginPath();ctx.moveTo(0,-32);ctx.lineTo(17,-7);ctx.lineTo(0,16);ctx.lineTo(-17,-7);ctx.closePath();ctx.fill();ctx.strokeStyle=palette.text;ctx.lineWidth=2;ctx.beginPath();ctx.moveTo(0,-26);ctx.lineTo(0,10);ctx.stroke();}
    ctx.shadowBlur=0;ctx.fillStyle=palette.text;for(let i=0;i<=t.level;i++){ctx.beginPath();ctx.arc(-t.level*6+i*12,29,3,0,Math.PI*2);ctx.fill();}ctx.restore();
  }
  for(const e of game.enemies) {
    ctx.save();ctx.translate(e.x*S+40,e.y*S+40);const r=e.type==='boss'?29:e.type==='armored'?20:15;
    ctx.fillStyle=palette.ink;ctx.beginPath();ctx.ellipse(0,r*.8,r+4,r*.5,0,0,Math.PI*2);ctx.fill();
    ctx.fillStyle=e.slowTime>0?palette.mist:e.type==='boss'?'#c786b7':e.type==='fast'?'#d4b483':e.type==='armored'?'#9baca7':'#bac486';
    ctx.beginPath();if(e.type==='fast'){ctx.moveTo(0,-r);ctx.lineTo(r,r);ctx.lineTo(-r,r);ctx.closePath();}else{for(let i=0;i<6;i++){const a=i*Math.PI/3;ctx.lineTo(Math.cos(a)*r,Math.sin(a)*r);}ctx.closePath();}ctx.fill();
    ctx.fillStyle=palette.ink;ctx.fillRect(-8,-5,5,5);ctx.fillRect(4,-5,5,5);
    if(e.type==='armored'||e.type==='boss'){ctx.strokeStyle=palette.text;ctx.lineWidth=2;ctx.strokeRect(-r*.6,-r*.75,r*1.2,r*1.5);}
    ctx.fillStyle=palette.ink;ctx.fillRect(-r,-r-11,r*2,5);ctx.fillStyle=e.slowTime>0?palette.mist:palette.danger;ctx.fillRect(-r,-r-11,r*2*Math.max(0,e.hp/e.maxHp),5);ctx.restore();
  }
  for(const e of game.effects) {
    const alpha=e.ttl/e.max;ctx.globalAlpha=alpha;
    if(e.kind==='gold'){ctx.fillStyle=palette.gold;ctx.font='bold 19px system-ui';ctx.textAlign='center';ctx.fillText(e.text,e.x*S+40,e.y*S+10-(1-alpha)*25);}
    else {ctx.strokeStyle=TYPES[e.kind].color;ctx.lineWidth=e.kind==='bloom'?6:3;ctx.beginPath();ctx.moveTo(e.x*S+40,e.y*S+40);ctx.lineTo(e.tx*S+40,e.ty*S+40);ctx.stroke();if(e.kind==='bloom'){ctx.beginPath();ctx.arc(e.tx*S+40,e.ty*S+40,(1-alpha)*100+8,0,Math.PI*2);ctx.stroke();}}
    ctx.globalAlpha=1;
  }
}
function landmark(ctx,p,label,keep,time) {
  const x=p.x*80+40,y=p.y*80+40;
  ctx.save();ctx.translate(x,y);ctx.shadowColor=keep?palette.gold:palette.danger;ctx.shadowBlur=20+Math.sin(time*2)*5;ctx.fillStyle=palette.ink;
  ctx.fillRect(-30,-26,60,57);ctx.shadowBlur=0;ctx.strokeStyle=keep?palette.gold:palette.danger;ctx.lineWidth=3;ctx.strokeRect(-27,-24,54,52);
  ctx.fillStyle=keep?palette.gold:palette.danger;ctx.beginPath();ctx.moveTo(0,-40);ctx.lineTo(34,-23);ctx.lineTo(-34,-23);ctx.closePath();ctx.fill();
  ctx.fillRect(-8,-10,16,24);ctx.font='bold 11px system-ui';ctx.textAlign='center';ctx.fillText(label,0,45);ctx.restore();
}
export class AudioEngine {
  constructor(){this.context=null;this.muted=false;this.last=0;}
  unlock(){try{this.context ||= new (window.AudioContext || window.webkitAudioContext)();this.context.resume().catch(()=>{});}catch{}}
  tone(freq=440,duration=.1){
    if(this.muted || !this.context || this.context.state!=='running')return;
    const c=this.context,now=c.currentTime;if(now-this.last<.07)return;this.last=now;
    const o=c.createOscillator(),g=c.createGain();o.type='sine';o.frequency.setValueAtTime(freq,now);o.frequency.exponentialRampToValueAtTime(freq*.65,now+duration);
    g.gain.setValueAtTime(.045,now);g.gain.exponentialRampToValueAtTime(.001,now+duration);o.connect(g);g.connect(c.destination);o.start(now);o.stop(now+duration);
  }
}
