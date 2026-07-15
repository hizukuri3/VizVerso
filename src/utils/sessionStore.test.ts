import { describe, it, expect, beforeEach, vi } from 'vitest'
// fake-indexeddb でブラウザの IndexedDB を再現する
import 'fake-indexeddb/auto'
import {
  saveLastWorkbook,
  loadLastWorkbook,
  clearLastWorkbook,
} from './sessionStore'

/** IndexedDB を毎テストで初期化する（DB を丸ごと削除） */
function deleteDb(): Promise<void> {
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('vizverso')
    req.onsuccess = () => resolve()
    req.onerror = () => resolve()
    req.onblocked = () => resolve()
  })
}

function makeFile(name: string, sizeBytes: number): File {
  const blob = new Blob([new Uint8Array(sizeBytes)], {
    type: 'application/octet-stream',
  })
  return new File([blob], name, { type: 'application/octet-stream' })
}

describe('sessionStore', () => {
  beforeEach(async () => {
    await deleteDb()
  })

  it('保存したワークブックを読み込めること', async () => {
    const file = makeFile('sample.twbx', 128)
    await saveLastWorkbook(file)

    const loaded = await loadLastWorkbook()
    expect(loaded).not.toBeNull()
    expect(loaded!.file.name).toBe('sample.twbx')
    expect(loaded!.file.size).toBe(128)
    expect(typeof loaded!.savedAt).toBe('number')
  })

  it('破棄すると読み込み結果が null になること', async () => {
    await saveLastWorkbook(makeFile('sample.twbx', 64))
    await clearLastWorkbook()
    const loaded = await loadLastWorkbook()
    expect(loaded).toBeNull()
  })

  it('保存が無い状態では null を返すこと', async () => {
    const loaded = await loadLastWorkbook()
    expect(loaded).toBeNull()
  })

  it('固定キーで上書きされ、常に最新の1件のみ保持すること', async () => {
    await saveLastWorkbook(makeFile('old.twbx', 32))
    await saveLastWorkbook(makeFile('new.twbx', 48))
    const loaded = await loadLastWorkbook()
    expect(loaded!.file.name).toBe('new.twbx')
    expect(loaded!.file.size).toBe(48)
  })

  it('100MB を超えるファイルは保存をスキップすること', async () => {
    // 実バイト確保を避けるため size を偽装する
    const file = makeFile('huge.twbx', 1)
    Object.defineProperty(file, 'size', { value: 100 * 1024 * 1024 + 1 })
    await saveLastWorkbook(file)
    const loaded = await loadLastWorkbook()
    expect(loaded).toBeNull()
  })

  it('IndexedDB 非対応環境でも例外を投げず安全に失敗すること', async () => {
    const original = globalThis.indexedDB
    // @ts-expect-error テストのため一時的に無効化
    globalThis.indexedDB = undefined
    try {
      await expect(
        saveLastWorkbook(makeFile('x.twbx', 16)),
      ).resolves.toBeUndefined()
      await expect(loadLastWorkbook()).resolves.toBeNull()
      await expect(clearLastWorkbook()).resolves.toBeUndefined()
    } finally {
      globalThis.indexedDB = original
    }
    vi.restoreAllMocks()
  })
})
