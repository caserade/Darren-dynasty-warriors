# Darren Snowday

Read PHONE-PLAY.txt, FIREWOOD-CHAPTER.txt, HUD-CLEANUP.txt, STORYBOOK-UPDATE.txt, ELEVATED-ART-UPDATE.txt, SOFT-STEPS-UPDATE.txt and prior release notes before editing. Keep this
project separate from FAU, Feastbreaker and Middle World. Preserve Phaser 3.90,
the existing isometric world/story, bare-paws and snow combat, supplied Darren
identity and nonsexual featureless torso. Maintain owner-private publishing.

Static dist/index.html loads shared-save (also used by dist/3d/), controls, game, pixel-art, assets/darren-isometric,
darren-art, assets/storybook-scenery, storybook, isometric-world, firewood, phone, then phaser-scene. Integer P.weight is combat/save authority; P.displayWeight and
belly springs are cosmetic only. Checkpoint schema stays version 3. Appearance
writeback requires the current run token and identical cleared-camp flags.
Never render changing float weights through full-atlas generation. Live hero
and trail frames use bounded padded canvas textures with a shared foot origin.

Run node tests/gameplay.cjs, node tests/firewood.cjs, node tests/phone.cjs and node tools/verify-scene.cjs. The latter is a
native Canvas Phaser API stand-in, not a browser or device certification.
Preserve test limitations in release notes; do not repeat historical browser
claims as verification of new changes.
