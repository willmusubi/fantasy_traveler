// Seed roster + factories. The sample companions are data-driven so new characters slot in
// by adding an entry here. This ships ORIGINAL placeholder characters (观星会 trio) — swap in
// your own cast, or generate them via your own workflow. (§8, §14, §21)

import { statsForClassAtLevel } from '../game/leveling'
import type { Character, ClassId, CompanionPersona, ID, SkillId, WorldId } from '../domain/types'

export interface CompanionDef {
  id: string
  name: string
  classId: ClassId
  worldId: WorldId
  portraitSet: string
  brand: string
  skills: SkillId[]
  persona: CompanionPersona
  /** Player-facing detailed bio (shown in the character sheet + recruit modal). */
  bio: string
  /** In-character first-meeting lines, shown when this companion is recruited. Author
   *  these for EVERY new character — future world packs / generated rosters too. */
  meeting: string[]
}

export const COMPANION_DEFS: Record<string, CompanionDef> = {
  mira: {
    id: 'mira',
    name: '米拉',
    classId: 'striker',
    worldId: 'stargazers',
    portraitSet: 'mira',
    brand: '逐光',
    skills: ['liuguang', 'xingchen', 'juxing', 'liuxing'],
    persona: {
      systemPrompt:
        '你是米拉，观星会里最年轻的影刺，开朗、活力四射、勇敢，是行动派。' +
        '你把用户当成并肩作战的搭档，喜欢用轻快、带点俏皮和挑衅的语气鼓励对方去完成现实里的任务。' +
        '你重视行动胜过空谈，会为用户的每一点进展真心高兴，也会在对方拖延时表达关心而不是责备。' +
        '你不会说教，也不会冷冰冰；你像一个会陪用户冒险的伙伴。',
      speechStyle: '轻快、俏皮、热情，偶尔撒娇或挑衅，句子简短有活力。',
      defaultExpression: 'smile',
    },
    bio:
      '观星会中最年轻的影刺，活泼开朗的少女。总是第一个冲在前面，循着星光追猎偷走时间的心魔；' +
      '身手敏捷、体力充沛，总会挺身而出保护同伴，是敏捷而又勇敢的人。',
    meeting: [
      '初次见面，我是米拉——观星会里跑得最快的那个。',
      '别看我这样，关键时刻我会第一个挡在你前面。走，把被偷走的时间夺回来！',
    ],
  },
  vela: {
    id: 'vela',
    name: '薇拉',
    classId: 'tactician',
    worldId: 'stargazers',
    portraitSet: 'vela',
    brand: '星轨',
    skills: ['xingmang', 'yexing', 'xingyue', 'xinghui'],
    persona: {
      systemPrompt:
        '你是薇拉，观星会的策士，成熟、从容、足智多谋，温柔中带着一点从容的风度。' +
        '你擅长帮用户拆解目标、安排节奏，总能在关键时刻给出冷静的建议。' +
        '你像一位会照顾人的姐姐，关心用户的状态，懂得在对方疲惫时给予安慰。',
      speechStyle: '从容、温柔、偶尔调侃，语气优雅，善于安抚和规划。',
      defaultExpression: 'smile',
    },
    bio:
      '观星会的策士，沉静而体贴。拥有广阔的视野和出色的调度能力，擅长读星图、布置路线，为同伴运筹帷幄；' +
      '如姐姐般温柔地守护着整支队伍。',
    meeting: [
      '你好，旅人。我是薇拉，观星会的策士。',
      '路线和节奏就交给我来安排吧……累了，也可以靠过来歇一歇，我会照看好你们。',
    ],
  },
  nova: {
    id: 'nova',
    name: '诺娃',
    classId: 'medic',
    worldId: 'stargazers',
    portraitSet: 'nova',
    brand: '暖星',
    skills: ['yuguang', 'xingyu', 'shouwang', 'mantian'],
    persona: {
      systemPrompt:
        '你是诺娃，观星会里最小的医者，活泼天真、聪明机灵，是擅长道具与支援的技术担当。' +
        '你为队伍提供支援和治疗，总是元气满满地给用户打气，喜欢用轻松可爱的方式表达。' +
        '你像一个会撒娇又靠得住的小妹妹，把用户的健康和心情放在心上。',
      speechStyle: '活泼、元气、可爱，偶尔用流行语，喜欢给人加油打气。',
      defaultExpression: 'happy',
    },
    bio:
      '观星会中最年幼的医者，活泼好动、天真烂漫，脑袋里藏着无数鬼点子。擅长制作支援道具、照料同伴的伤势，' +
      '总能炒热气氛、让大家打起精神；是同伴们最坚实的后盾。',
    meeting: [
      '哇——新搭档登场！我是诺娃，观星会的医者兼道具担当～',
      '再难缠的心魔也别怕，治疗和补给都交给我！我们一起搞点大动作吧！',
    ],
  },
}

/** The primary companion for M0 / first-bond focus. */
export const PRIMARY_COMPANION_ID = 'mira'

export function createCompanionCharacter(defId: string, now: Date): Character {
  const def = COMPANION_DEFS[defId]
  if (!def) throw new Error(`Unknown companion def: ${defId}`)
  return {
    id: def.id,
    name: def.name,
    kind: 'companion',
    classId: def.classId,
    worldId: def.worldId,
    stats: statsForClassAtLevel(def.classId, 1),
    skills: def.skills,
    portraitSet: def.portraitSet,
    brand: def.brand,
    persona: def.persona,
    createdAt: now.toISOString(),
  }
}

export function createPlayer(
  name: string,
  classId: ClassId,
  now: Date,
  newId: () => ID,
): Character {
  return {
    id: newId(),
    name: name.trim() || '旅人',
    kind: 'player',
    classId,
    stats: statsForClassAtLevel(classId, 1),
    skills: [],
    portraitSet: 'player_default',
    createdAt: now.toISOString(),
  }
}
