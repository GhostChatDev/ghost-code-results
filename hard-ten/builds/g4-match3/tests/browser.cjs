const { chromium } = require('@playwright/test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const server = http.createServer((req,res)=>{
 if(req.url==='/favicon.ico'){res.writeHead(204);return res.end();}
 res.setHeader('Content-Type','text/html; charset=utf-8');
 res.end(fs.readFileSync(path.join(__dirname,'../index.html')));
});
(async()=>{
 await new Promise(r=>server.listen(4173,'127.0.0.1',r));
 // Prefer a preinstalled browser in restricted CI; never bypass a browser test.
 function installedBrowser(dir,depth=0){
  if(depth>5||!fs.existsSync(dir))return null;
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const file=path.join(dir,entry.name);
   if(entry.isFile()&&['chrome','chromium','chrome-headless-shell'].includes(entry.name))return file;
   if(entry.isDirectory()){const found=installedBrowser(file,depth+1);if(found)return found;}
  }return null;
 }
 const executable=process.env.CHROMIUM_PATH||['/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'].find(p=>fs.existsSync(p))||installedBrowser('/opt/pw-browsers')||installedBrowser(path.join(require('node:os').homedir(),'.cache/ms-playwright'));
 const browser=await chromium.launch(executable?{executablePath:executable}:{});
 const errors=[];
 const context=await browser.newContext({viewport:{width:1280,height:900}});
 const page=await context.newPage();
 page.on('pageerror',e=>errors.push(e.message));
 page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 page.on('requestfailed',r=>errors.push(r.url()+' '+r.failure()?.errorText));
 const tile=i=>page.locator(`#board .tile:not(.removing)[data-index="${i}"]`);
 async function settled(){await page.waitForFunction(()=>!busy);await page.waitForFunction(()=>document.querySelectorAll('#board .tile').length===64);}
 async function pair(valid=true,best=false){return page.evaluate(({valid,best})=>{
  let found=null,max=-1;
  for(let a=0;a<64;a++)for(const b of[a+1,a+8]){
   if(!engine.adjacent(a,b))continue;
   const copy=new TideEngine(engine.seed,engine.snapshot());const r=copy.turn(a,b);
   if(r.valid!==valid)continue;
   if(!best)return[a,b];
   if(r.score>max){max=r.score;found=[a,b];}
  }return found;
 },{valid,best});}
 async function tapPair(p){assert.ok(p,'a swap must exist');await tile(p[0]).click();await tile(p[1]).click();await settled();}
 try {
  await page.goto('http://127.0.0.1:4173');
  await settled();
  assert.equal(await page.locator('#board .tile').count(),64);
  assert.ok(await page.evaluate(()=>engine.matches().length===0&&engine.hasMove()));
  await page.locator('#guide').click();assert.equal(await page.locator('#modal-title').textContent(),'Welcome to the tidepool.');
  await page.locator('#modal-primary').click();assert.equal(await page.locator('#modal').isVisible(),false);
  await page.locator('#mute').click();assert.equal(await page.locator('#mute').textContent(),'Sound on');
  await page.locator('#mute').click();assert.equal(await page.locator('#mute').textContent(),'Sound off');
  await page.locator('#hint').click();assert.equal(await page.locator('.tile.selected').count(),2);
  await page.locator('#pause').click();assert.equal(await page.locator('#modal-title').textContent(),'A quiet moment.');
  await page.locator('#modal-primary').click();assert.equal(await page.locator('#modal').isVisible(),false);
  const before=await page.evaluate(()=>JSON.stringify(engine.snapshot()));
  const movesBefore=await page.locator('#moves').textContent();
  await tapPair(await pair(false));
  assert.equal(await page.evaluate(()=>JSON.stringify(engine.snapshot())),before);
  assert.equal(await page.locator('#moves').textContent(),movesBefore);
  const drag=await pair();const a=await tile(drag[0]).boundingBox(),b=await tile(drag[1]).boundingBox();
  await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
  await page.mouse.move(b.x+b.width/2,b.y+b.height/2,{steps:5});await page.mouse.up();await settled();
  assert.equal(Number(await page.locator('#moves').textContent()),Number(movesBefore)-1);
  assert.ok(await page.evaluate(()=>score>0));
  await page.locator('#pause').click();await page.locator('#modal-secondary').click();await settled();
  assert.equal(await page.locator('#moves').textContent(),'20');
  await tile(0).focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(()=>selected),1);await page.keyboard.press('Enter');
  // Earn progress through genuine swaps using the game's rules to select a good move.
  for(let i=0;i<20&&await page.evaluate(()=>playing);i++)await tapPair(await pair(true,true));
  assert.ok(await page.evaluate(()=>progress[0]>0),'level one must be winnable');
  assert.match(await page.locator('#modal-title').textContent(),/beautiful/);
  const stars=await page.evaluate(()=>progress[0]);
  await page.locator('#modal-secondary').click();
  assert.equal(await page.locator('#level-grid button').count(),12);
  assert.equal(await page.locator('#level-grid button').nth(1).isEnabled(),true);
  await page.locator('#level-grid button').nth(1).click();
  assert.match(await page.locator('#goal').textContent(),/Collect/);
  await page.reload();await settled();
  assert.equal(await page.evaluate(()=>progress[0]),stars);
  await page.locator('#levels').click();
  assert.match(await page.locator('#level-grid button').first().textContent(),/★/);
  await page.locator('#modal-primary').click();
  await fs.promises.mkdir('artifacts',{recursive:true});
  await page.screenshot({path:'artifacts/desktop.png',fullPage:true});
  for(const size of[{width:768,height:1024},{width:390,height:844},{width:360,height:740}]){
   await page.setViewportSize(size);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow');
   assert.ok(await page.evaluate(()=>document.querySelector('#pause').getBoundingClientRect().bottom<=innerHeight),'controls fit portrait viewport');
   await page.screenshot({path:`artifacts/${size.width}.png`,fullPage:true});
  }
  const touch=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const phone=await touch.newPage();phone.on('pageerror',e=>errors.push(e.message));
  await phone.goto('http://127.0.0.1:4173');await phone.waitForFunction(()=>!busy);
  await phone.locator('#hint').tap();
  const hints=await phone.locator('.tile.selected').evaluateAll(es=>es.map(e=>e.dataset.index));
  for(const i of hints)await phone.locator(`#board .tile[data-index="${i}"]`).tap();
  await phone.waitForFunction(()=>!busy);assert.equal(await phone.locator('#moves').textContent(),'19');
  const t=await phone.evaluate(()=>clock);await phone.waitForFunction(t=>clock>t+.05,t);
  assert.deepEqual(errors,[]);console.log('PASS: drag, touch/tap swaps, rollback, hint, pause, restart, keyboard, goals, stars, refresh and portrait layout');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error('FAIL:',e);process.exitCode=1;server.close();});
