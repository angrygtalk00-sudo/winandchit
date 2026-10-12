import React, { useEffect, useMemo, useRef, useState } from 'react'
import axios from 'axios'

export default function Banner({ className = '' }) {
  const [slides, setSlides] = useState([])
  const [activeIndex, setActiveIndex] = useState(0)
  const [transitionEnabled, setTransitionEnabled] = useState(true)
  const touchStartXRef = useRef(0)
  const touchEndXRef = useRef(0)
  const loadGenerationRef = useRef(0)

  const enabledSlides = useMemo(
    () => slides
      .filter(item => item?.enabled !== false && typeof item?.url === 'string' && item.url.trim())
      .map(item => item.url),
    [slides]
  )

  useEffect(() => {
    let canceled = false

    const loadBanners = async () => {
      const requestGeneration = ++loadGenerationRef.current
      try {
        const response = await axios.get('/api/settings')
        if (canceled || requestGeneration !== loadGenerationRef.current) return
        const nextBanners = Array.isArray(response.data?.banners) ? response.data.banners : []
        setSlides(nextBanners)
      } catch (error) {
        if (!canceled && requestGeneration === loadGenerationRef.current) {
          console.error('Failed to fetch home banners:', error)
        }
      }
    }

    const onSettingsUpdated = () => loadBanners()
    const onStorage = event => {
      if (event.key === 'settingsUpdatedAt') loadBanners()
    }

    loadBanners()
    window.addEventListener('settings-updated', onSettingsUpdated)
    window.addEventListener('storage', onStorage)
    return () => {
      canceled = true
      window.removeEventListener('settings-updated', onSettingsUpdated)
      window.removeEventListener('storage', onStorage)
    }
  }, [])

  useEffect(() => {
    if (enabledSlides.length <= 1) return undefined
    const timer = window.setInterval(() => {
      setActiveIndex(current => current >= enabledSlides.length - 1
        ? enabledSlides.length
        : current + 1)
    }, 4200)
    return () => window.clearInterval(timer)
  }, [enabledSlides.length])

  useEffect(() => {
    if (activeIndex <= enabledSlides.length && (enabledSlides.length > 1 || activeIndex === 0)) return
    setActiveIndex(0)
  }, [activeIndex, enabledSlides.length])

  function showPrevious() {
    if (enabledSlides.length <= 1) return
    setActiveIndex(current => current === 0
      ? enabledSlides.length - 1
      : current >= enabledSlides.length
        ? 0
        : current - 1)
  }

  function showNext() {
    if (enabledSlides.length <= 1) return
    setActiveIndex(current => current >= enabledSlides.length - 1
      ? enabledSlides.length
      : current + 1)
  }

  function handleTrackTransitionEnd(event) {
    if (event.propertyName !== 'transform' || activeIndex !== enabledSlides.length) return
    setTransitionEnabled(false)
    setActiveIndex(0)
    window.requestAnimationFrame(() => setTransitionEnabled(true))
  }

  function onTouchStart(event) {
    touchStartXRef.current = event.touches[0]?.clientX || 0
  }

  function onTouchEnd(event) {
    touchEndXRef.current = event.changedTouches[0]?.clientX || 0
    const deltaX = touchStartXRef.current - touchEndXRef.current
    if (Math.abs(deltaX) < 35) return
    if (deltaX > 0) showNext()
    else showPrevious()
  }

  if (enabledSlides.length === 0) return null

  return (
    <div className={`vip-banner-carousel ${className}`.trim()} aria-label="Promotional banners" onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
      <div
        className="vip-banner-carousel-track"
        onTransitionEnd={handleTrackTransitionEnd}
        style={{
          transform: `translateX(-${activeIndex * 100}%)`,
          transition: transitionEnabled ? undefined : 'none'
        }}
      >
        <>
          {enabledSlides.map((url, idx) => (
            <div className="vip-banner-slide" key={`${url}-${idx}`}>
              <img src={url} alt={`Shop banner ${idx + 1}`} loading={idx === 0 ? 'eager' : 'lazy'} />
            </div>
          ))}
          {enabledSlides.length > 1 && (
            <div className="vip-banner-slide" key="home-banner-clone">
              <img src={enabledSlides[0]} alt="" aria-hidden="true" />
            </div>
          )}
        </>
      </div>
      {enabledSlides.length > 1 && (
        <>
          <div className="vip-banner-dots" aria-hidden="true">
            {enabledSlides.map((_, idx) => (
              <button
                type="button"
                key={idx}
                className={`vip-banner-dot${idx === activeIndex % enabledSlides.length ? ' active' : ''}`}
                onClick={() => setActiveIndex(idx)}
                aria-label={`Go to banner ${idx + 1}`}
              />
            ))}
          </div>
        </>
      )}
    </div>
  )
}
