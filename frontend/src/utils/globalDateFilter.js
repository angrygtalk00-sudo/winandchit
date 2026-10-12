let globalDateFilter = null

function getTodayDateStr(d = new Date()) {
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function ensureInitialized() {
  if (!globalDateFilter) {
    const today = getTodayDateStr()
    globalDateFilter = {
      startDate: today,
      endDate: today,
      preset: 'today'
    }
  }
}

export function getGlobalDateFilter() {
  ensureInitialized()
  return { ...globalDateFilter }
}

export function setGlobalDateFilter(next) {
  ensureInitialized()
  globalDateFilter = {
    ...globalDateFilter,
    ...next
  }
  return { ...globalDateFilter }
}

export function resetGlobalDateFilterToToday() {
  const today = getTodayDateStr()
  globalDateFilter = {
    startDate: today,
    endDate: today,
    preset: 'today'
  }
  return { ...globalDateFilter }
}
