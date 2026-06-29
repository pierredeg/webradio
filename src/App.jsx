import { useRef, useEffect, useState, useCallback } from 'react'
import './App.css'
import Banner from './Banner.jsx'

const BOOT_SEQ = [
  'ATZ','OK','ATDT 1-800-STATIC-FM','DIALING THE OPERATOR...',
  'CARRIER DETECTED 56000',
  'kssshhh— ping ping— BWAAANG— eeeeeeee— kshhhhh',
  'HANDSHAKE: V.90 / 56.6 kbps','CONNECT 56600/ARQ/V90/LAPM/V42BIS',
  'LOGIN: midnight_listener  PASS: ********',
  '> negotiating skin... loading STATIC-FM.wal',
  '> mounting equalizer.dll ... ok',
  '> stream buffered. welcome back.'
]

const CHANNELS = {
  mall: {
    name: 'MALL RATS', freq: '99.5', bitrate: '112 kbps', album: "JNCO Sermon '99",
    tracks: [
      { artist: 'KORN', title: 'Freak on a Leash', sec: 242, scUrl: 'https://soundcloud.com/kornofficial/freak-on-a-leash-2' },
      { artist: 'DEFTONES', title: 'My Own Summer', sec: 228, scUrl: 'https://soundcloud.com/deftones_official/my-own-summer-shove-it' },
      { artist: 'LIMP BIZKIT', title: 'Nookie', sec: 253, scUrl: 'https://soundcloud.com/limpbizkit/nookie' },
      { artist: 'SYSTEM OF A DOWN', title: 'Chop Suey!', sec: 210, scUrl: 'https://soundcloud.com/system-of-a-down-official/chop-suey' },
      { artist: 'RAGE AGAINST THE MACHINE', title: 'Killing in the Name', sec: 312, scUrl: 'https://soundcloud.com/rageagainstthemachineofficial/killing-in-the-name-remastered' },
    ]
  }
}

const COL = {
  mall: { scr: '#15181b', viz: '#b25a14', viz2: '#ffc56a', cap: '#fff0d4' }
}

const EQ_LABELS = ['PRE','60','170','310','600','1K','3K','6K','12K','14K','16K']

const scUrl = (trackUrl, autoPlay = false) =>
  `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=${autoPlay}&buying=false&liking=false&download=false&sharing=false&show_artwork=false&show_comments=false&show_playcount=false&show_user=false&hide_related=true&visual=false&callback=true`

function fmt(s) {
  s = Math.max(0, Math.floor(s))
  return String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0')
}

const IconPrev = () => (
  <svg className="pico" viewBox="0 0 16 16" shapeRendering="crispEdges">
    <rect x="2" y="2" width="2" height="12"/><rect x="11" y="2" width="2" height="2"/>
    <rect x="8" y="4" width="5" height="2"/><rect x="6" y="6" width="7" height="2"/>
    <rect x="6" y="8" width="7" height="2"/><rect x="8" y="10" width="5" height="2"/>
    <rect x="11" y="12" width="2" height="2"/>
  </svg>
)
const IconPlay = () => (
  <svg className="pico" viewBox="0 0 16 16" shapeRendering="crispEdges">
    <rect x="4" y="2" width="2" height="2"/><rect x="4" y="4" width="5" height="2"/>
    <rect x="4" y="6" width="8" height="2"/><rect x="4" y="8" width="8" height="2"/>
    <rect x="4" y="10" width="5" height="2"/><rect x="4" y="12" width="2" height="2"/>
  </svg>
)
const IconPause = () => (
  <svg className="pico" viewBox="0 0 16 16" shapeRendering="crispEdges">
    <rect x="3" y="2" width="3" height="12"/><rect x="10" y="2" width="3" height="12"/>
  </svg>
)
const IconStop = () => (
  <svg className="pico" viewBox="0 0 16 16" shapeRendering="crispEdges">
    <rect x="3" y="3" width="10" height="10"/>
  </svg>
)
const IconNext = () => (
  <svg className="pico" viewBox="0 0 16 16" shapeRendering="crispEdges">
    <rect x="3" y="2" width="2" height="2"/><rect x="3" y="4" width="5" height="2"/>
    <rect x="3" y="6" width="7" height="2"/><rect x="3" y="8" width="7" height="2"/>
    <rect x="3" y="10" width="5" height="2"/><rect x="3" y="12" width="2" height="2"/>
    <rect x="12" y="2" width="2" height="12"/>
  </svg>
)
const IconEject = () => (
  <svg className="pico" viewBox="0 0 8 9" shapeRendering="crispEdges">
    <rect x="3" y="1" width="2" height="1"/><rect x="2" y="2" width="4" height="1"/>
    <rect x="1" y="3" width="6" height="1"/><rect x="1" y="5" width="6" height="1"/>
  </svg>
)

export default function App() {
  const vizRef = useRef(null)
  const eqcRef = useRef(null)
  const rafRef = useRef(null)
  const bootTimerRef = useRef(null)
  const barsRef = useRef([])
  const peaksRef = useRef([])
  const connectingRef = useRef(false)

  // SoundCloud
  const scIframeRef = useRef(null)
  const scWidgetRef = useRef(null)
  const scReadyRef = useRef(false)
  const pendingPlayRef = useRef(false)

  const [booting, setBooting] = useState(true)
  const [bootLines, setBootLines] = useState([])
  const [bootPct, setBootPct] = useState(0)
  const [channel] = useState('mall')
  const [playing, setPlaying] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [trackIdx, setTrackIdx] = useState(0)
  const [zapping] = useState(false)
  const [volume, setVolume] = useState(78)
  const [balance, setBalance] = useState(50)
  const [eq, setEq] = useState([8, 7, 6, 5, 5, 6, 7, 8, 9, 8, 6])
  const [shuffle, setShuffle] = useState(false)
  const [repeat, setRepeat] = useState(true)

  const ch = CHANNELS[channel]
  const curTrack = ch.tracks[trackIdx]
  const col = COL[channel]

  // Load SC Widget API script once
  useEffect(() => {
    if (document.querySelector('script[data-sc]')) return
    const s = document.createElement('script')
    s.src = 'https://w.soundcloud.com/player/api.js'
    s.dataset.sc = '1'
    document.body.appendChild(s)
  }, [])

  const bindWidget = useCallback((autoPlay) => {
    if (!window.SC || !scIframeRef.current) return
    const widget = window.SC.Widget(scIframeRef.current)
    scWidgetRef.current = widget

    widget.bind(window.SC.Widget.Events.READY, () => {
      scReadyRef.current = true
      widget.setVolume(volume)
      if (autoPlay || pendingPlayRef.current) {
        pendingPlayRef.current = false
        widget.play()
        setPlaying(true)
      }
    })
    widget.bind(window.SC.Widget.Events.PLAY, () => setPlaying(true))
    widget.bind(window.SC.Widget.Events.PAUSE, () => setPlaying(false))
    widget.bind(window.SC.Widget.Events.PLAY_PROGRESS, (e) => {
      setElapsed(Math.floor(e.currentPosition / 1000))
    })
    widget.bind(window.SC.Widget.Events.FINISH, () => {
      const nextIdx = (trackIdx + 1) % ch.tracks.length
      setTrackIdx(nextIdx)
      setElapsed(0)
    })
  }, [trackIdx, ch.tracks.length, volume])

  // Load new track into iframe when trackIdx changes
  useEffect(() => {
    const track = ch.tracks[trackIdx]
    if (!track.scUrl || !scIframeRef.current) return
    scReadyRef.current = false
    scIframeRef.current.src = scUrl(track.scUrl, pendingPlayRef.current)
    setElapsed(0)

    const tryBind = () => {
      if (window.SC) {
        bindWidget(false)
      } else {
        setTimeout(tryBind, 300)
      }
    }
    // SC iframe fires READY after src change; rebind after brief delay
    const t = setTimeout(tryBind, 400)
    return () => clearTimeout(t)
  }, [trackIdx]) // eslint-disable-line react-hooks/exhaustive-deps

  const scPlay = useCallback(() => {
    if (scWidgetRef.current && scReadyRef.current) {
      scWidgetRef.current.play()
    } else {
      pendingPlayRef.current = true
    }
  }, [])

  const scPause = useCallback(() => {
    if (scWidgetRef.current) scWidgetRef.current.pause()
  }, [])

  const scStop = useCallback(() => {
    if (scWidgetRef.current) {
      scWidgetRef.current.pause()
      scWidgetRef.current.seekTo(0)
      setElapsed(0)
    }
  }, [])

  const changeTrack = useCallback((d) => {
    const nextIdx = (trackIdx + d + ch.tracks.length) % ch.tracks.length
    setTrackIdx(nextIdx)
    pendingPlayRef.current = true
    setElapsed(0)
  }, [trackIdx, ch.tracks.length])

  const pickTrack = useCallback((i) => {
    if (i === trackIdx) {
      scPlay()
      return
    }
    // Set iframe src synchronously inside the gesture to satisfy iOS autoplay policy
    const track = ch.tracks[i]
    if (scIframeRef.current && track.scUrl) {
      scReadyRef.current = false
      scIframeRef.current.src = scUrl(track.scUrl, true)
      // Rebind widget after iframe reloads
      const tryBind = () => {
        if (window.SC) bindWidget(true)
        else setTimeout(tryBind, 300)
      }
      setTimeout(tryBind, 400)
    }
    setTrackIdx(i)
    setElapsed(0)
  }, [trackIdx, ch.tracks, scPlay, bindWidget])

  // Volume sync
  useEffect(() => {
    if (scWidgetRef.current && scReadyRef.current) {
      scWidgetRef.current.setVolume(volume)
    }
  }, [volume])

  // Seek
  const onSeek = useCallback((e) => {
    const val = +e.target.value
    setElapsed(val)
    if (scWidgetRef.current && scReadyRef.current) {
      scWidgetRef.current.seekTo(val * 1000)
    }
  }, [])

  const connect = useCallback(() => {
    if (connectingRef.current) return
    connectingRef.current = true
    let i = 0
    const step = () => {
      if (i < BOOT_SEQ.length) {
        const line = BOOT_SEQ[i]
        setBootLines(prev => [...prev, line])
        setBootPct(Math.round((i + 1) / BOOT_SEQ.length * 100))
        i++
        bootTimerRef.current = setTimeout(step, 200 + Math.random() * 230)
      } else {
        bootTimerRef.current = setTimeout(() => {
          setBooting(false)
          // Auto-play first track after boot
          pendingPlayRef.current = true
        }, 750)
      }
    }
    step()
  }, [])

  const skip = useCallback(() => {
    clearTimeout(bootTimerRef.current)
    connectingRef.current = false
    setBooting(false)
    pendingPlayRef.current = true
  }, [])

  const eject = useCallback(() => {
    clearTimeout(bootTimerRef.current)
    connectingRef.current = false
    scPause()
    setBootLines([])
    setBootPct(0)
    setPlaying(false)
    setBooting(true)
  }, [scPause])

  const startFader = useCallback((i, e) => {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const move = (ev) => {
      const y = ev.touches ? ev.touches[0].clientY : ev.clientY
      const p = 1 - (y - rect.top) / rect.height
      setEq(prev => {
        const next = [...prev]
        next[i] = Math.max(0, Math.min(12, Math.round(p * 12)))
        return next
      })
    }
    move(e)
    const up = () => {
      window.removeEventListener('mousemove', move)
      window.removeEventListener('mouseup', up)
    }
    window.addEventListener('mousemove', move)
    window.addEventListener('mouseup', up)
  }, [])

  // Canvas animation loop
  useEffect(() => {
    const loop = () => {
      rafRef.current = requestAnimationFrame(loop)
      const c = vizRef.current
      if (c) {
        const ctx = c.getContext('2d')
        const W = c.width, H = c.height
        ctx.fillStyle = col.scr
        ctx.fillRect(0, 0, W, H)
        const n = 14, gap = 2, bw = (W - (n - 1) * gap) / n
        const isPlaying = playing && !zapping
        const now = Date.now()
        for (let i = 0; i < n; i++) {
          if (barsRef.current[i] == null) { barsRef.current[i] = 0; peaksRef.current[i] = 0 }
          let tgt = isPlaying
            ? (0.18 + 0.82 * Math.abs(Math.sin(now / (150 + i * 13) + i * 1.3)) * (0.55 + Math.random() * 0.45))
            : 0.015
          tgt *= (1 - i / (n * 1.8))
          barsRef.current[i] += (tgt - barsRef.current[i]) * 0.34
          const bh = Math.max(2, barsRef.current[i] * H)
          const x = i * (bw + gap)
          for (let y = H - 2; y > H - bh; y -= 3) {
            const frac = (H - y) / H
            ctx.fillStyle = frac > 0.62 ? col.cap : (frac < 0.38 ? col.viz : col.viz2)
            ctx.fillRect(x, y - 2, bw, 2)
          }
          if (barsRef.current[i] * H > peaksRef.current[i]) peaksRef.current[i] = barsRef.current[i] * H
          else peaksRef.current[i] = Math.max(0, peaksRef.current[i] - 1.0)
          ctx.fillStyle = col.cap
          ctx.fillRect(x, H - peaksRef.current[i] - 1, bw, 1)
        }
      }
      const ec = eqcRef.current
      if (ec) {
        const x2 = ec.getContext('2d')
        const W = ec.width, H = ec.height
        x2.clearRect(0, 0, W, H)
        const N = eq.length, pad = 8
        const pts = eq.map((v, i) => ({ x: pad + (W - 2 * pad) * i / (N - 1), y: H - 4 - (v / 12) * (H - 8) }))
        x2.beginPath()
        x2.moveTo(pts[0].x, pts[0].y)
        for (let i = 0; i < pts.length - 1; i++) {
          const xc = (pts[i].x + pts[i + 1].x) / 2
          const yc = (pts[i].y + pts[i + 1].y) / 2
          x2.quadraticCurveTo(pts[i].x, pts[i].y, xc, yc)
        }
        x2.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y)
        x2.strokeStyle = col.viz2
        x2.lineWidth = 2
        x2.shadowColor = col.viz2
        x2.shadowBlur = 6
        x2.stroke()
        x2.shadowBlur = 0
      }
    }
    loop()
    return () => cancelAnimationFrame(rafRef.current)
  }, [playing, zapping, col, eq])

  const total = ch.tracks.reduce((a, x) => a + x.sec, 0)
  const marqueeText = `${curTrack.artist}  ✶  ${curTrack.title}  ✶  ${ch.album}  ✶  ${curTrack.artist}  ✶  ${curTrack.title}  ✶  `

  return (
    <div className={`device ${channel}`}>
      {/* Hidden SoundCloud iframe */}
      <iframe
        ref={scIframeRef}
        title="sc-player"
        style={{ display: 'none' }}
        allow="autoplay"
        src={scUrl(curTrack.scUrl, false)}
      />

      <div className="desktop">
        <div className="geo" style={{ right: 14, top: 18, textAlign: 'right' }}>
          <div className="badge" style={{ marginBottom: 6 }}>best viewed @ 1024x768</div>
          <br />
          <div className="hits">0013337</div>
        </div>
        <div className="geo" style={{ left: 14, bottom: 14 }}>
          <div className="badge">static-fm webring</div>
        </div>

        <div className="stack">
          <div className="win">
            <div className="tbar">
              <img className="ttllogo" src="/uploads/logo-trans.png" alt="filth.fm" />
              <div className="tbtns">
                <div className="tbtn">_</div>
                <div className="tbtn">x</div>
              </div>
            </div>

            <div className="screen">
              <div className="tex" />
              <div className="scr-row1">
                <canvas className="viz" width={94} height={36} ref={vizRef} />
                <div className="bignum">{fmt(elapsed)}</div>
                <div className="marquee">
                  <div className="mq-track">{marqueeText}</div>
                </div>
              </div>
              <div className="scr-row2">
                <span className="chtag">{ch.name} {ch.freq} FM</span>
                <span className="meta">{ch.bitrate} 44 kHz STEREO</span>
                <div className="pills">
                  <span className="pill on">EQ</span>
                  <span className="pill on">PL</span>
                </div>
              </div>
              <input
                type="range" className="slider seek"
                min={0} max={curTrack.sec} value={elapsed}
                onChange={onSeek}
              />
              {zapping && (
                <div className="static">
                  <div className="nosig">NO SIGNAL</div>
                  <div className="seeking">seeking the dial</div>
                </div>
              )}
            </div>

            <div className="controls">
              <div className="transport">
                <button className="rbtn" onClick={() => changeTrack(-1)}><IconPrev /></button>
                <button className="rbtn eject" onClick={scPlay}><IconPlay /></button>
                <button className="rbtn" onClick={scPause}><IconPause /></button>
                <button className="rbtn" onClick={scStop}><IconStop /></button>
                <button className="rbtn" onClick={() => changeTrack(1)}><IconNext /></button>
              </div>

              <div className="vol">
                <div className="volrow">
                  <span>VOL</span>
                  <input type="range" className="slider" min={0} max={100} value={volume} onChange={e => setVolume(+e.target.value)} />
                </div>
                <div className="volrow">
                  <span>BAL</span>
                  <input type="range" className="slider" min={0} max={100} value={balance} onChange={e => setBalance(+e.target.value)} />
                </div>
              </div>
            </div>

            <div className="seclabel">Equalizer</div>
            <div className="eqbody">
              <div className="tex" />
              <div className="eqtop">
                <span className="pill on">ON</span>
                <span className="pill">AUTO</span>
                <div className="pills"><span className="pill">PRESETS</span></div>
              </div>
              <canvas className="eqcurve" width={320} height={40} ref={eqcRef} />
              <div className="eqfaders">
                <div className="eqdb"><span>+12</span><span>0</span><span>-12</span></div>
                {eq.map((v, i) => {
                  const pct = v / 12 * 100
                  return (
                    <div className="eqcell" key={i}>
                      <div className="fader" onMouseDown={e => startFader(i, e)}>
                        <div className="fader-fill" style={{ height: pct + '%' }} />
                        <div className="fader-thumb" style={{ bottom: `calc(${pct}% - 4px)` }} />
                      </div>
                      <span className="eqlbl">{EQ_LABELS[i] || ''}</span>
                    </div>
                  )
                })}
              </div>
            </div>

            <Banner />
            <div className="seclabel">Playlist</div>
            <div className="plbody">
              <div className="pltex" />
              <div className="pllist">
                {ch.tracks.map((tr, i) => (
                  <div
                    key={i}
                    className={i === trackIdx ? 'prow cur' : 'prow'}
                    onClick={() => pickTrack(i)}
                  >
                    <div className="pl-l">
                      <span className="prnum">{String(i + 1).padStart(2, '0')}.</span>
                      <span>{tr.artist} - {tr.title}</span>
                    </div>
                    <span>{fmt(tr.sec)}</span>
                  </div>
                ))}
              </div>
              <div className="pltool">
                <button className="rbtn sm">+</button>
                <button className="rbtn sm">-</button>
                <button className="rbtn sm">☰</button>
                <button className="rbtn sm">⚙</button>
                <div className="pllcd">
                  <span>{fmt(elapsed)}</span>
                  <span className="pltotal">/ {fmt(total)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {booting && (
        <div className="boot">
          <div className="splash">
            <div className="splash-header">
              <img className="splash-logo" src="/uploads/logo-trans.png" alt="filth.fm" />
              <div className="splash-title">
                <div className="splash-ver">Static Noise Injector v1.94</div>
              </div>
            </div>
            <div className="splash-body">
              <div className="splash-credits">
                midnight_listener, parking_lot_prophet,<br />
                dial_up_shaman, jnco_archbishop,<br />
                the_flannel_council, static_operative_7
              </div>
              <div className="splash-copy">Copyright 1994–2026 Static FM Underground. All frequencies reserved.</div>
              {bootLines.length > 0 && (
                <>
                  <div className="splash-status">
                    <span>{bootLines[bootLines.length - 1]}</span>
                    <span className="splash-pct">{bootPct}%</span>
                  </div>
                  <div className="bootbar">
                    <div className="bootbar-fill" style={{ width: bootPct + '%' }} />
                  </div>
                </>
              )}
            </div>
            <div className="bootbtns">
              {bootLines.length === 0
                ? <button className="connectbtn" onClick={connect}>▶ CONNECT @ 56.6k</button>
                : <button className="skipbtn" onClick={skip}>[ SKIP ]</button>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
