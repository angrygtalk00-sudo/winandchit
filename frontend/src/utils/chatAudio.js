// Web Audio API Synthesizer for high-end UI sound effects without external audio files

let audioCtx = null

function getAudioContext() {
  if (typeof window === 'undefined') return null
  const AudioContextClass = window.AudioContext || window.webkitAudioContext
  if (!AudioContextClass) return null
  if (!audioCtx) {
    audioCtx = new AudioContextClass()
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume().catch(() => {})
  }
  return audioCtx
}

/**
 * Satisfying "Whoosh" / Sent Sound effect for message or photo sent
 */
export function playWhooshSound() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    // White noise / air burst for whoosh
    const bufferSize = ctx.sampleRate * 0.22 // 220ms
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate)
    const data = buffer.getChannelData(0)
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1
    }

    const noise = ctx.createBufferSource()
    noise.buffer = buffer

    // Filter to sweep frequency upwards/downwards for realistic whoosh
    const filter = ctx.createBiquadFilter()
    filter.type = 'bandpass'
    filter.frequency.setValueAtTime(350, now)
    filter.frequency.exponentialRampToValueAtTime(1400, now + 0.1)
    filter.frequency.exponentialRampToValueAtTime(300, now + 0.22)
    filter.Q.setValueAtTime(3.0, now)

    // Gain envelope
    const gain = ctx.createGain()
    gain.gain.setValueAtTime(0.01, now)
    gain.gain.linearRampToValueAtTime(0.28, now + 0.06)
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22)

    noise.connect(filter)
    filter.connect(gain)
    gain.connect(ctx.destination)

    noise.start(now)
    noise.stop(now + 0.22)

    // Soft chime pop harmonic underneath
    const osc = ctx.createOscillator()
    const oscGain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(520, now)
    osc.frequency.exponentialRampToValueAtTime(960, now + 0.12)

    oscGain.gain.setValueAtTime(0.01, now)
    oscGain.gain.linearRampToValueAtTime(0.18, now + 0.04)
    oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)

    osc.connect(oscGain)
    oscGain.connect(ctx.destination)

    osc.start(now)
    osc.stop(now + 0.2)
  } catch (e) {
    // Audio context may be restricted by browser policy before first interaction
  }
}

/**
 * Modern notification chime sound effect for incoming message / alert
 */
export function playNotificationSound() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return

    const now = ctx.currentTime

    // Two-tone bell chime (High C & G pleasant chime)
    const tones = [
      { freq: 880, start: 0, dur: 0.18 },
      { freq: 1174.66, start: 0.08, dur: 0.35 }
    ]

    tones.forEach(({ freq, start, dur }) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = 'sine'
      osc.frequency.setValueAtTime(freq, now + start)

      gain.gain.setValueAtTime(0.001, now + start)
      gain.gain.linearRampToValueAtTime(0.25, now + start + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + start + dur)

      osc.connect(gain)
      gain.connect(ctx.destination)

      osc.start(now + start)
      osc.stop(now + start + dur)
    })
  } catch (e) {}
}

export function playCommentNotificationSound() {
  try {
    const ctx = getAudioContext()
    if (!ctx) return
    const now = ctx.currentTime
    ;[
      { frequency: 659.25, offset: 0, duration: 0.12 },
      { frequency: 987.77, offset: 0.1, duration: 0.16 },
      { frequency: 1318.51, offset: 0.2, duration: 0.32 }
    ].forEach(({ frequency, offset, duration }) => {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      oscillator.type = 'triangle'
      oscillator.frequency.setValueAtTime(frequency, now + offset)
      gain.gain.setValueAtTime(0.001, now + offset)
      gain.gain.linearRampToValueAtTime(0.2, now + offset + 0.02)
      gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(now + offset)
      oscillator.stop(now + offset + duration)
    })
  } catch (e) {}
}

export function triggerNotificationVibration(pattern = [90, 55, 140]) {
  try {
    if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') navigator.vibrate(pattern)
  } catch (e) {}
}

/**
 * Request desktop browser notification permission & show desktop alert popup
 */
export async function showDesktopNotification(title, options = {}) {
  try {
    if (typeof window === 'undefined' || !('Notification' in window)) return

    if (Notification.permission === 'default') {
      await Notification.requestPermission()
    }

    if (Notification.permission === 'granted') {
      const notif = new Notification(title, {
        icon: '/assets/winandchit-logo.png',
        badge: '/assets/winandchit-logo.png',
        silent: true, // We already play our custom synthesized sound
        ...options
      })
      notif.onclick = () => {
        window.focus()
        if (typeof options.onClick === 'function') options.onClick()
        notif.close()
      }
    }
  } catch (e) {
    console.warn('Could not trigger notification:', e)
  }
}
