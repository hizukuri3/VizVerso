import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { detectInitialLanguage, setLanguage } from './utils/i18n'

// 初回描画前にブラウザ言語（保存済みの選択があればそれ）から表示言語を決める
setLanguage(detectInitialLanguage())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
