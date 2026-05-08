import type { TableauDocument } from '../types/tableau';
import TableauWorker from '../workers/tableauParser.worker?worker';

/**
 * Web Workerを利用してメインスレッドをブロックせずに.twbxファイルをパースする。
 * @param file アップロードされた.twbxファイル
 * @returns パースされた設計情報
 */
export function parseWorkbookAsync(file: File): Promise<TableauDocument> {
  return new Promise((resolve, reject) => {
    const worker = new TableauWorker();

    worker.onmessage = (e) => {
      if (e.data.success) {
        resolve(e.data.document);
      } else {
        reject(new Error(e.data.error));
      }
      worker.terminate();
    };

    worker.onerror = (err) => {
      reject(err);
      worker.terminate();
    };

    worker.postMessage({ file });
  });
}
