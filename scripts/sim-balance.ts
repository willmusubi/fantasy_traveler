// §25 balance report — run: npx tsx scripts/sim-balance.ts
// Prints TTK (rounds of real tasks) tables across the level horizon, neutral vs
// exploit. Anchors: mook≈4, elite≈6, boss≈10 neutral; exploit ≤ ~2× faster;
// wipe rate low at-level. Tune src/domain/config.ts curves, re-run, never the formulas.

import { TTK_TARGET } from '../src/domain/config'
import type { EnemyArchetype } from '../src/domain/types'
import { summarize } from '../src/game/simulator'

const CHECKPOINTS = [1, 15, 30, 45, 60]
const ARCHETYPES: EnemyArchetype[] = ['mook', 'elite', 'boss']

console.log('§25 balance simulator — TTK in rounds (1 round = 1 real task)\n')
for (const arch of ARCHETYPES) {
  console.log(`── ${arch.toUpperCase()} (target ${TTK_TARGET[arch]}) ──────────────────────────────`)
  console.log('  Lv | neutral mean  p90  wipe% | exploit mean  p90 | speedup')
  for (const lv of CHECKPOINTS) {
    const n = summarize(lv, arch, false)
    const e = summarize(lv, arch, true)
    const speedup = (n.mean / e.mean).toFixed(2)
    console.log(
      `  ${String(lv).padStart(2)} |        ${n.mean.toFixed(1).padStart(5)} ${String(n.p90).padStart(4)}  ${(n.wipeRate * 100).toFixed(0).padStart(4)}% |        ${e.mean.toFixed(1).padStart(5)} ${String(e.p90).padStart(4)} | ×${speedup}`,
    )
  }
  console.log()
}
console.log('锚点检查: elite neutral ≈ 4-8 · boss ≈ 8-12 · exploit speedup ≤ ~2× · wipe% 低')
