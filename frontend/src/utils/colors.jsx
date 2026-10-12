import React from 'react'

export const COLOR_PALETTE = {
  'Black': '#111827',
  'White': '#ffffff',
  'Red': '#ef4444',
  'Blue': '#3b82f6',
  'Navy Blue': '#1e3a8a',
  'Sky Blue': '#38bdf8',
  'Green': '#22c55e',
  'Olive Green': '#65a30d',
  'Yellow': '#eab308',
  'Pink': '#ec4899',
  'Purple': '#a855f7',
  'Orange': '#f97316',
  'Grey': '#6b7280',
  'Gray': '#6b7280',
  'Brown': '#78350f',
  'Beige': '#d4b996',
  'Maroon': '#881337',
  'Khaki': '#c3b091',
  'Pattern / Multi': 'linear-gradient(135deg, #ef4444, #3b82f6, #10b981, #f59e0b)'
}

export function getColorHex(colorName) {
  if (!colorName) return null
  const trimmed = String(colorName).trim()
  if (COLOR_PALETTE[trimmed]) return COLOR_PALETTE[trimmed]

  const lower = trimmed.toLowerCase()
  for (const [key, val] of Object.entries(COLOR_PALETTE)) {
    if (key.toLowerCase() === lower || lower.includes(key.toLowerCase())) {
      return val
    }
  }

  // Check if it's already a valid hex or css color
  if (/^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(trimmed)) {
    return trimmed
  }

  return null
}

export function ColorSwatch({ color, size = 13, style = {} }) {
  const bg = getColorHex(color)
  if (!bg) return null

  const isWhiteOrLight = bg === '#ffffff' || bg === '#d4b996' || bg === '#c3b091' || bg === '#eab308'

  return (
    <span
      style={{
        display: 'inline-block',
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        border: isWhiteOrLight ? '1px solid #94a3b8' : '1px solid rgba(0,0,0,0.15)',
        boxShadow: '0 1px 2px rgba(0,0,0,0.1)',
        flexShrink: 0,
        verticalAlign: 'middle',
        ...style
      }}
      title={color}
    />
  )
}
