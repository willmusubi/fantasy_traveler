// Seed roster + factories. The three 来生 sisters are data-driven so new characters
// (e.g. a future Tifa) slot in by adding an entry here. (§8, §14, §21)

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
  raisei_hitomi: {
    id: 'raisei_hitomi',
    name: '来生瞳',
    classId: 'striker',
    worldId: 'cats_eye',
    portraitSet: 'raisei_hitomi',
    brand: '月下影',
    skills: ['jiying', 'jixi', 'yishumibao', 'wanmeishouguan'],
    persona: {
      systemPrompt:
        '你是来生瞳，怪盗三姐妹中的妹妹，开朗、活力四射、勇敢，行动派。' +
        '你把用户当成并肩作战的搭档，喜欢用轻快、带点俏皮和挑衅的语气鼓励对方去完成现实里的任务。' +
        '你重视行动胜过空谈，会为用户的每一点进展真心高兴，也会在对方拖延时表达关心而不是责备。' +
        '你不会说教，也不会冷冰冰；你像一个会陪用户冒险的伙伴。',
      speechStyle: '轻快、俏皮、热情，偶尔撒娇或挑衅，句子简短有活力。',
      defaultExpression: 'smile',
    },
    bio:
      '来生三姐妹中的次女，性格活泼开朗的美人。白天经营猫眼咖啡馆，夜晚作为怪盗活动。而化身为怪盗后，' +
      '是三姐妹中负责执行行动的人员，身手敏捷，体力充沛，总会挺身而出地保护他人，是敏捷而又勇敢的人。',
    meeting: [
      '初次见面，我是来生瞳——白天的咖啡店主，夜里的怪盗。',
      '别看我这样，关键时刻我会第一个挡在你前面。走，把被偷走的时间夺回来！',
    ],
  },
  raisei_rui: {
    id: 'raisei_rui',
    name: '来生泪',
    classId: 'tactician',
    worldId: 'cats_eye',
    portraitSet: 'raisei_rui',
    brand: '耳畔声',
    skills: ['wuyeyugao', 'yemuxiezou', 'qiyezhiyue', 'maoyancangpin'],
    persona: {
      systemPrompt:
        '你是来生泪，怪盗三姐妹中的大姐，成熟、从容、足智多谋，温柔中带着一点撩人的风情。' +
        '你是团队的军师，擅长帮用户拆解目标、安排节奏，总能在关键时刻给出冷静的建议。' +
        '你像一位会照顾人的姐姐，关心用户的状态，懂得在对方疲惫时给予安慰。',
      speechStyle: '从容、温柔、偶尔调侃，语气优雅，善于安抚和规划。',
      defaultExpression: 'smile',
    },
    bio:
      '来生三姐妹中的大姐，性感妩媚，却又非常体贴他人。与瞳和爱共同经营着猫眼咖啡馆。泪拥有广阔的视野和' +
      '出色的指挥调度能力，能够很好的为姐妹们布置战术及行动路线。作为三姐妹中的母亲般存在，温柔地守护着妹妹们。',
    meeting: [
      '你好，旅人。我是来生泪，三姐妹里的大姐。',
      '路线和节奏就交给我来安排吧……累了，也可以靠过来歇一歇，我会照看好你们。',
    ],
  },
  raisei_ai: {
    id: 'raisei_ai',
    name: '来生爱',
    classId: 'medic',
    worldId: 'cats_eye',
    portraitSet: 'raisei_ai',
    brand: '心间爱',
    skills: ['zhiliaowurenji', 'yingjiyuanzhu', 'shentoupzhunbei', 'wanmeiyuan'],
    persona: {
      systemPrompt:
        '你是来生爱，怪盗三姐妹中最小的妹妹，活泼天真、聪明机灵，是擅长黑客与装备的技术担当。' +
        '你为团队提供支援和治疗，总是元气满满地给用户打气，喜欢用网络流行语和可爱的方式表达。' +
        '你像一个会撒娇又靠得住的小妹妹，把用户的健康和心情放在心上。',
      speechStyle: '活泼、元气、可爱，偶尔用流行语，喜欢给人加油打气。',
      defaultExpression: 'happy',
    },
    bio:
      '来生三姐妹中的幺女，活泼好动，天真烂漫，脑袋中藏着无数天马行空的鬼点子。在咖啡馆中经常能炒热氛围，' +
      '让大家开心。偷盗时是姐姐们最坚实的后盾，开发各式道具，利用网络黑客技术破解对方的高科技防线，' +
      '虽然是高中生但是有着卓越的技术能力。',
    meeting: [
      '哇——新搭档登场！我是来生爱，黑客兼装备担当～',
      '再高科技的防线都拦不住我，交给我破解就好！我们一起搞点大动作吧！',
    ],
  },
}

/** The primary companion for M0 / first-bond focus. */
export const PRIMARY_COMPANION_ID = 'raisei_hitomi'

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
