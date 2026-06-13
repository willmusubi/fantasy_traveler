import type { RealityEvidence } from '../domain/types'

const BVID_PATTERN = /BV[0-9A-Za-z]{10}/i
const VIEW_ENDPOINT = 'https://api.bilibili.com/x/web-interface/view'

type BilibiliViewResponse = {
  code?: number
  message?: string
  data?: {
    bvid?: string
    title?: string
    owner?: { mid?: number; name?: string }
    stat?: { coin?: number }
    ugc_season?: {
      id?: number
      title?: string
      sections?: Array<{ episodes?: Array<{ bvid?: string }> }>
    }
  }
}

export interface BilibiliSeason {
  seasonId: number
  title: string
  ownerName?: string
  ownerMid: number
  bvids: string[]
}

export function parseBvid(input: string): string {
  const match = input.trim().match(BVID_PATTERN)
  if (!match) throw new Error('请输入有效的 B 站视频链接或 BV 号')
  return `BV${match[0].slice(2)}`
}

export function mapBilibiliViewResponse(response: unknown, observedAt = new Date()): RealityEvidence {
  const body = response as BilibiliViewResponse
  if (body?.code !== 0 || !body.data) {
    throw new Error(body?.message || 'B 站没有返回可用的视频数据')
  }
  const bvid = body.data.bvid && parseBvid(body.data.bvid)
  const coin = body.data.stat?.coin
  if (!bvid || typeof coin !== 'number' || !Number.isFinite(coin)) {
    throw new Error('B 站返回的视频数据格式发生了变化')
  }
  return {
    provider: 'bilibili-video',
    metric: 'coin',
    sourceRef: bvid,
    value: Math.max(0, Math.floor(coin)),
    sourceUrl: `https://www.bilibili.com/video/${bvid}`,
    observedAt: observedAt.toISOString(),
    title: body.data.title,
    ownerName: body.data.owner?.name,
    ownerMid: body.data.owner?.mid,
  }
}

export function extractBilibiliSeason(response: unknown): BilibiliSeason {
  const body = response as BilibiliViewResponse
  const season = body?.data?.ugc_season
  const ownerMid = body?.data?.owner?.mid
  if (body?.code !== 0 || !season?.id || !season.title || !ownerMid) {
    throw new Error('该视频尚未加入 B 站合集，请先把它加入 Fantasy Traveler 参赛系列')
  }
  const bvids = [...new Set(
    (season.sections ?? [])
      .flatMap((section) => section.episodes ?? [])
      .map((episode) => episode.bvid)
      .filter((bvid): bvid is string => Boolean(bvid))
      .map(parseBvid),
  )]
  if (bvids.length === 0) throw new Error('B 站合集里还没有可验证的视频')
  return {
    seasonId: season.id,
    title: season.title,
    ownerName: body.data?.owner?.name,
    ownerMid,
    bvids,
  }
}

export function aggregateBilibiliSeasonEvidence(
  sourceRef: string,
  season: BilibiliSeason,
  memberEvidence: RealityEvidence[],
  observedAt = new Date(),
): RealityEvidence {
  return {
    provider: 'bilibili-season',
    metric: 'coin',
    sourceRef: parseBvid(sourceRef),
    value: memberEvidence.reduce((total, evidence) => total + evidence.value, 0),
    sourceUrl: `https://space.bilibili.com/${season.ownerMid}/lists/${season.seasonId}?type=season`,
    observedAt: observedAt.toISOString(),
    title: season.title,
    ownerName: season.ownerName,
    ownerMid: season.ownerMid,
    videoCount: season.bvids.length,
  }
}

/** JSONP transport is isolated here so a future same-origin proxy can replace it. */
export function requestJsonp(url: string, timeoutMs = 10_000): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const callbackName = `__ftRealityOracle_${Date.now()}_${Math.round(Math.random() * 1e9)}`
    const script = document.createElement('script')
    const global = globalThis as unknown as Record<string, unknown>
    let timer = 0

    const cleanup = () => {
      window.clearTimeout(timer)
      script.remove()
      delete global[callbackName]
    }

    global[callbackName] = (payload: unknown) => {
      cleanup()
      resolve(payload)
    }
    script.onerror = () => {
      cleanup()
      reject(new Error('无法连接 B 站公开视频接口，请稍后重试'))
    }
    timer = window.setTimeout(() => {
      cleanup()
      reject(new Error('读取 B 站数据超时，请稍后重试'))
    }, timeoutMs)
    script.src = `${url}${url.includes('?') ? '&' : '?'}jsonp=jsonp&callback=${callbackName}`
    document.head.appendChild(script)
  })
}

export async function fetchBilibiliVideoEvidence(input: string): Promise<RealityEvidence> {
  const bvid = parseBvid(input)
  const response = await requestJsonp(`${VIEW_ENDPOINT}?bvid=${encodeURIComponent(bvid)}`)
  return mapBilibiliViewResponse(response)
}

/** Discover the collection from one member video, then sum every member video's public coin count. */
export async function fetchBilibiliSeasonEvidence(input: string): Promise<RealityEvidence> {
  const sourceRef = parseBvid(input)
  const seedResponse = await requestJsonp(`${VIEW_ENDPOINT}?bvid=${encodeURIComponent(sourceRef)}`)
  const season = extractBilibiliSeason(seedResponse)
  const seedEvidence = mapBilibiliViewResponse(seedResponse)
  const members = await Promise.all(
    season.bvids.map((bvid) => bvid === sourceRef ? Promise.resolve(seedEvidence) : fetchBilibiliVideoEvidence(bvid)),
  )
  return aggregateBilibiliSeasonEvidence(sourceRef, season, members)
}
