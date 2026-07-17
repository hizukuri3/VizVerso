/**
 * Cloudflare Pages Functions: 匿名イベントの受信エンドポイント（POST /api/event）。
 *
 * - allowlist に含まれるイベント名のみを受け付ける（不正なら 204 で無視）
 * - Analytics Engine バインディング（env.VIZVERSO_ANALYTICS）がある場合のみ記録する
 * - いかなる例外もアプリ側に影響させないよう握りつぶし、常に 204 を返す
 *
 * ユーザーデータ（ファイル内容・ファイル名・個人情報）は受け取らない前提であり、
 * クライアント（src/utils/analytics.ts）からはイベント名と粗いバケットのみ送られる。
 */

/** Workers Analytics Engine の最小型定義（@cloudflare/workers-types 非依存） */
interface AnalyticsEngineDataset {
  writeDataPoint(event: {
    blobs?: string[]
    doubles?: number[]
    indexes?: string[]
  }): void
}

interface Env {
  /** wrangler.toml / Pages ダッシュボードで設定する Analytics Engine dataset */
  VIZVERSO_ANALYTICS?: AnalyticsEngineDataset
}

/** Pages Functions のリクエストコンテキスト（必要最小限） */
interface EventContext {
  request: Request
  env: Env
}

/**
 * クライアントの AnalyticsEventName（src/utils/analytics.ts）と一致させること。
 * ここに無いイベント名はすべて無視する。
 */
const ALLOWED_EVENTS: ReadonlySet<string> = new Set([
  'workbook_analyzed',
  'analyze_failed',
  'sample_tried',
  'excel_exported',
  'graph_opened',
  'drawer_opened',
  'tour_completed',
  'tour_skipped',
  'language_switched',
])

export async function onRequestPost(context: EventContext): Promise<Response> {
  try {
    const { request, env } = context
    const body = (await request.json()) as {
      name?: unknown
      props?: unknown
    }

    const name = typeof body?.name === 'string' ? body.name : ''
    // allowlist 外のイベント名は無視する
    if (!ALLOWED_EVENTS.has(name)) {
      return new Response(null, { status: 204 })
    }

    const props =
      body.props && typeof body.props === 'object'
        ? (body.props as Record<string, string>)
        : {}

    // バインディング未設定なら何もしない（ローカル / 未設定環境）
    if (env.VIZVERSO_ANALYTICS) {
      env.VIZVERSO_ANALYTICS.writeDataPoint({
        blobs: [name, JSON.stringify(props)],
        doubles: [1],
        indexes: [name],
      })
    }
  } catch {
    // JSON パース失敗・記録失敗などはすべて握りつぶす
  }

  // 計測は fire-and-forget。常に本文なし 204 を返す
  return new Response(null, { status: 204 })
}
