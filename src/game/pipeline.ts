// The impure applier (§21/§22): reads fresh state inside ONE IndexedDB readwrite
// transaction, runs the pure reducer, persists the patches atomically (RMW-safe),
// instantiates recruited companions, and returns the result. The reducer stays pure.

import { freshAffinity } from '../companion/affinity'
import { createCompanionCharacter } from '../companion/roster'
import { getDB, SINGLETON } from '../data/db'
import { withGameStateDefaults } from '../data/repositories'
import { COMBAT_LOG_CAP } from '../domain/config'
import { localDateKey } from '../domain/dates'
import { materializeQuest } from '../ai/storyline'
import { buildLogEntry } from './combatLog'
import { teamFromEncounter } from './combat'
import { withStatsDefaults } from '../companion/roster'
import type { Affinity, Character } from '../domain/types'
import { activeSynergiesFor } from '../world/relationships'
import { scriptDefFor } from '../world/worlds'
import type { DomainEvent } from './events'
import { gameReducer, type ReducerResult } from './reducer'

const TX_STORES = ['gameState', 'affinity', 'characters', 'todos', 'quests', 'settings'] as const

function newId(): string {
  return crypto.randomUUID()
}

export interface DispatchOptions {
  /** Extra writes to run in the SAME transaction before state is read (e.g. mark a todo done). */
  prewrite?: (stores: {
    todos: import('idb').IDBPObjectStore<
      import('../data/db').FTSchema,
      typeof TX_STORES,
      'todos',
      'readwrite'
    >
  }) => Promise<void>
}

export async function dispatchEvent(
  event: DomainEvent,
  opts: DispatchOptions = {},
): Promise<ReducerResult> {
  const db = await getDB()
  const tx = db.transaction(TX_STORES, 'readwrite')
  const gsStore = tx.objectStore('gameState')
  const affStore = tx.objectStore('affinity')
  const charStore = tx.objectStore('characters')
  const todoStore = tx.objectStore('todos')
  const questStore = tx.objectStore('quests')

  if (opts.prewrite) await opts.prewrite({ todos: todoStore })

  const rawGameState = await gsStore.get(SINGLETON)
  if (!rawGameState) throw new Error('dispatchEvent: no game state — call seedNewGame first')
  // Normalize §22 defaults here too: gsStore.get bypasses gameStateRepo.get, so without
  // this a pre-v2 save would flow through the reducer and back into the live store
  // un-backfilled, blanking renderers that read e.g. unlockedCompanionIds.
  const gameState = withGameStateDefaults(rawGameState)

  const characters = (await charStore.getAll()).map(withStatsDefaults)
  const affList = await affStore.getAll()
  const todos = await todoStore.getAll()
  // §26 smart auto tactics: opt-in via Settings.autoTactics (the settings store backfills it
  // to true for app users; raw fixtures/tests without a settings record stay 'plain').
  const settings = await tx.objectStore('settings').get(SINGLETON)
  const tactics = settings?.autoTactics === true ? ('smart' as const) : ('plain' as const)
  const quest = gameState.activeQuestId ? await questStore.get(gameState.activeQuestId) : undefined
  // §23: the active branching script (resolved from content), threaded into the pure reducer so it
  // can read chapter transitions; also used below to materialize the next chapter on advance.
  const script = gameState.activeScriptId ? scriptDefFor(gameState.activeScriptId) : undefined

  const party = gameState.partyIds
    .map((id) => characters.find((c) => c.id === id))
    .filter((c): c is Character => Boolean(c))
  const affinities: Record<string, Affinity> = Object.fromEntries(
    affList.map((a) => [a.characterId, a]),
  )
  const openHighCount = todos.filter((t) => t.status === 'open' && t.priority === 'high').length
  const activeSynergies = activeSynergiesFor(
    party.filter((c) => c.kind === 'companion').map((c) => c.id),
  )

  // Pure reduction — no clock/rng read inside.
  const result = gameReducer(
    {
      gameState,
      affinities,
      party,
      now: new Date(),
      newId,
      roll: Math.random, // §25: live RNG enters ONLY here — the reducer stays pure
      tactics, // §26 smart auto tactics (Settings.autoTactics)
      openHighCount,
      ownedEquipment: gameState.ownedEquipment ?? [],
      activeSynergies,
      quest,
      script,
    },
    event,
  )

  // Append a combat-log round (resolved names/numbers) for the UI's expandable history.
  // An interactive round spans MULTIPLE dispatches (RoundBegan + N×RoundAdvanced); only the
  // FINALIZING dispatch carries result.roundLog (the full round's effects + snapshots), so non-final
  // round dispatches add no entry. Every other event logs from its own effects, per dispatch.
  const isRoundEvent = event.type === 'RoundBegan' || event.type === 'RoundAdvanced'
  const logEffects = isRoundEvent ? result.roundLog?.effects : result.effects
  if (logEffects) {
    const entry = buildLogEntry(logEffects, {
      characters,
      // The enemy team fought this round (before any victory respawn). For an interactive round that's
      // the snapshot taken at round start; otherwise the team at the start of this dispatch.
      enemies: result.roundLog?.enemies ?? gameState.enemies,
      source: event.type,
      goldDelta: result.roundLog?.goldDelta ?? result.gameState.gold - gameState.gold,
      at: new Date().toISOString(),
      id: newId(),
    })
    if (entry) {
      result.gameState = {
        ...result.gameState,
        combatLog: [...result.gameState.combatLog, entry].slice(-COMBAT_LOG_CAP),
      }
    }
  }

  // Persist patches atomically (still inside the tx — only sync work happened above).
  await gsStore.put(result.gameState, SINGLETON)
  for (const a of Object.values(result.affinities)) await affStore.put(a)
  for (const [id, stats] of Object.entries(result.characterStats)) {
    const c = characters.find((ch) => ch.id === id)
    if (c) await charStore.put({ ...c, stats })
  }

  // §22 side-effects: instantiate recruits + mark a completed quest, atomically.
  const now2 = new Date()
  const today = localDateKey(now2)
  for (const e of result.effects) {
    if (e.type === 'recruited') {
      await charStore.put(createCompanionCharacter(e.companionId, now2))
      await affStore.put(freshAffinity(e.companionId, today))
    } else if (e.type === 'questCompleted' && quest) {
      await questStore.put({ ...quest, status: 'completed' })
    } else if (e.type === 'scriptChapterAdvanced' && script) {
      // §23: materialize the next chapter into a Quest + spawn its first encounter, in THIS tx
      // (the pure reducer set the chapter pointer but has no quest data to spawn). Mirrors
      // questStore.startQuest's open sequence: write the quest, set activeQuestId + enemies.
      const ch = script.chapters[e.chapterId]
      if (ch) {
        const nextQuest = materializeQuest(ch, script.worldId, now2, newId, '')
        await questStore.put(nextQuest)
        const enemies = teamFromEncounter(nextQuest.encounters[0], result.gameState.storyStage, openHighCount, newId)
        result.gameState = { ...result.gameState, activeQuestId: nextQuest.id, enemies, clearedEncounterKey: undefined }
        await gsStore.put(result.gameState, SINGLETON)
      }
    }
  }

  await tx.done
  return result
}
