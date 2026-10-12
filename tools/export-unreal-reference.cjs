'use strict';
// Read-only data export for a separate Unreal/Blender rebuild.
const fs = require('node:fs'),
  path = require('node:path');
const { c, vm } = require('../tests/support.cjs');
const data = vm.runInContext(
  `({world:WORLD,start:START,keep:HOLLOW,camps:CAMPS,terraces:TERRACES,ramps:RAMPS,trails:TRAILS,weapons:WEAPONS,officers:OFFICERS,sizeNames:SIZE_NAMES,defaultControllerBindings:DEFAULT_BINDINGS,animationStates:DARREN_STATES,scenery:props})`,
  c
);
const out = path.resolve(process.argv[2] || 'game-reference.json');
fs.writeFileSync(
  out,
  JSON.stringify(
    {
      formatVersion: 1,
      description:
        'Browser-game reference data. Coordinates use existing game world units; map deliberately to Unreal units.',
      ...data,
    },
    null,
    2
  ) + '\n'
);
console.log(out);
