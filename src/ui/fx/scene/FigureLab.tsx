// §32 — FigureLab: the DEV-ONLY tuning bench for battle figures. Open the app with
// ?fxlab=1 (dev server only — main.tsx gates on import.meta.env.DEV and the lab is a
// dynamic import, so none of this ships in the production bundle). Type any art-set name
// (raisei_rui, ff7_tifa, a future player_default…), pick a side, and trigger every
// FigureState to tune timings against real art before it ever reaches the battle stage.

import { useEffect, useRef, useState } from 'react'
import type { Application, Container } from 'pixi.js'
import { FigureActor } from './figures'
import { enemyCandidates, partyCandidates, resolveFigureArt } from './textures'

interface LabStage {
  app: Application
  layer: Container
  destroy: () => void
}

export function FigureLab() {
  const hostRef = useRef<HTMLDivElement>(null)
  const stageRef = useRef<LabStage | null>(null)
  const actorRef = useRef<FigureActor | null>(null)
  const [setName, setSetName] = useState('ff7_tifa')
  const [side, setSide] = useState<'party' | 'enemy'>('party')
  const [status, setStatus] = useState('idle — load a set')

  useEffect(() => {
    let disposed = false
    void (async () => {
      const { initPixiApp, destroyPixiApp } = await import('../pixiFx')
      const { createBackdrop } = await import('./backdrop')
      const { Container } = await import('pixi.js')
      if (disposed || !hostRef.current) return
      const app = await initPixiApp(hostRef.current)
      if (disposed) {
        destroyPixiApp(app)
        return
      }
      const backdropRoot = new Container()
      const layer = new Container()
      app.stage.addChild(backdropRoot, layer)
      const backdrop = createBackdrop(app, backdropRoot)
      const tick = () => {
        const dt = app.ticker.deltaMS / 1000
        if (actorRef.current && !actorRef.current.destroyed) actorRef.current.update(dt)
      }
      app.ticker.add(tick)
      stageRef.current = {
        app,
        layer,
        destroy: () => {
          app.ticker.remove(tick)
          backdrop.destroy()
          destroyPixiApp(app)
        },
      }
    })()
    return () => {
      disposed = true
      actorRef.current?.destroy()
      actorRef.current = null
      stageRef.current?.destroy()
      stageRef.current = null
    }
  }, [])

  const load = async () => {
    const stage = stageRef.current
    if (!stage) return
    setStatus(`loading ${setName}…`)
    actorRef.current?.destroy()
    actorRef.current = null
    const candidates = side === 'party' ? partyCandidates(setName) : enemyCandidates(setName)
    // The lab probes the FULL party chain even for enemy side if the enemy chain misses —
    // tuning art is tuning art.
    const art = await resolveFigureArt([...candidates, ...partyCandidates(setName)])
    if (!stageRef.current) return
    const host = hostRef.current!
    const actor = new FigureActor(stage.app, {
      id: 'lab',
      art,
      emoji: side === 'party' ? '⚔️' : '👹',
      facing: side === 'party' ? 1 : -1,
      targetH: host.clientHeight * 0.56,
    })
    actor.setBase(host.clientWidth * (side === 'party' ? 0.35 : 0.65), host.clientHeight * 0.78)
    stage.layer.addChild(actor)
    actorRef.current = actor
    setStatus(`${setName} → ${art.kind}${art.url ? ` (${art.url})` : ''}`)
  }

  const act = (what: string) => {
    const a = actorRef.current
    if (!a || a.destroyed) return
    const dir = side === 'party' ? 1 : -1
    switch (what) {
      case 'lunge': a.lunge(dir * 44); break
      case 'hit': a.hit(dir * -13); break
      case 'casting': a.casting(0.3, dir * -6); break
      case 'downed': a.setDowned(true); break
      case 'revive': a.setDowned(false); break
      case 'victory': a.victory(); break
      case 'tint': a.tintPulse(0xb48fff, 0.4); break
      case 'interrupt': a.interrupt(); break
    }
  }

  const ACTIONS = ['lunge', 'hit', 'casting', 'downed', 'revive', 'victory', 'tint', 'interrupt']
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 9999, background: '#10122a', display: 'flex', flexDirection: 'column', fontFamily: 'monospace' }}>
      <div style={{ padding: 10, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', color: '#e8e4d4' }}>
        <strong>FigureLab</strong>
        <input value={setName} onChange={(e) => setSetName(e.target.value)} style={{ padding: 4, width: 160 }} placeholder="art set (e.g. ff7_tifa)" />
        <select value={side} onChange={(e) => setSide(e.target.value as 'party' | 'enemy')} style={{ padding: 4 }}>
          <option value="party">party (faces →)</option>
          <option value="enemy">enemy (faces ←)</option>
        </select>
        <button onClick={() => void load()} style={{ padding: '4px 12px' }}>load</button>
        {ACTIONS.map((w) => (
          <button key={w} onClick={() => act(w)} style={{ padding: '4px 10px' }}>{w}</button>
        ))}
        <span style={{ opacity: 0.7 }}>{status}</span>
      </div>
      <div ref={hostRef} style={{ flex: 1, position: 'relative' }} />
    </div>
  )
}
