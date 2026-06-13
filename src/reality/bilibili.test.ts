import { describe, expect, it } from 'vitest'
import {
  aggregateBilibiliSeasonEvidence,
  extractBilibiliSeason,
  mapBilibiliViewResponse,
  parseBvid,
  requestJsonp,
} from './bilibili'

describe('parseBvid', () => {
  it('accepts a bare BV id', () => {
    expect(parseBvid('BV1dzEx6jERS')).toBe('BV1dzEx6jERS')
  })

  it('extracts a BV id from a video URL', () => {
    expect(parseBvid('https://www.bilibili.com/video/BV1dzEx6jERS/?spm_id_from=333.1')).toBe('BV1dzEx6jERS')
  })

  it('rejects input without a BV id', () => {
    expect(() => parseBvid('https://space.bilibili.com/123')).toThrow('BV')
  })
})

describe('mapBilibiliViewResponse', () => {
  it('normalizes the public video response into reality evidence', () => {
    const result = mapBilibiliViewResponse(
      {
        code: 0,
        data: {
          bvid: 'BV1dzEx6jERS',
          title: '人生第一条视频',
          owner: { mid: 42, name: '威尔不太逊' },
          stat: { coin: 137 },
        },
      },
      new Date('2026-06-13T12:00:00.000Z'),
    )

    expect(result).toEqual({
      provider: 'bilibili-video',
      metric: 'coin',
      sourceRef: 'BV1dzEx6jERS',
      value: 137,
      sourceUrl: 'https://www.bilibili.com/video/BV1dzEx6jERS',
      observedAt: '2026-06-13T12:00:00.000Z',
      title: '人生第一条视频',
      ownerName: '威尔不太逊',
      ownerMid: 42,
    })
  })

  it('rejects an unsuccessful Bilibili response', () => {
    expect(() => mapBilibiliViewResponse({ code: -404, message: '啥都木有' })).toThrow('啥都木有')
  })
})

describe('Bilibili collection evidence', () => {
  const seasonResponse = {
    code: 0,
    data: {
      bvid: 'BV1seed12345',
      owner: { mid: 42, name: '威尔不太逊' },
      ugc_season: {
        id: 9001,
        title: 'Fantasy Traveler',
        sections: [
          { episodes: [{ bvid: 'BV1seed12345' }, { bvid: 'BV1next12345' }, { bvid: 'BV1next12345' }] },
        ],
      },
    },
  }

  it('discovers and deduplicates every video in the collection from a member video', () => {
    expect(extractBilibiliSeason(seasonResponse)).toEqual({
      seasonId: 9001,
      title: 'Fantasy Traveler',
      ownerName: '威尔不太逊',
      ownerMid: 42,
      bvids: ['BV1seed12345', 'BV1next12345'],
    })
  })

  it('sums member-video coins into one collection evidence snapshot', () => {
    const season = extractBilibiliSeason(seasonResponse)
    const result = aggregateBilibiliSeasonEvidence(
      'BV1seed12345',
      season,
      [
        mapBilibiliViewResponse({ code: 0, data: { bvid: 'BV1seed12345', stat: { coin: 137 } } }),
        mapBilibiliViewResponse({ code: 0, data: { bvid: 'BV1next12345', stat: { coin: 900 } } }),
      ],
      new Date('2026-06-13T12:00:00.000Z'),
    )

    expect(result).toMatchObject({
      provider: 'bilibili-season',
      metric: 'coin',
      sourceRef: 'BV1seed12345',
      value: 1037,
      sourceUrl: 'https://space.bilibili.com/42/lists/9001?type=season',
      observedAt: '2026-06-13T12:00:00.000Z',
      title: 'Fantasy Traveler',
      ownerName: '威尔不太逊',
      ownerMid: 42,
      videoCount: 2,
    })
  })
})

describe('requestJsonp', () => {
  it('registers a callback and cleans up after receiving a response', async () => {
    const pending = requestJsonp('https://api.bilibili.com/test', 1000)
    const script = document.head.querySelector('script[src*="callback="]') as HTMLScriptElement
    const callbackName = new URL(script.src).searchParams.get('callback')!
    const callback = (globalThis as unknown as Record<string, (value: unknown) => void>)[callbackName]

    callback({ code: 0 })

    await expect(pending).resolves.toEqual({ code: 0 })
    expect(document.head.contains(script)).toBe(false)
    expect((globalThis as unknown as Record<string, unknown>)[callbackName]).toBeUndefined()
  })
})
