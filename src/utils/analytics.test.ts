import { describe, it, expect, vi, afterEach } from 'vitest'
import {
  trackEvent,
  bucketFileSize,
  bucketCount,
  bucketDuration,
  type AnalyticsEventName,
} from './analytics'

// 各テストで stub した env / global を確実に元へ戻す
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('analytics - trackEvent（送信ガード）', () => {
  it('開発時（PROD=false）は送信しないこと', () => {
    vi.stubEnv('PROD', false)
    const sendBeacon = vi.fn()
    vi.stubGlobal('navigator', { sendBeacon })

    trackEvent('workbook_analyzed')

    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('Do Not Track が有効なときは送信しないこと', () => {
    vi.stubEnv('PROD', true)
    const sendBeacon = vi.fn()
    vi.stubGlobal('navigator', { sendBeacon, doNotTrack: '1' })

    trackEvent('workbook_analyzed')

    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('Global Privacy Control が有効なときは送信しないこと', () => {
    vi.stubEnv('PROD', true)
    const sendBeacon = vi.fn()
    vi.stubGlobal('navigator', { sendBeacon, globalPrivacyControl: true })

    trackEvent('workbook_analyzed')

    expect(sendBeacon).not.toHaveBeenCalled()
  })

  it('PROD かつ DNT/GPC 無効のとき sendBeacon が正しい payload で呼ばれること', () => {
    vi.stubEnv('PROD', true)
    const sendBeacon = vi.fn()
    vi.stubGlobal('navigator', { sendBeacon })

    trackEvent('graph_opened', { kind: 'field' })

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [url, payload] = sendBeacon.mock.calls[0]
    expect(url).toBe('/api/event')
    expect(JSON.parse(payload as string)).toEqual({
      name: 'graph_opened',
      props: { kind: 'field' },
    })
  })

  it('props を省略した場合も送信できること', () => {
    vi.stubEnv('PROD', true)
    const sendBeacon = vi.fn()
    vi.stubGlobal('navigator', { sendBeacon })

    trackEvent('sample_tried')

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const payload = sendBeacon.mock.calls[0][1] as string
    expect(JSON.parse(payload).name).toBe('sample_tried')
  })

  it('sendBeacon が無い環境では keepalive fetch にフォールバックすること', () => {
    vi.stubEnv('PROD', true)
    const fetchMock = vi.fn().mockResolvedValue({ ok: true })
    // sendBeacon を持たない navigator
    vi.stubGlobal('navigator', {})
    vi.stubGlobal('fetch', fetchMock)

    trackEvent('excel_exported')

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe('/api/event')
    expect(init.method).toBe('POST')
    expect(init.keepalive).toBe(true)
    expect(JSON.parse(init.body as string).name).toBe('excel_exported')
  })

  it('sendBeacon が例外を投げても trackEvent は throw しないこと', () => {
    vi.stubEnv('PROD', true)
    const sendBeacon = vi.fn(() => {
      throw new Error('boom')
    })
    vi.stubGlobal('navigator', { sendBeacon })

    expect(() => trackEvent('drawer_opened')).not.toThrow()
  })

  it('AnalyticsEventName 型に定義されたイベント名を受け付けること', () => {
    // 型レベルの存在確認（コンパイルが通ることを担保）
    const names: AnalyticsEventName[] = [
      'workbook_analyzed',
      'analyze_failed',
      'sample_tried',
      'excel_exported',
      'graph_opened',
      'drawer_opened',
      'tour_completed',
      'tour_skipped',
      'language_switched',
    ]
    expect(names).toHaveLength(9)
  })
})

describe('analytics - バケット関数の境界値', () => {
  it('bucketFileSize が境界値で正しいバケットを返すこと', () => {
    expect(bucketFileSize(0)).toBe('<1MB')
    expect(bucketFileSize(1024 * 1024 - 1)).toBe('<1MB')
    expect(bucketFileSize(1024 * 1024)).toBe('1-10MB')
    expect(bucketFileSize(10 * 1024 * 1024 - 1)).toBe('1-10MB')
    expect(bucketFileSize(10 * 1024 * 1024)).toBe('10-50MB')
    expect(bucketFileSize(50 * 1024 * 1024 - 1)).toBe('10-50MB')
    expect(bucketFileSize(50 * 1024 * 1024)).toBe('50MB+')
    expect(bucketFileSize(200 * 1024 * 1024)).toBe('50MB+')
  })

  it('bucketCount が境界値で正しいバケットを返すこと', () => {
    expect(bucketCount(0)).toBe('0')
    expect(bucketCount(-5)).toBe('0')
    expect(bucketCount(1)).toBe('1-10')
    expect(bucketCount(10)).toBe('1-10')
    expect(bucketCount(11)).toBe('11-50')
    expect(bucketCount(50)).toBe('11-50')
    expect(bucketCount(51)).toBe('51-200')
    expect(bucketCount(200)).toBe('51-200')
    expect(bucketCount(201)).toBe('200+')
  })

  it('bucketDuration が境界値で正しいバケットを返すこと', () => {
    expect(bucketDuration(0)).toBe('<1s')
    expect(bucketDuration(999)).toBe('<1s')
    expect(bucketDuration(1000)).toBe('1-5s')
    expect(bucketDuration(4999)).toBe('1-5s')
    expect(bucketDuration(5000)).toBe('5-15s')
    expect(bucketDuration(14999)).toBe('5-15s')
    expect(bucketDuration(15000)).toBe('15s+')
  })
})
