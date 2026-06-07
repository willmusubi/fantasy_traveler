// World / lore packs (static, data-driven like COMPANION_DEFS). Each world is grounded
// in its SOURCE CANON: real antagonists (not generic 心魔), canon reward items, and an
// authored faithful-but-empowering chapter arc. `lore` + the antagonist roster are the
// cacheable prefix for AI generation; `storyChapters` are the canon spine (also the
// offline path). Authored with the world-builder skill (.claude/skills/world-builder). (§22)

import type { QuestBlueprint, WorldId } from '../domain/types'

/** A canon antagonist for a world — becomes an encounter enemy and grounds the generator. */
export interface AntagonistDef {
  id: string
  displayName: string
  /** 设定 — who they are in canon; injected into the generator + UI lore. */
  description: string
  role: 'boss' | 'mook' | 'rival'
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
}

const CATS_EYE: WorldDef = {
  id: 'cats_eye',
  name: '猫眼',
  nameKey: 'world.cats_eye',
  tagline: '怪盗三姐妹，夺回父亲被夺走的画作',
  lore: {
    premise:
      '这是《猫眼》的世界。来生三姐妹——泪、瞳、爱——白天经营着名为「猫眼」的咖啡馆，' +
      '夜晚则是传说中的怪盗。她们的父亲是天才画家迈克尔·海因兹，多年前神秘失踪，' +
      '他的画作被流散到各地的收藏家与黑帮手中。三姐妹以「猫眼」之名行动，' +
      '在行动前寄出印有红色猫眼的「预告状」，潜入对手的藏地，夺回父亲的每一幅画——' +
      '既为追查父亲的下落，也为守护他留下的一切。负责追捕她们的，是瞳的恋人、迷糊又执着的刑警内海俊夫。' +
      '旅人（玩家）与三姐妹并肩，把现实里被偷走的专注，化作一次次漂亮的行动。',
    toneCues:
      '轻盗片风格：潇洒、悬念、带点浪漫与幽默；像一场精心策划的行动。' +
      '忠于《猫眼》的人物与剧情，但允许旅人英勇地改变结局、让故事更温暖——不要大幅偏离原作。中文叙事。',
    motifGlossary: '猫眼咖啡馆、红色猫眼预告状、月下潜行、屋顶、保险箱、海因兹的画作、内海刑警',
  },
  antagonists: [
    {
      id: 'luca_roxas', displayName: '卢卡·罗克萨斯',
      description: '痴迷「地狱」主题的船业大亨与收藏家，私人画廊里藏着海因兹的名画《暗夜的优雅》，戒备森严。',
      role: 'boss',
    },
    {
      id: 'syndicate_dealer', displayName: '黑市掮客',
      description: '黑帮把持的地下拍卖行的掮客，囤积流散的海因兹画作高价转卖，与山口组有勾连。',
      role: 'boss',
    },
    {
      id: 'false_heinz', displayName: '假面「海因兹」',
      description: '自称迈克尔·海因兹的神秘人，实为暗中引导三姐妹收集画作的幕后黑手（其叔父克拉纳夫），手下豢养雇佣兵。',
      role: 'boss',
    },
    {
      id: 'gallery_guard', displayName: '画廊安保',
      description: '收藏家雇佣的精锐保安与监控系统，是潜入路上的第一道关卡。',
      role: 'mook',
    },
    {
      id: 'auction_thug', displayName: '拍卖行打手',
      description: '黑市拍卖行的看场打手，负责驱逐不速之客。',
      role: 'mook',
    },
  ],
  nativeCompanionIds: ['raisei_hitomi', 'raisei_rui', 'raisei_ai'],
  starterCompanionId: 'raisei_hitomi',
  storyChapters: [
    {
      title: '行动一·夺回《暗夜的优雅》',
      lore:
        '一封匿名包裹送到猫眼咖啡馆，里面是一幅本以为失落的海因兹画作。线索指向船业大亨卢卡·罗克萨斯的私人画廊——' +
        '那里藏着父亲的名画《暗夜的优雅》。瞳寄出了红色猫眼预告状，今晚，我们把它取回来。',
      encounters: [
        {
          enemyName: '画廊安保', enemyTheme: '激光网与精锐保安组成的第一道防线', antagonistId: 'gallery_guard',
          hpScale: 0.9, defScale: 0.9,
          narrationIntro: '画廊的激光网在黑暗中流转。瞳压低声音：「按计划，我先进去。」',
          narrationVictory: '安保被悄无声息地化解——通往收藏室的路打开了。',
        },
        {
          enemyName: '卢卡·罗克萨斯', enemyTheme: '痴迷地狱主题、戒备森严的收藏家', antagonistId: 'luca_roxas',
          hpScale: 1.2, defScale: 1.1,
          narrationIntro: '卢卡守在保险箱前狞笑：「猫眼？我的收藏可没那么好偷。」瞳莞尔：「那就试试看。」',
          narrationVictory: '《暗夜的优雅》回到掌心。画框背面，藏着另一幅画的照片——有人在指引我们。',
        },
      ],
      reward: { equipmentDefIds: ['moonlit_dagger'], unlockCompanionIds: ['raisei_rui'], playerXp: 60 },
    },
    {
      title: '行动二·地下拍卖会',
      lore:
        '照片里的画，是父亲为母亲画的肖像。它即将在黑帮把持的地下拍卖会上被卖掉。' +
        '泪扮成名流潜入会场，这一票，需要爱的技术配合。',
      encounters: [
        {
          enemyName: '拍卖行打手', enemyTheme: '黑市看场的彪形打手', antagonistId: 'auction_thug',
          hpScale: 1.0, defScale: 1.0,
          narrationIntro: '会场后台，打手堵住了去路。泪轻笑：「失礼了。」',
          narrationVictory: '打手被巧妙放倒，拍卖台近在眼前。',
        },
        {
          enemyName: '黑市掮客', enemyTheme: '囤积海因兹画作牟利的黑帮掮客', antagonistId: 'syndicate_dealer',
          hpScale: 1.3, defScale: 1.1,
          narrationIntro: '掮客举起母亲的肖像拍卖：「价高者得。」爱在耳机里说：「姐，灯光交给我。」',
          narrationVictory: '灯光骤灭、画作易手。母亲温柔的笑回到三姐妹手中——是谁，把这些画一幅幅引到我们面前？',
        },
      ],
      reward: { equipmentDefIds: ['wanneng_decoder'], unlockCompanionIds: ['raisei_ai'], playerXp: 90 },
    },
    {
      title: '行动三·假面海因兹',
      lore:
        '线索尽头是一座庄园，传言「迈克尔·海因兹」就住在那里。三姐妹满怀期待地潜入——' +
        '迎接她们的，却是一个戴着父亲面孔的陌生人，和他豢养的雇佣兵。真相，就在今夜揭开。',
      encounters: [
        {
          enemyName: '庄园雇佣兵', enemyTheme: '假面之人豢养的武装打手', antagonistId: 'gallery_guard',
          hpScale: 1.2, defScale: 1.1,
          narrationIntro: '雇佣兵从暗处涌出。泪护在妹妹们身前：「瞳、爱，我来开路。」',
          narrationVictory: '武装被一一瓦解，通往大厅的门轰然洞开。',
        },
        {
          enemyName: '假面「海因兹」', enemyTheme: '戴着父亲面孔、操纵一切的幕后黑手', antagonistId: 'false_heinz',
          hpScale: 1.5, defScale: 1.2,
          narrationIntro: '「你们终于来了，孩子们。」假面之人摊开双手——可那不是父亲的声音。瞳握紧拳头：「你到底是谁！」',
          narrationVictory:
            '面具被揭下，谎言土崩瓦解。这一次，三姐妹抢在他纵火之前，护住了父亲所有的画作。' +
            '画框深处，一封父亲的真迹浮现——他还活着，正在远方等着她们。猫眼的行动，仍未结束。',
        },
      ],
      reward: { equipmentDefIds: ['cats_eye_card', 'heinz_canvas'], unlockCompanionIds: [], playerXp: 150 },
    },
  ],
}

export const WORLD_DEFS: Record<WorldId, WorldDef> = {
  cats_eye: CATS_EYE,
}

export const FIRST_WORLD_ID: WorldId = 'cats_eye'

/** The cacheable lore prefix fed to the storyline generator (incl. the antagonist roster). Pure. */
export function renderWorldLore(world: WorldDef): string {
  const roster = world.antagonists
    .map((a) => `- ${a.displayName}（${a.role}）：${a.description}`)
    .join('\n')
  return [
    `【世界观】${world.name}`,
    world.lore.premise,
    `【叙事基调】${world.lore.toneCues}`,
    `【本世界的真实对手（请据此设置副本敌人，不要发明无关的「心魔」）】\n${roster}`,
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
