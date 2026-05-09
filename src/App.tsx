import { useState, useEffect, useRef } from 'react'
import DragDropZone from './components/DragDropZone'
import Sidebar from './components/Sidebar'
import DetailView from './components/DetailView'
import Breadcrumbs from './components/Breadcrumbs'
import { parseWorkbookAsync } from './utils/workerManager'
import type { TableauDocument } from './types/tableau'
import { FileUp, Search, Download, AlertCircle, Info, X } from 'lucide-react'
import { exportToExcel } from './utils/excelExporter'
import { AboutModal } from './components/AboutModal'
import { t, setLanguage, getLanguage, type Language } from './utils/i18n'
import { useSearch } from './hooks/useSearch'
import { SearchResultsList } from './components/SearchResultsList'
import { SideDrawer } from './components/SideDrawer'

type SelectionType = 'dashboard' | 'worksheet' | 'datasource'

export default function App() {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [documentData, setDocumentData] = useState<TableauDocument | null>(null)
  const [isAboutOpen, setIsAboutOpen] = useState(false)
  const [lang, setLang] = useState<Language>(getLanguage())

  // ナビゲーション状態
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedType, setSelectedType] = useState<SelectionType | null>(null)
  const [uploadedFileName, setUploadedFileName] =
    useState<string>('tableau_analysis')

  const clearUrl = () => {
    window.history.pushState({}, '', window.location.pathname)
  }

  const handleFileDrop = async (file: File) => {
    setLoading(true)
    setError(null)
    setSelectedId(null)
    setSelectedType(null)

    try {
      const parsedDoc = await parseWorkbookAsync(file)
      setDocumentData(parsedDoc)
      setUploadedFileName(file.name.replace(/\.(twbx?|twb)$/i, ''))
      // 最初の一つをデフォルトで選択（もしあれば）
      if (parsedDoc.dashboards.length > 0) {
        setSelectedId(parsedDoc.dashboards[0].name)
        setSelectedType('dashboard')
      } else if (parsedDoc.worksheets.length > 0) {
        setSelectedId(parsedDoc.worksheets[0].name)
        setSelectedType('worksheet')
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : t('error.default')
      setError(message)
    } finally {
      setLoading(false)
    }
  }

  const handleSelect = (type: SelectionType, id: string) => {
    setSelectedType(type)
    setSelectedId(id)
  }

  const handleReset = () => {
    setSelectedId(null)
    setSelectedType(null)
    clearUrl()
  }

  const handleNewUpload = () => {
    setDocumentData(null)
    setError(null)
    setSearchQuery('')
    clearUrl()
  }

  const handleLanguageChange = (newLang: Language) => {
    setLanguage(newLang)
    setLang(newLang)
  }

  // ── 検索機能のステートとフック ──
  const [searchQuery, setSearchQuery] = useState('')
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('')
  const [showSearchResults, setShowSearchResults] = useState(false)
  const searchResults = useSearch(documentData, debouncedSearchQuery)
  const searchRef = useRef<HTMLDivElement>(null)

  // 検索クエリのデバウンス
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearchQuery(searchQuery)
    }, 300)
    return () => clearTimeout(timer)
  }, [searchQuery])

  // ── サイドドロワーの状態 ──
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [targetFieldName, setTargetFieldName] = useState<string | null>(null)

  // URL パラメータの監視
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const type = params.get('type') as SelectionType | null
    const id = params.get('id')
    const field = params.get('field')
    const q = params.get('q')

    if (q) setSearchQuery(q)

    if (type && id && documentData) {
      // IDが新しいドキュメント内に存在するか確認
      const exists =
        (type === 'dashboard' &&
          documentData.dashboards.some((d) => d.name === id)) ||
        (type === 'worksheet' &&
          documentData.worksheets.some((w) => w.name === id)) ||
        (type === 'datasource' &&
          documentData.datasources.some((ds) => ds.name === id))

      if (exists) {
        // Defer state updates to avoid React warning during effect
        setTimeout(() => {
          handleSelect(type, id)
          if (field) {
            setTargetFieldName(field)
            setIsDrawerOpen(true)
          }
        }, 0)
      }

      // 一度適用したらURLをクリーンにする（別ファイル読み込み時の干渉防止）
      clearUrl()
    }
  }, [documentData]) // ドキュメントがロードされた時に実行

  const updateUrl = (
    type: SelectionType,
    id: string,
    field?: string,
    q?: string,
  ) => {
    const params = new URLSearchParams()
    params.set('type', type)
    params.set('id', id)
    if (field) params.set('field', field)
    if (q) params.set('q', q)
    window.history.pushState({}, '', `?${params.toString()}`)
  }

  const handleNavigateFromSearch = (
    type: SelectionType,
    id: string,
    field?: string,
  ) => {
    handleSelect(type, id)
    if (field) {
      setTargetFieldName(field)
      setIsDrawerOpen(true)
    } else {
      setIsDrawerOpen(false)
    }
    updateUrl(type, id, field, searchQuery)
  }

  const handleNavigateFieldInDrawer = (fieldName: string) => {
    // フィールドの定義元を探す
    if (!documentData) return

    const parentDs = documentData.datasources.find((ds) =>
      ds.fields.some((f) => f.column === fieldName),
    )
    if (parentDs) {
      handleSelect('datasource', parentDs.name)
      setTargetFieldName(fieldName)
      updateUrl('datasource', parentDs.name, fieldName, searchQuery)
      return
    }

    const parentWs = documentData.worksheets.find((ws) =>
      ws.localFields?.some((f) => f.column === fieldName),
    )
    if (parentWs) {
      handleSelect('worksheet', parentWs.name)
      setTargetFieldName(fieldName)
      updateUrl('worksheet', parentWs.name, fieldName, searchQuery)
    }
  }

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement

      // 検索窓の外側クリック判定（既存）
      if (searchRef.current && !searchRef.current.contains(target)) {
        setShowSearchResults(false)
      }

      // ハイライト（targetFieldName）がある際の外側クリック判定
      if (targetFieldName) {
        const isPill = target.closest('.pill-container')
        const isDrawer = target.closest('.side-drawer')
        const isBackdrop = target.closest('.drawer-backdrop')

        // Pillの外、ドロワーの外、バックドロップの外をクリックした場合は解除
        if (!isPill && !isDrawer && !isBackdrop) {
          setIsDrawerOpen(false)
          setTargetFieldName(null)
          // URLパラメータを更新
          const params = new URLSearchParams(window.location.search)
          params.delete('field')
          window.history.pushState(
            {},
            '',
            params.toString()
              ? `?${params.toString()}`
              : window.location.pathname,
          )
        }
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isDrawerOpen, targetFieldName])

  return (
    <div className="h-screen flex flex-col bg-slate-50 font-sans text-slate-800 overflow-hidden">
      {/* グローバルヘッダー */}
      <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 z-50 flex-shrink-0">
        <button
          onClick={handleNewUpload}
          className="flex items-center gap-2 hover:opacity-70 transition-opacity active:scale-95"
        >
          <img src="/favicon.png" alt="" className="h-8 w-8 object-contain" />
          <span className="text-xl font-black text-slate-800 tracking-tight">
            VizVerso
          </span>
        </button>

        {documentData && (
          <div className="flex-1 max-w-xl mx-8 relative" ref={searchRef}>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Search size={16} className="text-slate-400" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value)
                  setShowSearchResults(true)
                }}
                onFocus={() => setShowSearchResults(true)}
                placeholder={t('search.placeholder')}
                className="block w-full pl-10 pr-10 py-2 border border-slate-200 rounded-2xl bg-slate-50 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600"
                >
                  <X size={16} />
                </button>
              )}
            </div>

            {showSearchResults && searchQuery.trim() && (
              <div className="absolute top-full left-0 right-0 mt-2 bg-white border border-slate-200 rounded-2xl shadow-2xl z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-200">
                <div className="p-3 border-b border-slate-100 bg-slate-50/50 flex items-center justify-between">
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                    {t('search.type_field')} ({searchResults.length})
                  </span>
                </div>
                <SearchResultsList
                  results={searchResults}
                  onNavigate={handleNavigateFromSearch}
                  onClose={() => setShowSearchResults(false)}
                />
              </div>
            )}
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="flex items-center bg-slate-100 p-1 rounded-xl">
            <button
              onClick={() => handleLanguageChange('ja')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                lang === 'ja'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              JA
            </button>
            <button
              onClick={() => handleLanguageChange('en')}
              className={`px-3 py-1.5 rounded-lg text-[10px] font-bold transition-all ${
                lang === 'en'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              EN
            </button>
          </div>

          {documentData && (
            <>
              <button
                onClick={() => exportToExcel(documentData, uploadedFileName)}
                className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-emerald-100"
              >
                <Download size={14} />
                <span>{t('button.excel_export')}</span>
              </button>
              <button
                onClick={handleNewUpload}
                className="flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-slate-200"
              >
                <FileUp size={14} />
                <span>{t('button.new_upload')}</span>
              </button>
            </>
          )}
        </div>
      </header>

      {!documentData && !loading && (
        <main className="flex-1 flex flex-col items-center justify-center p-6 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-blue-50 via-white to-white">
          <div className="max-w-3xl w-full text-center animate-in fade-in zoom-in duration-700">
            <div className="flex items-center justify-center gap-6 mb-10">
              <img
                src="/favicon.png"
                alt=""
                className="h-20 w-20 object-contain"
              />
              <h1 className="text-6xl font-black text-slate-900 tracking-tight">
                {t('app.title')}
              </h1>
            </div>
            <h2 className="text-5xl font-black text-slate-900 mb-6 tracking-tight leading-tight [text-wrap:balance]">
              <span className="inline-block">Tableau ワークブックを解析。</span>
              <span className="inline-block">計算の依存関係を可視化。</span>
            </h2>
            <p className="text-slate-500 mb-12 text-lg font-medium leading-relaxed max-w-2xl mx-auto [text-wrap:balance]">
              <span className="inline-block">
                Tableau ワークブックをドロップするだけで、
              </span>
              <span className="inline-block">
                構成要素や計算式のつながりを即座に解明します。
              </span>
            </p>
            <div className="max-w-xl mx-auto">
              <DragDropZone onFileDrop={handleFileDrop} />
            </div>

            <div className="mt-16 grid grid-cols-3 gap-8 text-center">
              {[
                {
                  icon: <AlertCircle className="text-blue-500" />,
                  title: t('features.safe_analysis.title'),
                  desc: t('features.safe_analysis.desc'),
                },
                {
                  icon: <Search className="text-emerald-500" />,
                  title: t('features.detail_viz.title'),
                  desc: t('features.detail_viz.desc'),
                },
                {
                  icon: <FileUp className="text-amber-500" />,
                  title: t('features.parallel_proc.title'),
                  desc: t('features.parallel_proc.desc'),
                },
              ].map((item, i) => (
                <div key={i} className="p-4 flex flex-col items-center">
                  <div className="mb-3 p-3 bg-white rounded-2xl shadow-sm border border-slate-100">
                    {item.icon}
                  </div>
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
          <p className="mt-6 text-slate-400 font-bold tracking-widest uppercase text-xs animate-pulse">
            {t('status.processing')}
          </p>
        </main>
      )}

      {error && (
        <main className="flex-1 flex flex-col items-center justify-center p-6">
          <div className="bg-red-50 border border-red-100 p-8 rounded-3xl max-w-md w-full text-center shadow-xl shadow-red-100/50">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle size={32} />
            </div>
            <h3 className="text-xl font-bold text-red-900 mb-2">
              {t('error.title')}
            </h3>
            <p className="text-red-700 text-sm mb-6 leading-relaxed">{error}</p>
            <button
              onClick={() => setError(null)}
              className="w-full py-3 bg-red-600 hover:bg-red-700 text-white rounded-xl font-bold transition-all"
            >
              {t('button.retry')}
            </button>
          </div>
        </main>
      )}

      {documentData && !loading && (
        <main className="flex-1 flex overflow-hidden">
          {/* マスター: サイドバー */}
          <Sidebar
            doc={documentData}
            fileName={uploadedFileName}
            selectedId={selectedId}
            onSelect={handleSelect}
          />

          {/* ディテール: メインエリア */}
          <div className="flex-1 flex flex-col overflow-hidden bg-slate-50/50">
            {/* 上部ナビゲーションエリア */}
            <div className="px-10 pt-8">
              <Breadcrumbs
                dashboardName={
                  selectedType === 'dashboard'
                    ? selectedId!
                    : selectedType === 'worksheet'
                      ? documentData.dashboards.find((d) =>
                          d.worksheets.includes(selectedId!),
                        )?.name
                      : undefined
                }
                worksheetName={
                  selectedType === 'worksheet' ? selectedId! : undefined
                }
                onReset={handleReset}
                onNavigateDashboard={(name) => handleSelect('dashboard', name)}
              />
            </div>

            {/* 詳細コンテンツ */}
            <DetailView
              doc={documentData}
              selectedId={selectedId}
              selectedType={selectedType}
              onNavigate={handleSelect}
              activeFieldName={targetFieldName}
              onOpenDrawer={(fieldName) => {
                setTargetFieldName(fieldName)
                setIsDrawerOpen(true)
              }}
            />
          </div>
        </main>
      )}

      {/* About アクセスボタン (右下) */}
      <button
        onClick={() => setIsAboutOpen(true)}
        className="fixed bottom-6 left-6 p-3 bg-white border border-slate-200 text-slate-300 hover:text-slate-600 hover:border-slate-300 hover:shadow-lg transition-all rounded-full z-40 group"
        title="About VizVerso"
      >
        <Info size={18} />
      </button>

      {/* モーダル */}
      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

      {/* サイドドロワー (計算フィールド詳細) */}
      {documentData && (
        <SideDrawer
          isOpen={isDrawerOpen}
          onClose={() => setIsDrawerOpen(false)}
          doc={documentData}
          targetFieldName={targetFieldName}
          searchQuery={debouncedSearchQuery}
          onNavigateField={handleNavigateFieldInDrawer}
          onNavigateToSheet={(sheetName) => {
            handleSelect('worksheet', sheetName)
            setIsDrawerOpen(false)
          }}
        />
      )}
    </div>
  )
}
