// Expression-key contract (Appendix A.1, §11). The LLM returns a constrained key;
// we validate it and coerce extended keys to the nearest core key (M0 ships core art).

import type { ExpressionKey } from '../domain/types'

export const EXPRESSION_KEYS: ExpressionKey[] = [
  'neutral', 'smile', 'happy', 'blush', 'sad', 'worried',
  'angry', 'determined', 'disdain', 'sly', 'surprised', 'thinking', 'heartthrob', 'tired',
]

export const CORE_EXPRESSIONS: ExpressionKey[] = [
  'neutral', 'smile', 'happy', 'blush', 'sad', 'worried', 'angry', 'determined', 'disdain', 'sly',
]

const EXTENDED_TO_CORE: Record<string, ExpressionKey> = {
  heartthrob: 'blush',
  tired: 'neutral',
  surprised: 'happy',
  thinking: 'neutral',
}

const VALID = new Set<string>(EXPRESSION_KEYS)
const CORE = new Set<string>(CORE_EXPRESSIONS)

/**
 * Validate an expression from the model. Unknown -> 'neutral'. When `coreOnly`
 * (default, since M0 ships only core art), extended keys map to the nearest core.
 */
export function coerceExpression(raw: unknown, coreOnly = true): ExpressionKey {
  if (typeof raw !== 'string' || !VALID.has(raw)) return 'neutral'
  if (coreOnly && !CORE.has(raw)) return EXTENDED_TO_CORE[raw] ?? 'neutral'
  return raw as ExpressionKey
}
