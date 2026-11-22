const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { TideEngine } = require('../engine.js');
const latin = () => Array.from({ length:64 },(_,i)=>({kind:(Math.floor(i/8)+i%8)%6,special:null}));
const fixture = () => new TideEngine(42,latin());
const clearFrame = r => r.frames.find(f=>f.type==='clear');
function move(e, predicate = () => true) {
 for(let a=0;a<64;a++)for(const b of[a+1,a+8]){
  if(!e.adjacent(a,b))continue;
  const copy=new TideEngine(e.seed,e.snapshot());
  const r=copy.turn(a,b);if(r.valid&&predicate(r))return {a,b,r,copy};
 }
}
test('single-file game embeds exactly the independently tested engine',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const embedded=html.match(/<script id="rules">\n([\s\S]*?)<\/script>/)[1];
 assert.equal(embedded.trim(),fs.readFileSync('engine.js','utf8').trim());
});
test('seeded generation is reproducible, match-free and playable across 100 seeds',()=>{
 for(let s=0;s<100;s++){
  const a=new TideEngine(s),b=new TideEngine(s);
  assert.deepEqual(a.board,b.board);assert.equal(a.matches().length,0);assert.ok(a.hasMove());
  assert.equal(a.board.length,64);assert.ok(a.board.every(t=>t.kind>=0&&t.kind<6));
 }
});
test('finds horizontal and vertical matches without wrapping rows',()=>{
 const e=fixture();e.board[0].kind=e.board[1].kind=e.board[2].kind=5;
 e.board[23].kind=e.board[31].kind=e.board[39].kind=4;
 assert.ok(e.matches().some(r=>r.dir==='row'&&r.cells.join(',')==='0,1,2'));
 assert.ok(e.matches().some(r=>r.dir==='col'&&r.cells.includes(23)&&r.cells.includes(39)));
 assert.equal(e.adjacent(7,8),false);assert.equal(e.adjacent(-1,0),false);
});
test('invalid swap rolls back exactly and does not score',()=>{
 const e=fixture(),before=e.snapshot(),r=e.turn(0,1);
 assert.equal(r.valid,false);assert.equal(r.score,0);assert.deepEqual(e.snapshot(),before);
 assert.deepEqual(r.frames.map(f=>f.type),['swap','rollback']);
 assert.equal(e.turn(7,8).valid,false);
});
test('three clears, gravity retains survivor order, refill settles without matches',()=>{
 const e=fixture();[48,49,50].forEach(i=>e.board[i].kind=5);
 const before=e.snapshot(),r=e.resolve(),f=clearFrame(r),fall=r.frames.find(f=>f.type==='fall');
 assert.ok([48,49,50].every(i=>f.removed.includes(i)));
 assert.equal(fall.board[48].id,before[40].id);
 assert.equal(fall.board[56].id,before[56].id);
 assert.ok(r.score>=180);assert.equal(e.matches().length,0);assert.ok(e.hasMove());
 assert.equal(r.counts.reduce((a,b)=>a+b,0)*60<=r.score,true);
});
test('four makes a row special and five makes a colour bomb',()=>{
 for(const [length,special]of[[4,'line'],[5,'bomb']]){
  const e=fixture();for(let i=0;i<length;i++)e.board[i].kind=5;
  const r=e.resolve([1]);const tile=clearFrame(r).board[1];
  assert.equal(tile.special,special);assert.equal(tile.dir,'row');
 }
 const e=fixture();for(const i of[0,8,16,24])e.board[i].kind=5;
 assert.equal(clearFrame(e.resolve([8])).board[8].dir,'col');
});
test('line special fires when swapped, even without a normal match',()=>{
 for(const dir of['row','col']){
  const e=fixture();e.board[0].special='line';e.board[0].dir=dir;
  const r=e.turn(0,1),cells=clearFrame(r).removed;assert.equal(r.valid,true);
  const expected=Array.from({length:8},(_,n)=>dir==='row'?n:n*8+1);
  assert.ok(expected.every(i=>cells.includes(i)));
 }
});
test('line special fires when matched and chains into another special',()=>{
 const e=fixture();[0,1,2].forEach(i=>e.board[i].kind=5);
 e.board[1].special='line';e.board[1].dir='row';e.board[6].special='line';e.board[6].dir='col';
 const cells=clearFrame(e.resolve()).removed;
 assert.ok(Array.from({length:8},(_,n)=>n).every(i=>cells.includes(i)));
 assert.ok(Array.from({length:8},(_,n)=>n*8+6).every(i=>cells.includes(i)));
});
test('swapped colour bomb clears partner colour; matched bomb clears own colour',()=>{
 const e=fixture();e.board[0].special='bomb';const target=e.board[1].kind;
 const r=e.turn(0,1),swapped=r.frames[0].board,cells=clearFrame(r).removed;
 assert.ok(swapped.every((t,i)=>t.kind!==target||cells.includes(i)));
 const m=fixture();[0,1,2].forEach(i=>m.board[i].kind=5);m.board[1].special='bomb';
 const expected=m.board.flatMap((t,i)=>t.kind===5?[i]:[]);
 const matched=clearFrame(m.resolve());
 assert.ok(expected.every(i=>matched.removed.includes(i)));
});
test('two colour bombs clear the entire board',()=>{
 const e=fixture();e.board[0].special=e.board[1].special='bomb';
 assert.equal(clearFrame(e.turn(0,1)).removed.length,64);
});
test('deterministic cascades chain and apply a rising score multiplier',()=>{
 let found;
 for(let seed=1;seed<25&&!found;seed++) found=move(new TideEngine(seed),r=>r.frames.filter(f=>f.type==='clear').length>1);
 assert.ok(found);const clears=found.r.frames.filter(f=>f.type==='clear');
 assert.deepEqual(clears.map(f=>f.chain),clears.map((_,i)=>i+1));
 assert.equal(found.r.score,clears.reduce((sum,f)=>sum+f.removed.length*60*f.chain,0));
 assert.equal(found.copy.matches().length,0);
});
test('detects no moves and automatically reshuffles to a playable settled board',()=>{
 const e=fixture();assert.equal(e.matches().length,0);assert.equal(e.hasMove(),false);
 const r=e.resolve();assert.equal(r.frames.at(-1).type,'shuffle');
 assert.equal(e.matches().length,0);assert.ok(e.hasMove());
 const ids=e.board.map(t=>t.id).sort((a,b)=>a-b);e.reshuffle();
 assert.deepEqual(e.board.map(t=>t.id).sort((a,b)=>a-b),ids);
});
test('long seeded play remains full, settled and playable',()=>{
 const e=new TideEngine(2026);
 for(let i=0;i<70;i++){
  const next=move(e);assert.ok(next);const r=e.turn(next.a,next.b);
  assert.ok(r.valid);assert.equal(e.board.length,64);assert.ok(e.board.every(Boolean));
  assert.equal(new Set(e.board.map(t=>t.id)).size,64);assert.equal(e.matches().length,0);assert.ok(e.hasMove());
 }
});
