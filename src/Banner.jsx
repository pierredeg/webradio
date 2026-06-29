import { useState, useEffect } from 'react'
import './Banner.css'

const ADS = [
  {
    bg: '#0a0000', border: '#cc0000',
    content: (
      <div className="ad-ozzfest">
        <span className="ad-small">GOD CAN'T HELP YOU IT'S...</span>
        <span className="ad-big">OZZFEST <em>'99</em></span>
        <span className="ad-sub">BLACK SABBATH · FINAL USA PERFORMANCE</span>
      </div>
    )
  },
  {
    bg: '#ffffff', border: '#5ccc00',
    content: (
      <div className="ad-generic">
        <img src="/uploads/kazaa.jpeg" alt="Kazaa" className="ad-kazaa-logo" />
        <span className="ad-claim ad-claim-dark">download <em>FREE</em> mp3s<br/>no cd required !!!</span>
        <span className="ad-cta ad-cta-green">CLICK HERE</span>
      </div>
    )
  },
  {
    bg: '#0d0d0d', border: '#ff8a2a',
    content: (
      <div className="ad-jnco">
        <span className="ad-brand">JNCO<sup>®</sup></span>
        <span className="ad-claim">wide leg · wider pit<br/><em>drop it like it's DROP-D</em></span>
      </div>
    )
  },
  {
    bg: '#060010', border: '#9b00ff',
    content: (
      <div className="ad-warped">
        <span className="ad-small">VANS PRESENTS</span>
        <span className="ad-big">WARPED TOUR <em>2000</em></span>
        <span className="ad-sub">BLINK-182 · NOFX · DEFTONES · SLIPKNOT</span>
      </div>
    )
  },
  {
    bg: '#0a0800', border: '#ccaa00',
    content: (
      <div className="ad-hmv">
        <span className="ad-logo" style={{color:'#e00'}}>hmv</span>
        <span className="ad-claim">BUY 2 GET 1 FREE<br/><em>nu-metal · alt-rock · grunge</em></span>
        <span className="ad-cta" style={{background:'#e00'}}>IN STORE NOW</span>
      </div>
    )
  },
  {
    bg: '#000a00', border: '#00cc44',
    content: (
      <div className="ad-generic">
        <span className="ad-logo" style={{fontSize:'22px'}}>AIM</span>
        <span className="ad-claim">xX_sk8ter_punk_Xx is away<br/><em>"in the pit. brb never."</em></span>
      </div>
    )
  },
]

export default function Banner() {
  const [idx, setIdx] = useState(0)
  const [fade, setFade] = useState(true)

  useEffect(() => {
    const t = setInterval(() => {
      setFade(false)
      setTimeout(() => {
        setIdx(i => (i + 1) % ADS.length)
        setFade(true)
      }, 300)
    }, 4000)
    return () => clearInterval(t)
  }, [])

  const ad = ADS[idx]
  return (
    <div
      className={`banner-wrap ${fade ? 'fade-in' : 'fade-out'}`}
      style={{ borderColor: ad.border, background: ad.bg }}
    >
      <div className="banner-inner">{ad.content}</div>
      <div className="banner-tag">PUB</div>
    </div>
  )
}
