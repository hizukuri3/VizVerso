import { useState } from 'react';
import DragDropZone from './components/DragDropZone';
import Sidebar from './components/Sidebar';
import DetailView from './components/DetailView';
import Breadcrumbs from './components/Breadcrumbs';
import { parseWorkbookAsync } from './utils/workerManager';
import type { TableauDocument } from './types/tableau';
import { FileUp, Search, Download, AlertCircle, Info } from 'lucide-react';
import { exportToExcel } from './utils/excelExporter';
import { AboutModal } from './components/AboutModal';

type SelectionType = 'dashboard' | 'worksheet' | 'datasource';

export default function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documentData, setDocumentData] = useState<TableauDocument | null>(null);
  const [isAboutOpen, setIsAboutOpen] = useState(false);
  
  // ナビゲーション状態
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedType, setSelectedType] = useState<SelectionType | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('tableau_analysis');

  const handleFileDrop = async (file: File) => {
    setLoading(true);
    setError(null);
    setSelectedId(null);
    setSelectedType(null);

    try {
      const parsedDoc = await parseWorkbookAsync(file);
      setDocumentData(parsedDoc);
      setUploadedFileName(file.name.replace(/\.(twbx?|twb)$/i, ''));
      // 最初の一つをデフォルトで選択（もしあれば）
      if (parsedDoc.dashboards.length > 0) {
        setSelectedId(parsedDoc.dashboards[0].name);
        setSelectedType('dashboard');
      } else if (parsedDoc.worksheets.length > 0) {
        setSelectedId(parsedDoc.worksheets[0].name);
        setSelectedType('worksheet');
      }
    } catch (err: any) {
      setError(err.message || 'ファイルの解析中にエラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  const handleSelect = (type: SelectionType, id: string) => {
    setSelectedType(type);
    setSelectedId(id);
  };

  const handleReset = () => {
    setSelectedId(null);
    setSelectedType(null);
  };

  return (
    <div className="h-screen flex flex-col bg-slate-50 font-sans text-slate-800 overflow-hidden">
      {/* グローバルヘッダー */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-50 flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center text-white font-black text-xl shadow-lg shadow-blue-200">
            V
          </div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight">
            Verso-viz
          </h1>
        </div>

        {documentData && (
        <div className="flex items-center gap-4">
            <div className="hidden md:flex items-center px-3 py-1.5 bg-slate-100 rounded-full border border-slate-200 gap-2 text-xs font-semibold text-slate-500">
              <Search size={14} />
              <span>{documentData.worksheets.length} シート</span>
            </div>
            <button
              onClick={() => exportToExcel(documentData, uploadedFileName)}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-100"
            >
              <Download size={14} />
              <span>Excel 出力</span>
            </button>
            <button
              onClick={() => setDocumentData(null)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-slate-200"
            >
              <FileUp size={14} />
              <span>新規アップロード</span>
            </button>
          </div>
        )}
      </header>

      {!documentData && !loading && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-white to-white">
          <div className="max-w-3xl w-full text-center animate-in fade-in zoom-in duration-700">
            <h2 className="text-5xl font-black text-slate-900 mb-6 tracking-tight">
              Tableau の構造を<span className="text-blue-600 italic">一瞬で</span>解き明かす。
            </h2>
            <p className="text-slate-500 mb-12 text-lg font-medium leading-relaxed">
              .twbx ファイルをドロップするだけで、ダッシュボードの構成や計算フィールドの依存関係を<br/>プロフェッショナルな視点から可視化します。
            </p>
            <div className="max-w-xl mx-auto">
              <DragDropZone onFileDrop={handleFileDrop} />
            </div>
            
            <div className="mt-16 grid grid-cols-3 gap-8 text-left">
              {[
                { icon: <AlertCircle className="text-blue-500"/>, title: "安全な解析", desc: "データは一切サーバーに送信されません" },
                { icon: <Search className="text-emerald-500"/>, title: "詳細な可視化", desc: "計算式やマークの設定まで網羅" },
                { icon: <FileUp className="text-amber-500"/>, title: "高速動作", desc: "Web Worker を活用した並列処理" }
              ].map((item, i) => (
                <div key={i} className="p-4">
                  <div className="mb-2">{item.icon}</div>
                  <h4 className="font-bold text-slate-800">{item.title}</h4>
                  <p className="text-xs text-slate-400 mt-1">{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </main>
      )}

      {loading && (
        <main className="flex-1 flex flex-col items-center justify-center bg-white">
          <div className="relative">
            <div className="w-20 h-20 border-4 border-slate-100 rounded-full"></div>
            <div className="absolute top-0 w-20 h-20 border-4 border-blue-600 rounded-full border-t-transparent animate-spin"></div>
          </div>
          <p className="mt-6 text-slate-400 font-bold tracking-widest uppercase text-xs animate-pulse">ワークブックを解析中...</p>
        </main>
      )}

      {error && (
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="bg-red-50 border border-red-100 p-8 rounded-3xl max-w-md w-full text-center shadow-xl shadow-red-100/50">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-red-900 mb-2">エラーが発生しました</h3>
            <p className="text-red-700 text-sm mb-6 leading-relaxed">{error}</p>
            <button 
              onClick={() => setError(null)} 
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all"
            >
              再試行
            </button>
          </div>
        </main>
      )}

      {documentData && !loading && (
        <main className="flex-1 flex overflow-hidden">
          {/* マスター: サイドバー */}
          <Sidebar 
            doc={documentData} 
            selectedId={selectedId} 
            onSelect={handleSelect} 
          />
          
          {/* ディテール: メインエリア */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
            {/* 上部ナビゲーションエリア */}
            <div className="px-10 pt-8">
              <Breadcrumbs 
                dashboardName={selectedType === 'dashboard' ? selectedId! : (selectedType === 'worksheet' ? documentData.dashboards.find(d => d.worksheets.includes(selectedId!))?.name : undefined)}
                worksheetName={selectedType === 'worksheet' ? selectedId! : undefined}
                onReset={handleReset}
              />
            </div>

            {/* 詳細コンテンツ */}
            <DetailView 
              doc={documentData} 
              selectedId={selectedId} 
              selectedType={selectedType} 
              onNavigate={handleSelect}
            />
          </div>
        </main>
      )}

      {/* About アクセスボタン (右下) */}
      <button
        onClick={() => setIsAboutOpen(true)}
        className="fixed bottom-6 right-6 p-3 bg-white border border-slate-200 text-slate-300 hover:text-slate-600 hover:border-slate-300 hover:shadow-lg transition-all rounded-full z-40 group"
        title="About Verso-viz"
      >
        <Info size={18} />
      </button>

      {/* モーダル */}
      <AboutModal 
        isOpen={isAboutOpen} 
        onClose={() => setIsAboutOpen(false)} 
      />
    </div>
  );
}
