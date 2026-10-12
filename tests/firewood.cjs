'use strict';
const assert = require('assert');
const { c, vm, store } = require('./support.cjs');
const run = (s) => vm.runInContext(s, c);
run('initAudio=()=>{}');
function fresh() {
  run('startFirewood(false);while(dialogOpen)nextLine();enemies=[];');
}
fresh();
assert(
  run(
    "G.firewood&&!G.firewood.met&&enemies.length===0&&ally.kind==='tormund'&&bucky.kind==='bucky'"
  )
);
run('P.x=bucky.x;P.y=bucky.y;updateFirewood(.04)');
assert(run('dialogOpen&&G.firewood.met'));
run('while(dialogOpen)nextLine()');
assert(store.has('darren-firewood-v1'));
console.log('PASS chapter entry and Bucky meeting');
// Hits are animation-gated and cannot reach through terrain or out of range.
for (const kind of ['tormund', 'bucky']) {
  fresh();
  run(
    `{P.x=1220;P.y=1320;const a=storyFriend('${kind}',1220,1320);const e=makeEnemy('bale',1290,1320);e.hp=e.max=500;enemies=[e];updateStoryCompanion(a,.04,'${kind}');a.cooldown=0;updateStoryCompanion(a,.04,'${kind}');window.testActor=a;window.testEnemy=e;}`
  );
  assert.equal(run('testEnemy.hp'), 500);
  run(`for(let i=0;i<15;i++)updateStoryCompanion(testActor,.04,'${kind}')`);
  assert(run('testEnemy.hp<500'));
  const hp = run('testEnemy.hp');
  run(`for(let i=0;i<20;i++)updateStoryCompanion(testActor,.04,'${kind}')`);
  assert.equal(run('testEnemy.hp'), hp);
  run(
    `testActor.cooldown=0;testEnemy.x=testActor.x+70;updateStoryCompanion(testActor,.04,'${kind}');testEnemy.x=2400;for(let i=0;i<25;i++)updateStoryCompanion(testActor,.04,'${kind}')`
  );
  assert.equal(run('testEnemy.hp'), hp);
}
console.log('PASS timed sword/mallet impacts, one hit per swing, no remote hits');
fresh();
run('ally.x=P.x+30;ally.y=P.y;P.inv=0;hurtPlayer(20,0)');
assert.equal(run('P.hp'), 85);
assert(run('ally.shieldT>0'));
console.log('PASS nearby Tormund shield guard');
// Retained chapter-one save must never be overwritten by chapter-two progress.
run('newGame();G.campsDone[0]=true;G.lastCamp=0;saveCheckpoint()');
const rescueSave = store.get('darren-snowday-v3');
fresh();
run(
  'G.firewood.met=true;G.firewood.collected[0]=true;saveCheckpoint();P.weight=2;P.cookies=6;saveCampAppearance();startFirewood(true);while(dialogOpen)nextLine()'
);
assert(run('G.firewood.met&&G.firewood.collected[0]&&P.weight===2&&P.hp===100'));
assert.equal(store.get('darren-snowday-v3'), rescueSave);
console.log('PASS separate resumable chapter save and rescue-save preservation');
// Simulate actual traversable routes and automatic companion combat through the complete quest.
// Like a player, the robot walks over to a pile guard that stays out of the friends' reach.
fresh();
run('P.inv=9999');
let finished = false;
for (let i = 0; i < 14000; i++) {
  run(
    `if(dialogOpen){while(dialogOpen)nextLine();}if(state==='play'){const site=G.firewood.collected.findIndex(v=>!v),guard=enemies.find(e=>!e.dead&&e.woodSite===site&&Math.hypot(e.x-P.x,e.y-P.y)>110),target=guard||firewoodTarget();if(target){const d=Math.hypot(target.x-P.x,target.y-P.y);if(d>55){if(navTarget!==cellId(target.x,target.y))buildNavigation(target.x,target.y);const angle=navDirection(P,target.x,target.y);terrainMove(P,Math.cos(angle)*8,Math.sin(angle)*8,14);}}P.inv=9999;update(.04);}`
  );
  if (run("state==='over'&&G.firewood.complete")) {
    finished = true;
    break;
  }
}
assert(
  finished,
  run(
    'JSON.stringify({P:[P.x,P.y],bucky:[bucky.x,bucky.y],quest:G.firewood,enemies:enemies.filter(e=>!e.dead).map(e=>[e.x,e.y,e.hp])})'
  )
);
assert(run('G.firewood.collected.every(Boolean)&&firewoodSave.complete'));
assert.equal(store.get('darren-snowday-v3'), rescueSave);
console.log('PASS full walkable firewood trip, companion combat, six bundles and home ending');
fresh();
run(
  'G.firewood.met=true;G.firewood.collected[0]=true;saveFirewood();P.hp=0;loseGame();tickScheduled(1)'
);
assert(run("state==='over'&&!$('#endContinue').hidden&&!dialogOpen"));
run("$('#endContinue').onclick();while(dialogOpen)nextLine()");
assert(run("state==='play'&&P.hp===100&&G.firewood.collected[0]"));
console.log('PASS chapter defeat and retry preserves gathered wood');

run("$('#again').onclick();while(dialogOpen)nextLine()");
assert(run('G.firewood&&!G.firewood.met&&!G.firewood.collected.some(Boolean)'));
console.log('PASS replay restarts the current firewood chapter');
