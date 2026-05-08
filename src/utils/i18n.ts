export const translations = {
  ja: {
    navigator: 'ナビゲーター',
    dashboards: 'ダッシュボード',
    sheets: 'シート',
    datasources: 'データソース',
    parameters: 'パラメーター',
    columns: '列',
    rows: '行',
    filters: 'フィルター',
    marks: 'マーク',
    color: '色',
    size: 'サイズ',
    label: 'ラベル',
    detail: '詳細',
    tooltip: 'ツールヒント',
    shape: '形状',
    angle: '角度',
    path: 'パス',
    none: '（なし）',
    worksheet: 'ワークシート',
    dashboard: 'ダッシュボード',
    datasource: 'データソース',
    physicalName: '物理名',
    formula: '計算式',
    formula_decoded: '整形済み数式',
    search: '検索...',
    upload_hint: 'Tableau ワークブック (.twbx, .twb) をドラッグ＆ドロップ',
    processing: '解析中...',
    empty_state: '表示するデータがありません。ファイルをアップロードしてください。',
    sum: '合計',
    avg: '平均',
    count: 'カウント',
    mark_automatic: '自動',
    mark_line: '線',
    mark_bar: '棒',
    mark_area: 'エリア',
    mark_square: '四角',
    mark_circle: '円',
    mark_shape: '形状',
    mark_text: 'テキスト',
    mark_map: 'マップ',
    mark_pie: '円グラフ',
    mark_gantt: 'ガント チャート',
    mark_multipolygon: '多角形',
    mark_polygon: '多角形',
    mark_density: '密度',
  },
  en: {
    navigator: 'Navigator',
    dashboards: 'Dashboards',
    sheets: 'Sheets',
    datasources: 'Data Sources',
    parameters: 'Parameters',
    columns: 'Columns',
    rows: 'Rows',
    filters: 'Filters',
    marks: 'Marks',
    color: 'Color',
    size: 'Size',
    label: 'Label',
    detail: 'Detail',
    tooltip: 'Tooltip',
    shape: 'Shape',
    angle: 'Angle',
    path: 'Path',
    none: '(None)',
    worksheet: 'Worksheet',
    dashboard: 'Dashboard',
    datasource: 'Data Source',
    physicalName: 'Physical Name',
    formula: 'Formula',
    formula_decoded: 'Formatted Formula',
    search: 'Search...',
    upload_hint: 'Drag & drop Tableau workbook (.twbx, .twb)',
    processing: 'Processing...',
    empty_state: 'No data to display. Please upload a file.',
    sum: 'SUM',
    avg: 'AVG',
    count: 'COUNT',
    mark_automatic: 'Automatic',
    mark_line: 'Line',
    mark_bar: 'Bar',
    mark_area: 'Area',
    mark_square: 'Square',
    mark_circle: 'Circle',
    mark_shape: 'Shape',
    mark_text: 'Text',
    mark_map: 'Map',
    mark_pie: 'Pie',
    mark_gantt: 'Gantt Bar',
    mark_multipolygon: 'Polygon',
    mark_polygon: 'Polygon',
    mark_density: 'Density',
  }
};

export type Language = keyof typeof translations;

let currentLang: Language = 'ja';

export const t = (key: keyof typeof translations['ja']) => {
  return translations[currentLang][key] || key;
};

export const setLanguage = (lang: Language) => {
  currentLang = lang;
};

/** マークタイプ（XML内部キー）を表示名に変換 */
export const tMark = (rawMarkClass: string): string => {
  if (!rawMarkClass || rawMarkClass.toLowerCase() === 'automatic') {
    return translations[currentLang].mark_automatic;
  }
  const key = `mark_${rawMarkClass.toLowerCase()}` as keyof typeof translations['ja'];
  return translations[currentLang][key] || rawMarkClass;
};
