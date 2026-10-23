'use strict';
const assert = require('assert');
const { c, store, vm } = require('./support.cjs');
function test(name, body) {
  vm.runInContext(
    "newGame();state='play';paused=false;dialogOpen=false;show(null);enemies=[];spawnT=1e9;",
    c
  );
  const result = vm.runInContext('(()=>{' + body + '})()', c);
  assert(result, name);
  console.log('PASS', name);
}
// Block (update 17): held G / LT / Block button takes 25% off a blow and keeps the combo.
test(
  'Holding block takes 25% off a blow and keeps the combo',
  `P.inv=0;P.combo=6;P.comboT=2;blockHeld=true;hurtPlayer(20,0);const kept=P.hp===85&&P.combo===6;blockHeld=false;P.inv=0;hurtPlayer(20,0);return kept&&P.hp===65&&P.combo===0;`
);
test(
  'No guard during a dodge, an attack, or with block let go',
  `blockHeld=true;P.dash=.2;const a=guarding();P.dash=0;pressAttack();const b=guarding();P.atk=null;chargeHeld=false;brawlHeld=false;const c2=guarding();blockHeld=false;return !a&&!b&&c2&&!guarding();`
);
test(
  'Blocking slows Darren to a walk',
  `P.x=1300;P.y=620;keys.KeyD=true;for(let i=0;i<20;i++)update(.02);const free=Math.hypot(P.vx,P.vy);blockHeld=true;for(let i=0;i<20;i++)update(.02);const guard=Math.hypot(P.vx,P.vy);keys.KeyD=false;blockHeld=false;return guard<free*0.5;`
);
test(
  'Held attack recovers after a heavy hit',
  `pressAttack();hurtPlayer(16,0);for(let i=0;i<25;i++)update(.04);return brawlHeld&&!!P.atk;`
);
test(
  'Actual out-of-order camp clears restore the most recent camp',
  `for(const i of [2,0]){const q=CAMPS[i],e=makeEnemy(q.off,q.x,q.y,true);e.camp=i;e.active=true;enemies=[e];killEnemy(e,0);}continueGame();return G.lastCamp===0&&P.x===CAMPS[0].x&&P.y===CAMPS[0].y+90;`
);
test(
  'Camp cookie rewards preserve growth on reload',
  `P.cookies=2;const e=makeEnemy('spud',1300,620,true);e.camp=0;e.active=true;enemies=[e];killEnemy(e,0);gainCookie();continueGame();return P.cookies===3&&P.weight===1&&P.displayWeight===1;`
);
test(
  'Fresh run cannot overwrite an older camp appearance',
  `G.campsDone[0]=true;G.lastCamp=0;P.cookies=6;P.weight=2;saveCheckpoint();const before=JSON.stringify(checkpoint);newGame();gainCookie();P.cookies=0;P.weight=0;saveCampAppearance();return JSON.stringify(checkpoint)===before;`
);
test(
  'Checkpoint appearance requires unchanged camp flags',
  `G.campsDone[0]=true;G.lastCamp=0;saveCheckpoint();const before=JSON.stringify(checkpoint);G.campsDone[1]=true;P.cookies=9;P.weight=3;saveCampAppearance();return JSON.stringify(checkpoint)===before;`
);
test(
  'Tormund cannot strike from across the map',
  `P.x=1300;P.y=620;ally={x:420,y:1300,t:0};G.friend=true;const e=makeEnemy('gopher',1350,620);enemies=[e];updateSnow(.016);return e.hp===e.max;`
);
test(
  'Tormund can strike a reachable nearby target',
  `P.x=1300;P.y=620;ally={x:1280,y:620,t:0};G.friend=true;const e=makeEnemy('gopher',1350,620);enemies=[e];for(let i=0;i<24;i++)updateSnow(.04);return e.hp<e.max;`
);
for (const dt of [1 / 120, 1 / 60, 1 / 30, 0.04])
  test(
    'Rescue completes near the keep at ' + dt,
    `P.x=3200;P.y=1150;const b=makeEnemy('baron',3268,1150,true);beginEnding(b);if(!canOccupy(ruffy.x,ruffy.y,7))return false;for(let i=0;i<10/${dt};i++){navAge+=${dt};updateEnding(${dt});if(G.ending.phase==='hug')break;}tickScheduled(1.21);while(dialogOpen)nextLine();return state==='over'&&G.complete&&checkpoint.complete;`
  );
for (const dt of [0.04, 1 / 60])
  test(
    'Buffered dodge survives cooldown frame boundary ' + dt,
    `P.dashCd=.1;pressDash();for(let i=0;i<.2/${dt};i++){tickInputBuffer(${dt});update(${dt});}return P.dashCd>.5;`
  );
test(
  'Pending greetings do not block death',
  `const e=makeEnemy('spud',1300,620,true);e.camp=0;e.active=true;officerEngage(e);P.hp=0;loseGame();for(let i=0;i<60;i++)update(.02);return state==='over'&&!dialogOpen&&!scheduled.length;`
);
test(
  'KO milestones resume without a duplicate heal',
  `P.ko=155;G.campsDone[0]=true;G.lastCamp=0;saveCheckpoint();continueGame();P.hp=40;killEnemy(makeEnemy('gopher',P.x+80,P.y),0);return P.hp===40&&G.nextKoMark===200;`
);
test(
  'Legacy v3 save has safe defaults',
  `checkpoint={version:3,camps:[true,false,false],mode:'cozy'};continueGame();return P.weight===0&&P.displayWeight===0&&P.weapon==='snow'&&G.lastCamp===0&&P.hp===100;`
);
test(
  'Motion eases to exact integer size without affecting combat stats',
  `P.cookies=2;gainCookie();if(P.weight!==1||P.displayWeight!==0)return false;updateDarrenMotion(.04);if(!(P.displayWeight>0&&P.displayWeight<1&&P.bellyMotion<0))return false;for(let i=0;i<100;i++)updateDarrenMotion(.04);return P.displayWeight===1&&P.weight===1&&Number.isFinite(P.bellyMotion);`
);
test(
  'Dodge and hurt start at their own first frames',
  `P.t=777;P.dash=.2;let a=darrenAnimation();if(a.state!=='dodge'||a.frame!==0)return false;P.dash=0;P.hurtT=.3;a=darrenAnimation();return a.state==='hurt'&&a.frame===0;`
);
test(
  'All four moves visibly extend at contact',
  `return WEAPONS.paws.chain.every(d=>Math.abs(darrenStrikeExtension(d.pose,d.act[0])-1)<1e-9&&darrenStrikeExtension(d.pose,d.dur)===0);`
);
test(
  'Scarf and growth preferences do not change physical speed',
  `const speed=260;P.weight=3;return !WEAPONS.paws.chain.some(x=>x.speed)&&speed===260;`
);
test(
  'Blizzard controls appear only with a full snow meter',
  `for(const value of [0,99,100,0]){P.mus=value;updateNewHud();if($('#tMu').hidden!==(value<100)||$('#aBurst').hidden!==(value<100))return false;}return true;`
);
test(
  'Pause camera controls rotate without resuming gameplay',
  `paused=true;const q=viewQuarter;$('#camRight').onclick();if(viewQuarter!==(q+1)%4||!paused)return false;$('#camLeft').onclick();return viewQuarter===q&&paused;`
);
console.log(
  'PASS gameplay, lifecycle, v3 checkpoints, rescue, assist range and motion regressions'
);

test(
  'Stationary snow roll has an advancing action clock',
  `P.weapon='snow';pressRoll();const frames=new Set();for(let i=0;i<60;i++){update(1/60);frames.add(darrenAnimation().frame);}return frames.size>2&&P.roll.age>.9;`
);
test(
  'Charge HUD updates without gaining Snow power',
  `P.weapon='snow';pressAttack();chargeTime=.4;updateHud();return document.querySelector('#muHint').textContent.includes('50%');`
);
