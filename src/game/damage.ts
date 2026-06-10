// §25 unified damage pipeline. EVERY damage path (task basic attacks, skills, enemy
// moves) resolves through rollDamage so hit/crit/weakness/element/variance behave
// identically everywhere. Pure: all randomness comes through the injected roll().
//
//   1. hit roll      rate = clamp(HIT_BASE + (hit−eva)×HIT_SLOPE, HIT_FLOOR, 100)%
//   2. crit roll     player side only: rate = min(CRIT_CAP, CRIT_BASE + skl×CRIT_PER_SKL)%
//   3. raw           POW × power × buffMult − DEF × DEF_SOAK
//   4. chip floor    ceil(POW × power × CHIP_FLOOR_PCT)  (no insulting min-1)
//   5. dmg           round(max(floor, raw) × clamp(phys×elem, 0.5, 2.0) × crit × variance)
//
// Crit and variance sit OUTSIDE the type-multiplier clamp by design: the exploit
// ceiling is weakness 1.5 × crit 1.6 ≈ 2.4× (the "解谜" reward), per the §25 anchors.

import {
  CHIP_FLOOR_PCT, CRIT_BASE, CRIT_CAP, CRIT_MULT, CRIT_PER_SKL, DEF_SOAK, DMG_VARIANCE,
  ELEM_ADV_MULT, ELEM_DISADV_MULT, ELEMENT_BEATS, HIT_BASE, HIT_FLOOR, HIT_SLOPE,
  PHYS_RESIST_MULT, PHYS_WEAK_MULT, TYPE_MULT_MAX, TYPE_MULT_MIN,
} from '../domain/config'
import type { Element, PhysKind } from '../domain/types'

export interface DamageInput {
  /** Attacker's offensive stat for this move: patk (str_eff) or matk (wis_eff). */
  pow: number
  /** Move coefficient: basic = priority mult; skills = power × SKILL_ATK_MULT. */
  power: number
  /** Party-wide damage buff multiplier folded by the caller (1 = none). */
  buffMult?: number
  /** Target's matching defense: pdef (vit/монster def) or mdef (spr/matk-side). */
  def: number
  attackerHit: number
  targetEva: number
  /** Present → player-side attack (eligible to crit). Enemies NEVER crit (§25). */
  attackerSkl?: number
  /** Extra crit % from gear/skills (future hook). */
  critBonusPct?: number
  /** This attack's physical category (weapon/skill kind). */
  physKind?: PhysKind
  attackerElement?: Element
  targetElement?: Element
  targetWeak?: PhysKind[]
  targetResist?: PhysKind[]
  /** Injected RNG in [0, 1). Consumption order: hit → crit → variance. */
  roll: () => number
}

export interface DamageOutcome {
  /** Final damage; 0 iff missed. */
  dmg: number
  missed: boolean
  crit: boolean
  /** Clamped phys×elem product — >1 = 效果拔群, <1 = 效果不佳 (drives float text). */
  typeMult: number
}

/** Hit chance in % — clamped to [HIT_FLOOR, 100]. */
export function hitRate(hit: number, eva: number): number {
  const r = HIT_BASE + (hit - eva) * HIT_SLOPE
  return Math.min(100, Math.max(HIT_FLOOR, r))
}

/** Crit chance in % (player side). */
export function critRate(skl: number, bonusPct = 0): number {
  return Math.min(CRIT_CAP, CRIT_BASE + skl * CRIT_PER_SKL + bonusPct)
}

/** 弱点/抗性 multiplier from the attack's physical category (incl. arcane 弱魔). */
export function physMult(kind?: PhysKind, weak?: PhysKind[], resist?: PhysKind[]): number {
  if (!kind) return 1
  if (weak?.includes(kind)) return PHYS_WEAK_MULT
  if (resist?.includes(kind)) return PHYS_RESIST_MULT
  return 1
}

/** 五行 multiplier: attacker 克 target → adv; target 克 attacker → disadv. */
export function elementMult(attacker?: Element, target?: Element): number {
  if (!attacker || !target) return 1
  if (ELEMENT_BEATS[attacker] === target) return ELEM_ADV_MULT
  if (ELEMENT_BEATS[target] === attacker) return ELEM_DISADV_MULT
  return 1
}

/** Combined clamped type multiplier — exported for UI damage previews. */
export function typeMultiplier(
  kind?: PhysKind, attackerElem?: Element, targetElem?: Element,
  weak?: PhysKind[], resist?: PhysKind[],
): number {
  const m = physMult(kind, weak, resist) * elementMult(attackerElem, targetElem)
  return Math.min(TYPE_MULT_MAX, Math.max(TYPE_MULT_MIN, m))
}

/** Resolve one strike through the full §25 pipeline. */
export function rollDamage(input: DamageInput): DamageOutcome {
  const tm = typeMultiplier(
    input.physKind, input.attackerElement, input.targetElement,
    input.targetWeak, input.targetResist,
  )

  // 1. Hit (true miss — per-member on task attacks, so a real task never zeroes out).
  if (input.roll() * 100 >= hitRate(input.attackerHit, input.targetEva)) {
    return { dmg: 0, missed: true, crit: false, typeMult: tm }
  }

  // 2. Crit — player side only.
  let critM = 1
  let crit = false
  if (input.attackerSkl != null) {
    crit = input.roll() * 100 < critRate(input.attackerSkl, input.critBonusPct)
    if (crit) critM = CRIT_MULT
  }

  // 3-4. Raw with universal soak, chip-floored at 10% of the pre-mitigation hit.
  const buff = input.buffMult ?? 1
  const raw = input.pow * input.power * buff - input.def * DEF_SOAK
  const floor = Math.ceil(input.pow * input.power * CHIP_FLOOR_PCT)

  // 5. Multipliers: clamped type mult, then crit and ±variance OUTSIDE the clamp.
  const variance = 1 - DMG_VARIANCE + input.roll() * (2 * DMG_VARIANCE)
  const dmg = Math.max(1, Math.round(Math.max(floor, raw) * tm * critM * variance))
  return { dmg, missed: false, crit, typeMult: tm }
}
