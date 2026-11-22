export const COLS = 16, ROWS = 10, GATE = { x: 0, y: 4 }, KEEP = { x: 15, y: 4 };
export const key = (p) => `${p.x},${p.y}`;
export const ROCKS = new Set([...[1,2,3,6,7,8].map(y => `5,${y}`), ...[1,2,5,6,7,8].map(y => `10,${y}`)]);
export const TYPES = {
  spark: { name: 'Spark', cost: 40, upgrades: [35, 60], range: 2.65, damage: 7, interval: .36, color: '#ffc76a', description: 'Rapid bolts · single target' },
  bloom: { name: 'Cinder', cost: 70, upgrades: [55, 85], range: 3.2, damage: 26, interval: 1.65, splash: 1.25, color: '#ff9c8b', description: 'Heavy shells · area damage' },
  frost: { name: 'Mist', cost: 55, upgrades: [45, 70], range: 2.6, damage: 3, interval: .8, slow: .48, color: '#91d9ed', description: 'Chilling light · slows for 2s' }
};
export const ENEMIES = {
  normal: { hp: 36, speed: 1.05, gold: 9, armor: 0, lives: 1 },
  fast: { hp: 24, speed: 1.85, gold: 10, armor: 0, lives: 1 },
  armored: { hp: 95, speed: .72, gold: 17, armor: 4, lives: 2 },
  boss: { hp: 1800, speed: .45, gold: 180, armor: 6, lives: 10 }
};
export function astar(start, end = KEEP, blocked = new Set()) {
  if (blocked.has(key(start)) || blocked.has(key(end))) return null;
  const open = [{ ...start, g: 0, f: Math.abs(end.x-start.x)+Math.abs(end.y-start.y) }];
  const costs = new Map([[key(start), 0]]), parent = new Map();
  while (open.length) {
    open.sort((a,b) => a.f-b.f || a.g-b.g);
    const p = open.shift(), pk = key(p);
    if (p.g !== costs.get(pk)) continue;
    if (pk === key(end)) {
      const path = [{ x:p.x, y:p.y }]; let k = pk;
      while (parent.has(k)) { const prev = parent.get(k); path.unshift(prev); k = key(prev); }
      return path;
    }
    for (const [dx,dy] of [[1,0],[0,1],[0,-1],[-1,0]]) {
      const q = { x:p.x+dx, y:p.y+dy }, k = key(q), g = p.g+1;
      if (q.x<0 || q.y<0 || q.x>=COLS || q.y>=ROWS || blocked.has(k) || g >= (costs.get(k) ?? Infinity)) continue;
      costs.set(k,g); parent.set(k,{x:p.x,y:p.y});
      open.push({...q,g,f:g+Math.abs(end.x-q.x)+Math.abs(end.y-q.y)});
    }
  }
  return null;
}
export function wavePlan(wave) {
  if (!Number.isInteger(wave) || wave < 1 || wave > 10) throw new RangeError('Wave must be 1–10');
  const list = Array.from({length: 6+wave*2}, (_,i) => wave>=3 && i%4===3 ? 'armored' : wave>=2 && i%3===1 ? 'fast' : 'normal');
  if (wave===10) list.push('boss');
  return list;
}
export const refund = tower => Math.floor(tower.spent*.7);
export const towerStats = tower => {
  const t = TYPES[tower.type];
  return {...t, damage:t.damage*(1+tower.level*.7), range:t.range+tower.level*.3, interval:t.interval/(1+tower.level*.15)};
};
export class Game {
  constructor() {
    this.gold=160; this.lives=20; this.wave=0; this.best=0; this.state='ready';
    this.towers=[]; this.enemies=[]; this.effects=[]; this.queue=[]; this.spawnTimer=0;
    this.kills=0; this.nextId=1; this.message='Choose a lantern, then tap an open tile.';
    this.path=astar(GATE, KEEP, ROCKS);
  }
  blocked(extra) {
    const set=new Set(ROCKS);
    for (const t of this.towers) set.add(key(t));
    if (extra) set.add(key(extra));
    return set;
  }
  canPlace(x,y,type) {
    const p={x,y}, k=key(p), t=TYPES[type];
    if (!t || !Number.isInteger(x) || !Number.isInteger(y) || x<0 || y<0 || x>=COLS || y>=ROWS) return 'Choose a tile on the board.';
    if (['lost','won'].includes(this.state)) return 'Restart to build again.';
    if (k===key(GATE) || k===key(KEEP)) return 'The gate and keep must stay open.';
    if (this.blocked().has(k)) return 'That tile is occupied by stone or a lantern.';
    if (this.gold<t.cost) return `Need ${t.cost-this.gold} more gold for ${t.name}.`;
    if (this.enemies.some(e => key(e.cell)===k || (e.route[0] && key(e.route[0])===k))) return 'An enemy is crossing that tile. Try another.';
    const blocked=this.blocked(p);
    if (!astar(GATE,KEEP,blocked)) return 'Cannot build: this would block every path to the keep.';
    if (this.enemies.some(e => !astar(e.route[0] || e.cell,KEEP,blocked))) return 'Cannot build: this would trap an enemy with no path to the keep.';
    return null;
  }
  reroute() {
    const blocked=this.blocked(); this.path=astar(GATE,KEEP,blocked);
    for (const e of this.enemies) {
      const anchor=e.route[0] || e.cell;
      const path=astar(anchor,KEEP,blocked);
      e.route=e.route.length ? [anchor,...path.slice(1)] : path.slice(1);
    }
  }
  place(x,y,type) {
    const error=this.canPlace(x,y,type);
    if (error) { this.message=error; return {ok:false,error}; }
    const tower={x,y,type,level:0,spent:TYPES[type].cost,cooldown:0,id:this.nextId++};
    this.gold-=tower.spent; this.towers.push(tower); this.reroute();
    this.message=`${TYPES[type].name} lit. Enemies now follow the glowing route.`;
    return {ok:true,tower};
  }
  upgrade(id) {
    const tower=this.towers.find(t=>t.id===id);
    if (!tower || tower.level>=2) return false;
    const cost=TYPES[tower.type].upgrades[tower.level];
    if (this.gold<cost) {this.message=`Need ${cost-this.gold} more gold to upgrade.`;return false;}
    this.gold-=cost; tower.spent+=cost; tower.level++;
    this.message=`${TYPES[tower.type].name} upgraded to level ${tower.level+1}.`;return true;
  }
  sell(id) {
    const tower=this.towers.find(t=>t.id===id); if (!tower) return 0;
    const gold=refund(tower); this.gold+=gold;
    this.towers=this.towers.filter(t=>t.id!==id); this.reroute();
    this.message=`Lantern sold for ${gold} gold (70% of investment).`;return gold;
  }
  startWave() {
    if (this.state!=='ready' || this.wave>=10) return false;
    this.wave++; this.best=Math.max(this.best,this.wave); this.queue=wavePlan(this.wave);
    this.spawnTimer=0; this.state='wave'; this.message=`Wave ${this.wave}: hold the lantern line.`; return true;
  }
  spawn(type) {
    const base=ENEMIES[type], scale=1+(this.wave-1)*.16;
    const e={...base,type,id:this.nextId++,hp:base.hp*scale,maxHp:base.hp*scale,x:GATE.x,y:GATE.y,cell:{...GATE},route:this.path.slice(1),slowTime:0,slowFactor:1};
    this.enemies.push(e);return e;
  }
  damage(enemy, amount) {
    if (enemy.hp<=0) return;
    enemy.hp-=Math.max(1,amount-enemy.armor);
    if (enemy.hp<=0) {this.gold+=enemy.gold;this.kills++;this.effects.push({kind:'gold',x:enemy.x,y:enemy.y,text:`+${enemy.gold}`,ttl:.8,max:.8});}
  }
  update(dt) {
    this.effects=this.effects.filter(e => (e.ttl-=dt)>0);
    if (this.state!=='wave') return;
    this.spawnTimer-=dt;
    if (this.queue.length && this.spawnTimer<=0) {this.spawn(this.queue.shift());this.spawnTimer=Math.max(.38,.95-this.wave*.045);}
    for (const e of this.enemies) {
      if (e.hp<=0) continue;
      e.slowTime=Math.max(0,e.slowTime-dt);
      let distance=e.speed*(e.slowTime>0?e.slowFactor:1)*dt;
      while (distance>0 && e.route.length) {
        const target=e.route[0], dx=target.x-e.x,dy=target.y-e.y,d=Math.hypot(dx,dy);
        if (d<=distance) {e.x=target.x;e.y=target.y;e.cell={...target};e.route.shift();distance-=d;}
        else {e.x+=dx/d*distance;e.y+=dy/d*distance;distance=0;}
      }
      if (!e.route.length) {this.lives=Math.max(0,this.lives-e.lives);e.escaped=true;}
    }
    this.enemies=this.enemies.filter(e=>e.hp>0 && !e.escaped);
    if (this.lives<=0) {this.state='lost';this.message='The lantern has fallen. Build a new defense.';return;}
    for (const tower of this.towers) {
      tower.cooldown=Math.max(0,tower.cooldown-dt);
      if (tower.cooldown>0) continue;
      const stats=towerStats(tower);
      const targets=this.enemies.filter(e=>e.hp>0 && Math.hypot(e.x-tower.x,e.y-tower.y)<=stats.range);
      targets.sort((a,b)=>a.route.length-b.route.length || a.id-b.id);
      const target=targets[0]; if (!target) continue;
      tower.cooldown=stats.interval;
      this.effects.push({kind:tower.type,x:tower.x,y:tower.y,tx:target.x,ty:target.y,ttl:.22,max:.22});
      if (stats.splash) {
        for (const e of this.enemies) if (e.hp>0 && Math.hypot(e.x-target.x,e.y-target.y)<=stats.splash) this.damage(e,stats.damage);
      } else {
        this.damage(target,stats.damage);
        if (stats.slow && target.hp>0) {target.slowTime=2;target.slowFactor=Math.max(.25,stats.slow-tower.level*.07);}
      }
    }
    this.enemies=this.enemies.filter(e=>e.hp>0);
    if (!this.queue.length && !this.enemies.length) {
      this.state=this.wave===10?'won':'ready';
      const bonus=20+this.wave*3;this.gold+=bonus;
      this.message=this.state==='won'?'Dawn returns. The keep still shines.':`Wave ${this.wave} cleared! +${bonus} gold. Build, upgrade, then send the next wave.`;
    }
  }
}
