# Sound effects: sources

Every sound in Kingdom Chaos is synthesized at runtime in the browser with the Web Audio API
(`src/lib/sound.ts`): oscillator tones and filtered white-noise bursts. There are no audio files in
the repository, so there are no third-party assets or licences to track.

| Sound | Plays on | How it is made |
|---|---|---|
| roll | dice | four short band-passed noise clicks and a square blip |
| step | footsteps (moves, teleports) | low-passed noise thud with a soft triangle |
| capture | captures, pieces sent home | falling sawtooth pair over a noise hit |
| shieldUp / shieldBlock / shieldExpire | protection granted, an attack absorbed, a ward expiring | rising sine, bright triangle ping with a high noise sparkle, falling triangle |
| pickup / bank | gem collected / banked | rising triangle pair / three-note major arpeggio |
| portal | Witch portal hop | sliding sine and triangle sweep |
| bridge | bridges, tunnels, roads, terrain changes | low-passed noise rumble with a dropping square |
| golemSlam / spiderWeb / monsterAlert | monster attacks and battle start | low noise boom and sub sine / high triangle zip with noise / low sawtooth growl |
| dragonFire / fireMiss | Dragon Fire hit / miss | low rumble, rising band-passed roar and sawtooth / short cough and puff |
| strike / guard | Golem battle choices | noise crack and square / triangle clang |
| win | victory | five-note fanfare |

Sounds follow the Settings volume and the mute toggle in the game header (both saved in the browser).
Audio unlocks on the first tap or key press; if the browser blocks audio the game stays silent and
every event is still shown on the board and in text.
