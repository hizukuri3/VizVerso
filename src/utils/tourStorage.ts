const TOUR_SEEN_KEY = 'vizverso_tour_seen'

/** 初回ツアーを表示済みかどうか（localStorage 不可の環境では表示しない扱い） */
export function hasSeenTour(): boolean {
  try {
    return window.localStorage.getItem(TOUR_SEEN_KEY) === '1'
  } catch {
    return true
  }
}

export function markTourSeen(): void {
  try {
    window.localStorage.setItem(TOUR_SEEN_KEY, '1')
  } catch {
    // 保存できない環境（プライベートモード等）では毎回表示になるだけなので無視
  }
}
