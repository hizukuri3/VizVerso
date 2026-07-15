/**
 * 直近に解析したワークブックを IndexedDB に保存し、リロード後に復元できるようにする
 * 小さなユーティリティ。ブラウザの IndexedDB を直接使い、外部依存は追加しない。
 *
 * 設計方針:
 * - DB 'vizverso' / object store 'lastWorkbook' に固定キー1件のみを保持する。
 * - すべての操作は例外を握りつぶし、IndexedDB 非対応・容量超過でもアプリを壊さない。
 */

const DB_NAME = 'vizverso'
const STORE_NAME = 'lastWorkbook'
const FIXED_KEY = 'last'
const MAX_BYTES = 100 * 1024 * 1024 // 100MB を超えるファイルは保存しない

interface StoredWorkbook {
  blob: Blob
  name: string
  savedAt: number
}

/** IndexedDB が利用可能か判定する */
function getIndexedDB(): IDBFactory | null {
  try {
    return typeof indexedDB !== 'undefined' ? indexedDB : null
  } catch {
    return null
  }
}

/** DB を開く（ストアが無ければ作成）。失敗時は null を解決する */
function openDb(): Promise<IDBDatabase | null> {
  return new Promise((resolve) => {
    const idb = getIndexedDB()
    if (!idb) {
      resolve(null)
      return
    }
    try {
      const req = idb.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const db = req.result
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME)
        }
      }
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
      req.onblocked = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

/**
 * 直近のワークブックを保存する（固定キー1件のみ）。
 * 100MB を超えるファイル・IndexedDB 非対応環境では黙ってスキップする。
 */
export async function saveLastWorkbook(file: File): Promise<void> {
  try {
    if (file.size > MAX_BYTES) return
    const db = await openDb()
    if (!db) return

    const record: StoredWorkbook = {
      blob: file,
      name: file.name,
      savedAt: Date.now(),
    }

    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).put(record, FIXED_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
        tx.onabort = () => resolve()
      } catch {
        resolve()
      }
    })
    db.close()
  } catch {
    // 保存失敗はアプリの動作に影響させない
  }
}

/**
 * 直近のワークブックを読み込む。無い場合や失敗時は null を返す。
 * 保存されている Blob から File を再構築して返す。
 */
export async function loadLastWorkbook(): Promise<{
  file: File
  savedAt: number
} | null> {
  try {
    const db = await openDb()
    if (!db) return null

    const record = await new Promise<StoredWorkbook | null>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readonly')
        const req = tx.objectStore(STORE_NAME).get(FIXED_KEY)
        req.onsuccess = () => resolve((req.result as StoredWorkbook) ?? null)
        req.onerror = () => resolve(null)
      } catch {
        resolve(null)
      }
    })
    db.close()

    if (!record || !record.blob) return null
    const file = new File([record.blob], record.name, {
      type: record.blob.type,
    })
    return { file, savedAt: record.savedAt }
  } catch {
    return null
  }
}

/** 保存済みのワークブックを削除する。失敗時も黙って握りつぶす */
export async function clearLastWorkbook(): Promise<void> {
  try {
    const db = await openDb()
    if (!db) return
    await new Promise<void>((resolve) => {
      try {
        const tx = db.transaction(STORE_NAME, 'readwrite')
        tx.objectStore(STORE_NAME).delete(FIXED_KEY)
        tx.oncomplete = () => resolve()
        tx.onerror = () => resolve()
        tx.onabort = () => resolve()
      } catch {
        resolve()
      }
    })
    db.close()
  } catch {
    // 削除失敗も無視する
  }
}
