import { extractTwbFromTwbx } from '../utils/twbxParser'
import { parseTableauXml } from '../utils/xmlParser'

/**
 * Tableau ワークブック解析 Worker
 * メインスレッドから送られた File オブジェクトを非同期にパースする
 */
self.onmessage = async (e: MessageEvent) => {
  const { file } = e.data

  if (!file) {
    self.postMessage({ success: false, error: 'No file provided to worker' })
    return
  }

  try {
    // 1. .twbx から .twb (XML) を抽出
    const xmlString = await extractTwbFromTwbx(file)

    // 2. XML を解析してデータモデルに変換
    // 注意: DOMParser を使わない fast-xml-parser 実装のため Worker 内で動作可能
    const document = parseTableauXml(xmlString)

    // 3. 解析結果を返却
    self.postMessage({ success: true, document })
  } catch (error: unknown) {
    const message =
      error instanceof Error
        ? error.message
        : 'Unknown error occurred during parsing'
    console.error('Worker Error:', error)
    self.postMessage({
      success: false,
      error: message,
    })
  }
}
