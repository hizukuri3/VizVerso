/**
 * @vitest-environment jsdom
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { extractTwbFromTwbx } from './twbxParser';
import { parseTableauXml } from './xmlParser';

describe('Integration - twbx to XML Parsing', () => {
  it('サンプルの .twbx から設計情報を抽出できること', async () => {
    // 本物のサンプルファイルを読み込む
    const filePath = resolve(__dirname, '../../tests/fixtures/sample.twbx');
    const buffer = readFileSync(filePath);
    
    // jsdom環境の File オブジェクトとして扱う
    const file = new File([buffer], 'sample.twbx', { type: 'application/zip' });

    // 1. twbx から xml の抽出
    const xmlString = await extractTwbFromTwbx(file);
    expect(xmlString).toBeDefined();
    expect(xmlString.length).toBeGreaterThan(0);

    // 2. XML をパースして設計情報を抽出
    const documentInfo = parseTableauXml(xmlString);
    
    expect(documentInfo).toBeDefined();
    expect(documentInfo.dashboards).toBeDefined();
    expect(documentInfo.worksheets).toBeDefined();
    expect(documentInfo.datasources).toBeDefined();

    console.log('--- パース結果 ---');
    console.log(`ダッシュボード数: ${documentInfo.dashboards.length}`);
    console.log(`シート数: ${documentInfo.worksheets.length}`);
    console.log(`データソース数: ${documentInfo.datasources.length}`);
    
    if (documentInfo.datasources.length > 0) {
      const fieldCount = documentInfo.datasources.reduce((sum, ds) => sum + ds.fields.length, 0);
      console.log(`総フィールド数: ${fieldCount}`);
    }
  });
});
