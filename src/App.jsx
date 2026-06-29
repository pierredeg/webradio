import { useRef, useEffect, useState, useCallback } from 'react'
import './App.css'

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
      { artist: 'PARKING LOT MESSIAH', title: 'Backwards Cap', sec: 201 },
      { artist: 'NU-TRON', title: 'Food Court Riot', sec: 168 },
      { artist: 'RAGECARGO', title: 'Drop-D Detention', sec: 235 },
      { artist: 'SK8 OR CRY', title: 'Curfew', sec: 153 },
      { artist: 'THE LIMITED TOO', title: 'Maximum Aggro', sec: 190 }
    ]
  }
}

const COL = {
  mall: { scr: '#15181b', viz: '#b25a14', viz2: '#ffc56a', cap: '#fff0d4' }
}

const EQ_LABELS = ['PRE','60','170','310','600','1K','3K','6K','12K','14K','16K']

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

  const [booting, setBooting] = useState(true)
  const [bootLines, setBootLines] = useState([])
  const [bootPct, setBootPct] = useState(0)
  const [channel] = useState('mall')
  const [playing, setPlaying] = useState(true)
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
        bootTimerRef.current = setTimeout(() => setBooting(false), 750)
      }
    }
    step()
  }, [])

  const skip = useCallback(() => {
    clearTimeout(bootTimerRef.current)
    connectingRef.current = false
    setBooting(false)
  }, [])

  const eject = useCallback(() => {
    clearTimeout(bootTimerRef.current)
    connectingRef.current = false
    setBootLines([])
    setBootPct(0)
    setPlaying(false)
    setBooting(true)
  }, [])

  const changeTrack = useCallback((d) => {
    setTrackIdx(prev => (prev + d + ch.tracks.length) % ch.tracks.length)
    setElapsed(0)
    setPlaying(true)
  }, [ch.tracks.length])

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

  useEffect(() => {
    const timer = setInterval(() => {
      if (!playing || booting || zapping) return
      setElapsed(prev => {
        const len = CHANNELS[channel].tracks[trackIdx].sec
        if (prev + 1 >= len) {
          setTrackIdx(ti => (ti + 1) % CHANNELS[channel].tracks.length)
          return 0
        }
        return prev + 1
      })
    }, 1000)
    return () => clearInterval(timer)
  }, [playing, booting, zapping, channel, trackIdx])

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
                onChange={e => setElapsed(+e.target.value)}
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
                <button className="rbtn" onClick={() => setPlaying(true)}><IconPlay /></button>
                <button className="rbtn" onClick={() => setPlaying(false)}><IconPause /></button>
                <button className="rbtn" onClick={() => { setPlaying(false); setElapsed(0) }}><IconStop /></button>
                <button className="rbtn" onClick={() => changeTrack(1)}><IconNext /></button>
              </div>
              <div className="secondary">
                <button className={shuffle ? 'rbtn sm on' : 'rbtn sm'} onClick={() => setShuffle(s => !s)}>RND</button>
                <button className={repeat ? 'rbtn sm on' : 'rbtn sm'} onClick={() => setRepeat(r => !r)}>REP</button>
                <button className="rbtn sm eject" onClick={eject}><IconEject /></button>
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

            <div className="seclabel">Playlist</div>
            <div className="plbody">
              <div className="pltex" />
              <div className="pllist">
                {ch.tracks.map((tr, i) => (
                  <div
                    key={i}
                    className={i === trackIdx ? 'prow cur' : 'prow'}
                    onClick={() => { setTrackIdx(i); setElapsed(0); setPlaying(true) }}
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
                <button className="rbtn sm">list</button>
                <button className="rbtn sm">cfg</button>
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
          <div className="crt">
            <div className="crtscan" />
            <img className="bootlogoimg" src="/uploads/logo-trans.png" alt="filth.fm" />
            <div className="bootsub">all-night dial-up radio est. 1994 v.90 ready</div>
            {bootLines.map((l, i) => <div key={i} className="termline">{l}</div>)}
            {bootLines.length > 0 && (
              <div className="bootbar">
                <div className="bootbar-fill" style={{ width: bootPct + '%' }} />
                <span className="bootpct">{bootPct}%</span>
              </div>
            )}
            <div className="bootbtns">
              {bootLines.length === 0
                ? <button className="connectbtn" onClick={connect}>CONNECT @ 56.6k</button>
                : <button className="skipbtn" onClick={skip}>[ SKIP HANDSHAKE ]</button>
              }
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
