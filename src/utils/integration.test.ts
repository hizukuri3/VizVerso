import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import { extractTwbFromTwbx } from './twbxParser'
import { parseTableauXml } from './xmlParser'

describe('Integration - twbx to XML Parsing', () => {
  it('実ファイル B2VB2026W8.twbx から設計情報を抽出できること', async () => {
    const filePath = resolve(__dirname, '../../tests/fixtures/B2VB2026W8.twbx')
    const buffer = readFileSync(filePath)
    const file = new File([buffer], 'B2VB2026W8.twbx', {
      type: 'application/zip',
    })

    const xmlString = await extractTwbFromTwbx(file)
    expect(xmlString).toBeDefined()

    const documentInfo = parseTableauXml(xmlString)
    expect(documentInfo).toBeDefined()
    expect(documentInfo.worksheets.length).toBeGreaterThan(0)
  })
})
