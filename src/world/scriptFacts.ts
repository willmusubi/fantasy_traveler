// §23: render the player's persistent story flags as an AI-context block. This is the GENERALITY
// seam — both quest generation (storyline) and chat read it, so any in-app improvised content stays
// consistent with the alternate history the player created (e.g. a rescued character is "alive").
// Pure + data-driven (no per-IP code): the meanings come from the ScriptDef's flag declarations.

import type { ScriptDef } from '../domain/types'

/** Render active story flags as a 「已确定事实」 block. Returns '' when no flags are set (callers
 *  append conditionally). Uses the ScriptDef's flag `description` + enumerated `values` meanings when
 *  available; falls back to `key：value` for undeclared flags. */
export function renderScriptFacts(
  scriptFlags: Record<string, string | boolean>,
  script?: ScriptDef,
): string {
  const keys = Object.keys(scriptFlags)
  if (keys.length === 0) return ''
  const defByKey = new Map((script?.flags ?? []).map((f) => [f.key, f]))
  const lines = keys.map((k) => {
    const v = scriptFlags[k]
    const def = defByKey.get(k)
    const meaning = def?.values && typeof v === 'string' ? def.values[v] : undefined
    const label = def?.description ?? k
    return `- ${label}：${meaning ?? String(v)}`
  })
  return ['【当前剧情既定事实（请严格遵守，后续剧情/对话须与之一致）】', ...lines].join('\n')
}
