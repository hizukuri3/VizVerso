/**
 * 匿名の機能利用イベント計測。プライバシー最優先の設計。
 *
 * 送信するのはイベント名と粗い定量バケットのみで、ユーザーデータ
 * （ファイル名・フィールド名・計算式・ワークブックの内容など）は一切送らない。
 *
 * - Cookie / ユーザーID / セッションID を使わない
 * - navigator.doNotTrack === '1' または globalPrivacyControl が truthy なら送信しない
 * - 開発時（import.meta.env.PROD が false）は送信しない
 * - すべて fire-and-forget。失敗しても throw せず、アプリ動作に影響させない
 */

/** 送信を許可するイベント名（union 型で固定。任意文字列は受け付けない） */
export type AnalyticsEventName =
  | 'workbook_analyzed'
  | 'analyze_failed'
  | 'sample_tried'
  | 'excel_exported'
  | 'graph_opened'
  | 'drawer_opened'
  | 'tour_completed'
  | 'tour_skipped'
  | 'language_switched'

/** イベント受信エンドポイント（Cloudflare Pages Functions） */
const ENDPOINT = '/api/event'

/**
 * 計測イベントを送信してよいかを判定する。
 * PROD かつ DNT / GPC が無効な場合のみ true。
 */
function isTrackingAllowed(): boolean {
  // 開発時は送信しない
  if (!import.meta.env.PROD) return false

  // navigator が無い環境（SSR 等）では送信しない
  if (typeof navigator === 'undefined') return false

  // Do Not Track を尊重
  if (navigator.doNotTrack === '1') return false

  // Global Privacy Control を尊重
  const gpc = (navigator as Navigator & { globalPrivacyControl?: boolean })
    .globalPrivacyControl
  if (gpc) return false

  return true
}

/**
 * 匿名の機能利用イベントを送信する（fire-and-forget）。
 * @param name 送信するイベント名（allowlist の union 型）
 * @param props 粗いバケット等の付随情報（ユーザーデータは含めないこと）
 */
export function trackEvent(
  name: AnalyticsEventName,
  props?: Record<string, string>,
): void {
  try {
    if (!isTrackingAllowed()) return

    const payload = JSON.stringify({ name, props })

    // sendBeacon はページ遷移中でも確実に送れるため優先的に使う
    if (typeof navigator.sendBeacon === 'function') {
      navigator.sendBeacon(ENDPOINT, payload)
      return
    }

    // sendBeacon 非対応環境では keepalive fetch にフォールバック
    if (typeof fetch === 'function') {
      void fetch(ENDPOINT, {
        method: 'POST',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: payload,
      }).catch(() => {
        // 送信失敗は無視する
      })
    }
  } catch {
    // 計測処理の失敗はアプリ動作に影響させない
  }
}

/** ファイルサイズ（bytes）を粗いバケットに変換する */
export function bucketFileSize(
  bytes: number,
): '<1MB' | '1-10MB' | '10-50MB' | '50MB+' {
  const mb = bytes / (1024 * 1024)
  if (mb < 1) return '<1MB'
  if (mb < 10) return '1-10MB'
  if (mb < 50) return '10-50MB'
  return '50MB+'
}

/** 件数を粗いバケットに変換する */
export function bucketCount(
  n: number,
): '0' | '1-10' | '11-50' | '51-200' | '200+' {
  if (n <= 0) return '0'
  if (n <= 10) return '1-10'
  if (n <= 50) return '11-50'
  if (n <= 200) return '51-200'
  return '200+'
}

/** 処理時間（ms）を粗いバケットに変換する */
export function bucketDuration(ms: number): '<1s' | '1-5s' | '5-15s' | '15s+' {
  if (ms < 1000) return '<1s'
  if (ms < 5000) return '1-5s'
  if (ms < 15000) return '5-15s'
  return '15s+'
}
