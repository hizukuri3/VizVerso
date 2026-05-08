import { useState, useRef, type DragEvent, type KeyboardEvent } from 'react';
import { UploadCloud } from 'lucide-react';

interface DragDropZoneProps {
  onFileDrop: (file: File) => void;
}

export default function DragDropZone({ onFileDrop }: DragDropZoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const processFiles = (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    
    // 拡張子チェック
    if (file.name.endsWith('.twbx') || file.name.endsWith('.twb')) {
      onFileDrop(file);
    } else {
      console.warn('Unsupported file type');
    }
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    processFiles(e.dataTransfer.files);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      inputRef.current?.click();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      aria-label="アップロード"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onKeyDown={handleKeyDown}
      className={`
        relative w-full max-w-2xl mx-auto p-12 mt-10
        border-2 border-dashed rounded-2xl
        transition-all duration-300 ease-in-out cursor-pointer
        backdrop-blur-sm
        flex flex-col items-center justify-center gap-4
        ${
          isDragging 
            ? 'border-blue-500 bg-blue-50/50 shadow-[0_0_20px_rgba(59,130,246,0.2)]' 
            : 'border-slate-300 bg-white/60 hover:bg-white/80 hover:border-blue-400 hover:shadow-md'
        }
      `}
    >
      <input
        type="file"
        ref={inputRef}
        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        accept=".twbx,.twb"
        onChange={(e) => processFiles(e.target.files)}
        data-testid="file-input"
        aria-hidden="true"
      />
      
      <div className={`p-4 rounded-full transition-colors duration-300 ${isDragging ? 'bg-blue-100' : 'bg-slate-100'}`}>
        <UploadCloud className={`w-10 h-10 transition-colors duration-300 ${isDragging ? 'text-blue-600' : 'text-slate-500'}`} />
      </div>
      
      <div className="text-center">
        <h3 className="text-xl font-semibold text-slate-700 mb-2">
          Tableauワークブックをドロップ
        </h3>
        <p className="text-sm text-slate-500">
          またはクリックしてファイルを選択 (.twbx, .twb)
        </p>
      </div>
    </div>
  );
}
