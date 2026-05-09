import { describe, it, expect, vi } from 'vitest'
import { parseWorkbookAsync } from './workerManager'

// Web Workerをモック化
vi.mock('../workers/tableauParser.worker?worker', () => {
  return {
    default: class MockWorker {
      onmessage: (e: {
        data: { success: boolean; document?: unknown; error?: string }
      }) => void = () => {}
      onerror: (err: Error) => void = () => {}
      postMessage(msg: { file: File }) {
        // メッセージ送信時に模擬的なレスポンスを返す
        if (msg.file.name === 'error.twbx') {
          this.onmessage({ data: { success: false, error: 'Parse failed' } })
        } else if (msg.file.name === 'crash.twbx') {
          this.onerror(new Error('Worker crashed'))
        } else {
          this.onmessage({
            data: {
              success: true,
              document: { datasources: [], worksheets: [], dashboards: [] },
            },
          })
        }
      }
      terminate = vi.fn()
    },
  }
})

describe('workerManager - parseWorkbookAsync', () => {
  it('パース処理が成功したとき、TableauDocumentを返すこと', async () => {
    const dummyFile = new File([''], 'test.twbx', { type: 'application/zip' })
    const result = await parseWorkbookAsync(dummyFile)
    expect(result).toBeDefined()
    expect(result.datasources).toEqual([])
  })

  it('Worker内部でエラーが発生したとき、例外を投げること', async () => {
    const errorFile = new File([''], 'error.twbx')
    await expect(parseWorkbookAsync(errorFile)).rejects.toThrow('Parse failed')
  })

  it('Worker自体がクラッシュしたとき、例外を投げること', async () => {
    const crashFile = new File([''], 'crash.twbx')
    await expect(parseWorkbookAsync(crashFile)).rejects.toThrow(
      'Worker crashed',
    )
  })
})
