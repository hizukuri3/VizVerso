import * as XLSX from 'xlsx';
import type { TableauDocument, TableauField } from '../types/tableau';
import { tMark } from './i18n';

// ────────────────────────────────────────────
// 表示名（Caption）解決ヘルパー
// ────────────────────────────────────────────

/** データソース全体 + ワークシートローカルフィールドを統合した Map を生成 */
function buildFieldMap(doc: TableauDocument, wsName?: string): Map<string, TableauField> {
  const map = new Map<string, TableauField>();
  doc.datasources.forEach(ds => {
    ds.fields.forEach(f => map.set(f.column, f));
  });
  if (wsName) {
    const ws = doc.worksheets.find(w => w.name === wsName);
    ws?.localFields?.forEach(f => {
      if (!map.has(f.column) || f.caption) map.set(f.column, f);
    });
  }
  return map;
}

/** フィールド物理名（rank:sum:[DS].[Calc_xxx]:qk:1 等）から表示名を解決 */
function resolveCaption(fieldName: string, fieldMap: Map<string, TableauField>): string {
  const clean = (name: string) => {
    let inner = name;
    const bracketMatches = [...name.matchAll(/\[([^\]]+)\]/g)];
    if (bracketMatches.length > 0) {
      inner = bracketMatches[bracketMatches.length - 1][1];
    }
    
    const pts = inner.split(':').filter(p => !/^\d+$/.test(p));
    const typeIds = ['nk', 'qk', 'ok', 'ok2', 'ni', 'oi'];
    const aggFns = ['sum', 'avg', 'min', 'max', 'count', 'cnt', 'cntd', 'attr', 'median', 'stdev', 'var', 'collect'];
    const filtered = pts.filter(p => !typeIds.includes(p.toLowerCase()) && !aggFns.includes(p.toLowerCase()));
    
    return filtered[filtered.length - 1] || pts[pts.length - 1] || inner;
  };

  const cleanId = clean(fieldName);
  let meta = fieldMap.get(cleanId);
  if (!meta) {
    for (const [k, v] of fieldMap.entries()) {
      if (k.toLowerCase() === cleanId.toLowerCase()) {
        meta = v;
        break;
      }
    }
  }
  
  let displayName = meta?.caption || cleanId;
  if (displayName.startsWith('[') && displayName.endsWith(']')) {
    displayName = displayName.substring(1, displayName.length - 1);
  }

  const isSum = /\bsum:/i.test(fieldName) && !displayName.includes('合計');
  const isAvg = /\bavg:/i.test(fieldName) && !displayName.includes('平均');
  const isMin = /\bmin:/i.test(fieldName) && !displayName.includes('最小');
  const isMax = /\bmax:/i.test(fieldName) && !displayName.includes('最大');
  const isCount = (/\bcnt:|\bcntd:/i.test(fieldName)) && !displayName.includes('カウント');
  const isAttr = /\battr:/i.test(fieldName) && !displayName.includes('属性');
  const isCollect = (/\bcollect:|\bspatial:/i.test(fieldName) || meta?.dataType === 'spatial') && !displayName.includes('収集');
  const isTableCalc = (fieldName.includes('rank:') || fieldName.includes('running:') || fieldName.includes('window:')) && !displayName.includes('△');

  let formattedName = displayName;
  if (!formattedName.startsWith('[') && !/^\d+$/.test(formattedName) && !formattedName.includes('(')) {
    formattedName = `[${formattedName}]`;
  }

  if (isSum) displayName = `合計(${formattedName})`;
  else if (isAvg) displayName = `平均(${formattedName})`;
  else if (isMin) displayName = `最小(${formattedName})`;
  else if (isMax) displayName = `最大(${formattedName})`;
  else if (isCount) displayName = `カウント(${formattedName})`;
  else if (isAttr) displayName = `属性(${formattedName})`;
  else if (isCollect) displayName = `収集(${formattedName})`;
  else displayName = formattedName;

  if (isTableCalc) displayName = `${displayName} △`;

  return displayName;
}

/** Tableau解析結果をExcelブックとしてダウンロードする */
export function exportToExcel(doc: TableauDocument, workbookName: string = 'tableau_analysis') {
  const wb = XLSX.utils.book_new();


  // ──────────────────────────────────────────
  // シート①: ダッシュボード構成一覧
  // ──────────────────────────────────────────
  const dashboardRows: any[][] = [
    ['ダッシュボード名', '含まれるシート'],
  ];
  doc.dashboards.forEach(db => {
    const wsNames = db.worksheets.map(wsName => {
      const wsObj = doc.worksheets.find(w => w.name === wsName);
      return wsObj?.caption || wsName;
    }).join(' / ');
    dashboardRows.push([db.caption || db.name, wsNames]);
  });
  const dashboardSheet = XLSX.utils.aoa_to_sheet(dashboardRows);
  dashboardSheet['!cols'] = [{ wch: 30 }, { wch: 80 }];
  XLSX.utils.book_append_sheet(wb, dashboardSheet, 'ダッシュボード構成');

  // ──────────────────────────────────────────
  // シート②: ワークシート一覧（シェルフ・マーク情報）
  // ──────────────────────────────────────────
  const wsRows: any[][] = [
    ['シート名', 'データソース', '列', '行', 'フィルター', 'マーク種類', '色', 'サイズ', 'ラベル', '詳細', 'ツールヒント'],
  ];

  doc.worksheets.forEach(ws => {
    const shelf = ws.shelf;
    const mainPane = shelf?.marks;
    const fieldMap = buildFieldMap(doc, ws.name);
    const resolve = (name: string) => resolveCaption(name, fieldMap);

    wsRows.push([
      ws.caption || ws.name,
      ws.datasourceNames?.join(', ') || '',
      shelf?.cols.map(f => resolve(f.name)).join(', ') || '',
      shelf?.rows.map(f => resolve(f.name)).join(', ') || '',
      shelf?.filters.map(f => resolve(f.name)).join(', ') || '',
      mainPane ? tMark(mainPane.markType) : '',
      mainPane?.encodings.color.map(f => resolve(f.name)).join(', ') || '',
      mainPane?.encodings.size.map(f => resolve(f.name)).join(', ') || '',
      mainPane?.encodings.label.map(f => resolve(f.name)).join(', ') || '',
      mainPane?.encodings.detail.map(f => resolve(f.name)).join(', ') || '',
      mainPane?.encodings.tooltip.map(f => resolve(f.name)).join(', ') || '',
    ]);
  });
  const wsSheet = XLSX.utils.aoa_to_sheet(wsRows);
  wsSheet['!cols'] = [
    { wch: 25 }, { wch: 30 }, { wch: 30 }, { wch: 30 },
    { wch: 30 }, { wch: 15 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 }, { wch: 25 },
  ];
  XLSX.utils.book_append_sheet(wb, wsSheet, 'ワークシート一覧');

  // ──────────────────────────────────────────
  // シート③: 計算フィールド一覧
  // ──────────────────────────────────────────
  const calcRows: any[][] = [
    ['データソース', '表示名（Caption）', '計算式'],
  ];
  doc.datasources.forEach(ds => {
    ds.fields
      .filter(f => f.formula)
      .forEach(f => {
        calcRows.push([
          ds.caption || ds.name,
          f.caption || f.column,
          f.formula || '',
        ]);
      });
  });
  const calcSheet = XLSX.utils.aoa_to_sheet(calcRows);
  calcSheet['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 100 }];
  XLSX.utils.book_append_sheet(wb, calcSheet, '計算フィールド一覧');

  // ──────────────────────────────────────────
  // シート④: フィールド一覧（計算フィールド以外）
  // ──────────────────────────────────────────
  const fieldRows: any[][] = [
    ['データソース', '表示名（Caption）', 'データ型', 'ロール'],
  ];
  doc.datasources.forEach(ds => {
    ds.fields
      .filter(f => !f.formula)
      .forEach(f => {
        fieldRows.push([
          ds.caption || ds.name,
          f.caption || f.column,
          f.dataType || '',
          f.role || '',
        ]);
      });
  });
  const fieldSheet = XLSX.utils.aoa_to_sheet(fieldRows);
  fieldSheet['!cols'] = [{ wch: 30 }, { wch: 35 }, { wch: 12 }, { wch: 12 }];
  XLSX.utils.book_append_sheet(wb, fieldSheet, 'フィールド一覧');

  // ──────────────────────────────────────────
  // シート⑤～: ワークシートごとの詳細（レイヤー対応）
  // ──────────────────────────────────────────
  doc.worksheets.forEach(ws => {
    const panes = ws.shelf?.panes || [];
    if (panes.length === 0) return;
    const fieldMap = buildFieldMap(doc, ws.name);
    const resolve = (name: string) => resolveCaption(name, fieldMap);

    const rows: any[][] = [
      ['レイヤー / 軸', 'マーク種類', '役割', '集計', 'フィールド名'],
    ];

    const layerNameCounts = new Map<string, number>();

    panes.forEach((pane, i) => {
      const isMapChart = panes.some(p => p.name?.includes('mp.'));
      
      let layerName = '';
      if (isMapChart) {
        layerName = pane.name || `Layer ${i + 1}`;
      } else {
        const rowMeasures = (ws.shelf?.rows || []).filter(f => f.isContinuous);
        const colMeasures = (ws.shelf?.cols || []).filter(f => f.isContinuous);
        const splitMeasures = rowMeasures.length >= colMeasures.length ? rowMeasures : colMeasures;
        
        const hasAllPane = panes.length > splitMeasures.length;

        if (hasAllPane && i === 0) {
          layerName = 'すべて';
        } else {
          // 軸の参照名があればそれを使用
          if (pane.yAxisName || pane.xAxisName) {
            const axisRef = pane.yAxisName || pane.xAxisName;
            layerName = resolve(axisRef!);
            // MIN(0) 調整
            if (layerName.toLowerCase().startsWith('min(0)')) {
              layerName = '集計(MIN(0))';
            }
          } else {
            const measureIndex = hasAllPane ? i - 1 : i;
            const shelfField = splitMeasures[measureIndex];
            if (shelfField) {
              layerName = resolve(shelfField.name);
            } else {
              layerName = `マーク ${i + (hasAllPane ? 0 : 1)}`;
            }
          }
        }
      }

      // 重複サフィックス付与
      if (layerName !== 'すべて') {
        const count = layerNameCounts.get(layerName) || 0;
        const baseName = layerName;
        if (count > 0) {
          layerName = `${baseName}(${count + 1})`;
        }
        layerNameCounts.set(baseName, count + 1);
      }

      const mark = tMark(pane.markType);

      const addRows = (fields: any[], role: string) => {
        fields.forEach(f => {
          const clean = (n: string) => {
            let inner = n;
            const bracketMatches = [...n.matchAll(/\[([^\]]+)\]/g)];
            if (bracketMatches.length > 0) inner = bracketMatches[bracketMatches.length - 1][1];
            const pts = inner.split(':').filter(p => !/^\d+$/.test(p));
            const typeIds = ['nk', 'qk', 'ok', 'ok2', 'ni', 'oi'];
            const aggFns = ['sum', 'avg', 'min', 'max', 'count', 'cnt', 'cntd', 'attr', 'median', 'stdev', 'var', 'collect'];
            const filtered = pts.filter(p => !typeIds.includes(p.toLowerCase()) && !aggFns.includes(p.toLowerCase()));
            return filtered[filtered.length - 1] || pts[pts.length - 1] || inner;
          };

          const cleanId = clean(f.name);
          let meta = fieldMap.get(cleanId);
          if (!meta) {
            for (const [k, v] of fieldMap.entries()) {
              if (k.toLowerCase() === cleanId.toLowerCase()) { meta = v; break; }
            }
          }

          let displayName = meta?.caption || cleanId;
          if (displayName.startsWith('[') && displayName.endsWith(']')) {
            displayName = displayName.substring(1, displayName.length - 1);
          }

          const isSum = /\bsum:/i.test(f.name);
          const isAvg = /\bavg:/i.test(f.name);
          const isMin = /\bmin:/i.test(f.name);
          const isMax = /\bmax:/i.test(f.name);
          const isCount = (/\bcnt:|\bcntd:/i.test(f.name));
          const isAttr = /\battr:/i.test(f.name);
          const isCollect = (/\bcollect:|\bspatial:/i.test(f.name) || meta?.dataType === 'spatial');

          let agg = 'なし';
          if (isSum) agg = '合計';
          else if (isAvg) agg = '平均';
          else if (isMin) agg = '最小';
          else if (isMax) agg = '最大';
          else if (isCount) agg = 'カウント';
          else if (isAttr) agg = '属性';
          else if (isCollect) agg = '収集';

          let formattedName = displayName;
          if (!formattedName.startsWith('[') && !/^\d+$/.test(formattedName) && !formattedName.includes('(')) {
            formattedName = `[${formattedName}]`;
          }
          rows.push([layerName, mark, role, agg, formattedName]);
        });
      };

      addRows(pane.encodings.color, '色');
      addRows(pane.encodings.size, 'サイズ');
      addRows(pane.encodings.label, 'ラベル');
      addRows(pane.encodings.detail, '詳細');
      addRows(pane.encodings.tooltip, 'ツールヒント');
    });

    if (rows.length <= 1) return; // ヘッダーのみならスキップ

    const sheetName = (ws.caption || ws.name).slice(0, 31);
    const detailSheet = XLSX.utils.aoa_to_sheet(rows);
    detailSheet['!cols'] = [{ wch: 30 }, { wch: 18 }, { wch: 14 }, { wch: 15 }, { wch: 35 }];
    XLSX.utils.book_append_sheet(wb, detailSheet, sheetName);
  });

  XLSX.writeFile(wb, `${workbookName}_解析結果.xlsx`);
}
