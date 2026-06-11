// World / lore packs (static, data-driven like COMPANION_DEFS). This ships ONE original
// sample world (观星会) — an IP-free placeholder. Add your own worlds here, or generate them
// via your own workflow. `lore` + the antagonist roster are the cacheable prefix for AI
// generation; `storyChapters` are the canon spine (also the offline path). (§22)

import { LOCAL_PACK } from '../content/localPack'
import { validateScriptDef } from './validateScript'
import type { Element, EnemyArchetype, PhysKind, QuestBlueprint, ScriptChapter, ScriptDef, WorldId } from '../domain/types'

/** A canon antagonist for a world — becomes an encounter enemy and grounds the generator. */
export interface AntagonistDef {
  id: string
  displayName: string
  /** 设定 — who they are in canon; injected into the generator + UI lore. */
  description: string
  role: 'boss' | 'mook' | 'rival'
  // §25 canon combat identity (optional — unauthored falls back to AI/hash assignment).
  element?: Element
  physWeak?: PhysKind[]
  physResist?: PhysKind[]
  archetype?: EnemyArchetype
}

export interface WorldDef {
  id: WorldId
  name: string
  nameKey: string
  tagline: string
  lore: {
    premise: string
    toneCues: string
    /** Canon motif words to keep the world cohesive. */
    motifGlossary: string
  }
  /** Canon antagonist roster — real figures from the source story. */
  antagonists: AntagonistDef[]
  /** Native companions in unlock order; [0] is the starter. */
  nativeCompanionIds: string[]
  starterCompanionId: string
  /** The authored canon arc — the faithful story spine, in order. */
  storyChapters: QuestBlueprint[]
  /** Script ids available in this world (§23). Optional — worlds without scripts use the linear spine. */
  scripts?: string[]
  /** The script auto-selected when a player starts a campaign in this world (§23). */
  defaultScriptId?: string
}

const STARGAZERS: WorldDef = {
  id: 'stargazers',
  name: '观星会',
  nameKey: 'world.stargazers',
  tagline: '循着星轨，夺回被心魔偷走的时光',
  lore: {
    premise:
      '这是观星会的世界。观星会是一支古老的守望者队伍，循着夜空的星轨，追猎「心魔」——' +
      '那些趁人分心时，把专注与时光一点点偷走的暗影。会中的伙伴——米拉、薇拉、诺娃——各有所长：' +
      '有人冲锋、有人运筹、有人守护。旅人（玩家）与她们并肩，在行动前定下计划，' +
      '把现实里被偷走的时间，一次次夺回来。',
    toneCues:
      '轻快的冒险风格：明亮、带点悬念与温暖；像一支默契的小队执行任务。' +
      '叙事忠于「夺回被偷走的时间」这一主题，允许旅人英勇地改变结局、让故事更温暖。中文叙事。',
    motifGlossary: '星轨、夜空、星图、观星台、被偷走的时光、心魔、行动计划',
  },
  antagonists: [
    {
      id: 'sloth_idol', displayName: '惰怠之偶',
      description: '供奉「明天再说」的神像，散发令人松懈的微光，让靠近的人都甘愿沉睡、把今天推给明天。',
      role: 'boss', element: 'earth', physWeak: ['strike'], physResist: ['pierce'], archetype: 'boss', // 石偶：打碎它
    },
    {
      id: 'mirage_broker', displayName: '虚妄掮客',
      description: '兜售「完美计划」的掮客，用永远开不了头的宏图，换走人们今天的行动。',
      role: 'boss', element: 'water', physWeak: ['slash'], physResist: ['arcane'], archetype: 'boss', // 虚像：一刀两断
    },
    {
      id: 'endless_echo', displayName: '永夜回响',
      description: '吞没一切截止日的永夜回响，让时间在原地空转、无尽循环——本世界最深的暗影。',
      role: 'boss', element: 'metal', physWeak: ['arcane'], physResist: ['slash', 'strike'], archetype: 'boss', // 无形：唯法可破（弱魔）
    },
    {
      id: 'fog_sentry', displayName: '迷雾哨兵',
      description: '由犹豫与借口凝成的迷雾守卫，是潜入路上的第一道关卡。',
      role: 'mook', element: 'water', physWeak: ['pierce'], archetype: 'mook', // 雾体：一矢穿心
    },
    {
      id: 'idle_brute', displayName: '空耗傀儡',
      description: '由无数被荒废的午后凝成的傀儡，沉重而迟缓，挡在前路。',
      role: 'mook', element: 'wood', physWeak: ['slash'], physResist: ['strike'], archetype: 'elite', // 木偶：斩其丝线
    },
  ],
  nativeCompanionIds: ['mira', 'vela', 'nova'],
  starterCompanionId: 'mira',
  storyChapters: [
    {
      title: '行动一·唤醒惰怠之偶',
      lore:
        '夜空的星轨指向城郊一座废弃钟楼——那里供奉着「惰怠之偶」，散发令人松懈的微光，' +
        '让附近的人都甘愿沉睡、把今天推给明天。米拉定下计划：今晚，我们去把那束微光熄灭。',
      encounters: [
        {
          enemyName: '杂念哨兵', enemyTheme: '由犹豫与借口凝成的迷雾守卫', antagonistId: 'fog_sentry',
          hpScale: 0.9, defScale: 0.9,
          narrationIntro: '钟楼脚下，迷雾哨兵成片地涌出。米拉压低声音：「按计划，我先上。」',
          narrationVictory: '迷雾被一一驱散——通往钟楼顶层的路打开了。',
        },
        {
          enemyName: '惰怠之偶', enemyTheme: '令人甘愿沉睡的神像', antagonistId: 'sloth_idol',
          hpScale: 1.2, defScale: 1.1,
          narrationIntro: '神像睁开惺忪的眼：「明天再说……不好吗？」米拉莞尔：「不好。今天的事，今天做完。」',
          narrationVictory: '微光熄灭，沉睡的人们陆续醒来。神像碎裂处，留下一枚指向远方的星图——有人在指引我们。',
        },
      ],
      reward: { equipmentDefIds: ['starlit_blade'], unlockCompanionIds: ['vela'], playerXp: 60 },
    },
    {
      title: '行动二·拆穿虚妄掮客',
      lore:
        '星图指向一处地下集市——「虚妄掮客」在那里兜售「完美计划」，用永远开不了头的宏图，' +
        '换走人们今天的行动。薇拉扮作访客潜入，这一票，需要诺娃的道具配合。',
      encounters: [
        {
          enemyName: '空耗傀儡', enemyTheme: '由荒废的午后凝成的迟缓傀儡', antagonistId: 'idle_brute',
          hpScale: 1.0, defScale: 1.0,
          narrationIntro: '集市深处，空耗傀儡堵住去路。薇拉轻声道：「失礼了。」',
          narrationVictory: '傀儡被巧妙放倒，掮客的摊位近在眼前。',
        },
        {
          enemyName: '虚妄掮客', enemyTheme: '兜售完美计划、换走行动的掮客', antagonistId: 'mirage_broker',
          hpScale: 1.3, defScale: 1.1,
          narrationIntro: '掮客摊开一卷宏图：「只要计划够完美，何必急于动手？」两名护卫上前拦路，诺娃在耳机里说：「薇拉姐，灯光交给我。」',
          narrationVictory: '宏图散作泡影，被偷走的午后回到人们手中——是谁，把这些线索一条条引到我们面前？',
          // A real TEAM encounter: the broker fights flanked by two escort mooks (lighter scaling so
          // the fight stays winnable). Clears only when all three fall. (multi-enemy V1)
          adds: [
            { enemyName: '杂念哨兵', enemyTheme: '由犹豫与借口凝成的迷雾守卫', antagonistId: 'fog_sentry', hpScale: 0.7, defScale: 0.8 },
            { enemyName: '空耗傀儡', enemyTheme: '由荒废的午后凝成的迟缓傀儡', antagonistId: 'idle_brute', hpScale: 0.8, defScale: 0.9 },
          ],
        },
      ],
      reward: { equipmentDefIds: ['star_compass'], unlockCompanionIds: ['nova'], playerXp: 90 },
    },
    {
      title: '行动三·永夜回响',
      lore:
        '线索的尽头是一座没有指针的钟塔——传言「永夜回响」就盘踞在那里，吞没一切截止日，' +
        '让时间在原地空转、无尽循环。三人满怀戒备地登塔，真相，就在今夜揭开。',
      encounters: [
        {
          enemyName: '迷雾守卫', enemyTheme: '回响豢养的迷雾守卫', antagonistId: 'fog_sentry',
          hpScale: 1.2, defScale: 1.1,
          narrationIntro: '迷雾守卫从暗处涌出。薇拉护在两人身前：「米拉、诺娃，我来开路。」',
          narrationVictory: '迷雾被一一驱散，通往塔顶的门轰然洞开。',
        },
        {
          enemyName: '永夜回响', enemyTheme: '吞没截止日、让时间空转的永夜', antagonistId: 'endless_echo',
          hpScale: 1.5, defScale: 1.2,
          narrationIntro: '「你们终于来了……可时间，本就无穷无尽。」回响低语着，钟塔里没有一根指针。米拉握紧拳头：「不，时间有限——所以才珍贵！」',
          narrationVictory:
            '回响被驱散，钟塔重新响起报时的钟声。这一次，三人抢在它吞没今天之前，把光阴稳稳护住。' +
            '星图的尽头，浮现出新的星轨——观星会的行动，仍未结束。',
          // §26 boss phases: two transitions that escalate the fight without changing its length.
          phases: [
            {
              triggerHpPct: 0.5,
              atkBoost: 4,
              newPattern: [
                { kind: 'attack' },
                { kind: 'heavy', mult: 1.6, telegraph: '虚空凝聚' },
                { kind: 'attack' },
                { kind: 'heavy', mult: 2.0, telegraph: '蓄力' },
              ],
              phaseLabel: '狂怒',
              narration: '「时间……永远属于我！」钟塔忽然倒转，回响的轮廓扭曲膨胀，蓄力的频率越来越快。',
            },
            {
              triggerHpPct: 0.2,
              inflicts: { kind: 'slow', rounds: 2 },
              atkBoost: 4,
              phaseLabel: '背水',
              narration: '「……我要把你们都留在今天，永远。」回响爆出浓重的黑雾，笼罩全队——时间感正在流失！',
            },
          ],
        },
      ],
      reward: { equipmentDefIds: ['stargazer_seal', 'astral_canvas'], unlockCompanionIds: [], playerXp: 150 },
    },
  ],
}

const DEFAULT_WORLD_DEFS: Record<WorldId, WorldDef> = {
  stargazers: STARGAZERS,
}

/** The active worlds — a local content pack (gitignored) overrides the shipped sample. */
export const WORLD_DEFS: Record<WorldId, WorldDef> = LOCAL_PACK?.worlds ?? DEFAULT_WORLD_DEFS

export const FIRST_WORLD_ID: WorldId = LOCAL_PACK?.firstWorldId ?? 'stargazers'

/** Active branching scripts (§23) — a local content pack overrides; empty by default (the shipped
 *  sample ships none, so every default-world path stays on the linear storyChapters spine). */
export const SCRIPT_DEFS: Record<string, ScriptDef> = LOCAL_PACK?.scripts ?? {}

/** Runtime-registered scripts (§23) — saved 副本 snapshots whose script id may not live in the static
 *  content pack (e.g. a future app-generated campaign). Registered on boot + when a dungeon is entered,
 *  so the pipeline can still resolve the active script (and advance chapters) after a page reload. */
const RUNTIME_SCRIPTS: Record<string, ScriptDef> = {}

/** Register a script for runtime resolution (idempotent; last write wins).
 *  §29 — authoring mistakes are surfaced instead of failing silently in play (a broken
 *  nextChapterId reads as a premature finale; an unreachable chapter never runs). */
export function registerRuntimeScript(script: ScriptDef): void {
  const v = validateScriptDef(script)
  for (const e of v.errors) console.warn(`[script:${script.id}] 错误: ${e}`)
  for (const w of v.warnings) console.warn(`[script:${script.id}] 提示: ${w}`)
  RUNTIME_SCRIPTS[script.id] = script
}

/** Resolve a script by id: the content pack wins, else a runtime-registered (saved-副本) snapshot. */
export function scriptDefFor(scriptId: string | undefined): ScriptDef | undefined {
  if (!scriptId) return undefined
  return SCRIPT_DEFS[scriptId] ?? RUNTIME_SCRIPTS[scriptId]
}

/** Wrap a world's linear `storyChapters` into a trivial (branch-free) ScriptDef — lets an existing
 *  world become script-driven without re-authoring. ch0→ch1→…→chN; the last chapter is the finale
 *  (`next: null`). Proves a script is a strict superset of the linear spine. Pure. */
export function scriptFromChapters(world: WorldDef, scriptId: string): ScriptDef {
  const chapters: Record<string, ScriptChapter> = {}
  world.storyChapters.forEach((c, i) => {
    const id = `ch${i}`
    const next = i < world.storyChapters.length - 1 ? `ch${i + 1}` : null
    chapters[id] = { ...c, id, next }
  })
  return {
    id: scriptId,
    worldId: world.id,
    title: world.name,
    synopsis: world.tagline,
    startChapterId: 'ch0',
    chapters,
  }
}

/** The cacheable lore prefix fed to the storyline generator (incl. the antagonist roster). Pure. */
export function renderWorldLore(world: WorldDef): string {
  const roster = world.antagonists
    .map((a) => `- ${a.displayName}（${a.role}）：${a.description}`)
    .join('\n')
  return [
    `【世界观】${world.name}`,
    world.lore.premise,
    `【叙事基调】${world.lore.toneCues}`,
    `【本世界的真实对手（请据此设置副本敌人）】\n${roster}`,
    `【母题词汇（保持世界统一感时可复用）】${world.lore.motifGlossary}`,
  ].join('\n')
}

/** Pick the authored canon chapter for the current unlock progress (the faithful spine). */
export function storyChapterFor(world: WorldDef, unlockedCompanionIds: string[]): QuestBlueprint {
  const unlocked = new Set(unlockedCompanionIds)
  // The next chapter whose recruit isn't unlocked yet; else the finale (no recruit).
  const chapter = world.storyChapters.find((c) =>
    c.reward.unlockCompanionIds.some((id) => !unlocked.has(id)),
  )
  if (chapter) return chapter
  const last = world.storyChapters[world.storyChapters.length - 1]
  return { ...last, reward: { ...last.reward, unlockCompanionIds: [] } }
}
