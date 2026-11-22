import test from 'node:test';
import assert from 'node:assert/strict';
import {Game} from '../game-core.js';
import {draw} from '../game-view.js';

function canvasContext() {
  const fills=[];
  const ctx=new Proxy({fills}, {
    get(target, name) {
      if (name in target) return target[name];
      return (...args) => {
        if (name==='fillRect') fills.push({args, color:target.fillStyle, alpha:target.globalAlpha});
      };
    }
  });
  return ctx;
}

test('placement preview shows valid cells in gold and refused cells in red', () => {
  const game=new Game(), ctx=canvasContext();
  const preview=(x,y) => {
    ctx.fills.length=0;
    draw(ctx,game,{hover:{x,y},overlay:false,selected:null,type:'spark'},0);
    return ctx.fills.find(f=>f.alpha===.25 && f.args[0]===x*80 && f.args[1]===y*80)?.color;
  };
  assert.equal(game.canPlace(1,0,'spark'),null);
  assert.equal(preview(1,0),'#ffc76a');
  assert.match(game.canPlace(5,1,'spark'),/occupied/);
  assert.equal(preview(5,1),'#ff9c8b');
  game.gold=1000;
  assert.equal(game.place(0,3,'spark').ok,true);
  assert.equal(game.place(0,5,'spark').ok,true);
  assert.match(game.canPlace(1,4,'spark'),/block every path/);
  assert.equal(preview(1,4),'#ff9c8b');
});

test('last-kill effects expire during the build phase without advancing the wave', () => {
  const game=new Game();
  game.place(1,3,'spark');
  game.startWave();
  game.queue=[];
  const enemy=game.spawn('normal');
  enemy.hp=1;
  game.update(1/60);
  assert.equal(game.state,'ready');
  assert.ok(game.effects.some(e=>e.kind==='gold'));
  assert.ok(game.effects.some(e=>e.kind==='spark'));
  const gold=game.gold, wave=game.wave;
  for (let i=0;i<60;i++) game.update(1/60);
  assert.deepEqual(game.effects,[]);
  assert.equal(game.gold,gold);
  assert.equal(game.wave,wave);
});

for (const outcome of ['won','lost']) {
  test(`terminal overlay keeps effects aging after ${outcome}`, async () => {
    const originalUpdate=Game.prototype.update;
    const saved={document:globalThis.document,window:globalThis.window,localStorage:globalThis.localStorage,requestAnimationFrame:globalThis.requestAnimationFrame};
    let activeGame, callback;
    const ctx=canvasContext(), elements=new Map();
    const element=id=>{
      if (!elements.has(id)) elements.set(id,{
        id, hidden:false, disabled:false, textContent:'', dataset:{},
        setAttribute(){}, addEventListener(){},
        getContext(){return ctx;}
      });
      return elements.get(id);
    };
    globalThis.document={getElementById:element,querySelectorAll:()=>[],addEventListener(){},hidden:false};
    globalThis.window={addEventListener(){}};
    globalThis.localStorage={getItem(){return null;},setItem(){}};
    globalThis.requestAnimationFrame=fn=>{callback=fn;};
    Game.prototype.update=function(dt) {
      if (this.state==='wave') {
        this.state=outcome;
        this.effects.push({kind:'gold',x:0,y:0,text:'+9',ttl:.8,max:.8});
        activeGame=this;
      } else originalUpdate.call(this,dt);
    };
    try {
      await import(`../game.js?review=${outcome}`);
      element('overlayAction').onclick();
      element('waveButton').onclick();
      callback(1000);
      callback(1100);
      assert.equal(activeGame.state,outcome);
      assert.equal(element('overlay').hidden,false);
      assert.equal(activeGame.effects.length,1);
      for (let ms=1200;ms<=2500;ms+=100) callback(ms);
      assert.deepEqual(activeGame.effects,[]);
    } finally {
      Game.prototype.update=originalUpdate;
      for (const [name,value] of Object.entries(saved)) {
        if (value===undefined) delete globalThis[name]; else globalThis[name]=value;
      }
    }
  });
}
