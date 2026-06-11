// §25 balance report — run: npx tsx scripts/sim-balance.ts
// Prints TTK (rounds of real tasks) tables across the level horizon, neutral vs
// exploit. Anchors: mook≈4, elite≈6, boss≈10 neutral; exploit ≤ ~2× faster;
// wipe rate low at-level. Tune src/domain/config.ts curves, re-run, never the formulas.

import { TTK_TARGET } from '../src/domain/config'
import type { EnemyArchetype } from '../src/domain/types'
import { summarize, summarizeSpec } from '../src/game/simulator'

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

// ── SLEEP WINDOW (sleepRounds:2) vs baseline boss ───────────────────────────
// Sleep freezes the ENEMY's output, not the party's — so at the comfortable baseline
// (wipe% ≈ 0) it cannot speed the kill. Its tactical value is SURVIVAL: in a high-
// pressure fight (poolScale 0.3 ≈ an under-leveled / battered party) avoided wipes
// mean the boss never heals back 30%, which is what shortens the fight. That high-
// pressure framing is also what sim.guard.test.ts asserts.
console.log()
console.log('── BOSS + sleepRounds:2 under pressure (poolScale 0.3) ─────────────')
console.log('  Lv | base mean  wipe% | sleep-2 mean  wipe% | Δ rounds')
for (const lv of CHECKPOINTS) {
  const base = summarizeSpec({ level: lv, archetype: 'boss', exploit: false, poolScale: 0.3 }, 300)
  const slept = summarizeSpec({ level: lv, archetype: 'boss', exploit: false, sleepRounds: 2, poolScale: 0.3 }, 300)
  const delta = (base.mean - slept.mean).toFixed(1)
  console.log(
    `  ${String(lv).padStart(2)} |     ${base.mean.toFixed(1).padStart(5)}  ${(base.wipeRate * 100).toFixed(0).padStart(4)}% |       ${slept.mean.toFixed(1).padStart(5)}  ${(slept.wipeRate * 100).toFixed(0).padStart(4)}% | -${delta}`,
  )
}
console.log('睡眠窗口: 高压战局里冻结出招表 → 团灭更少 → boss 回血更少 → TTK 更低')
