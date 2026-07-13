import { EmbedPDF } from '@embedpdf/core/react';
import { usePdfiumEngine } from '@embedpdf/engines/react';
import { AlertTriangle, LoaderCircle } from 'lucide-react';

import { PDF_READER_PLUGINS } from '../engine/plugins';
import { PdfReaderWorkspace } from './PdfReaderWorkspace';

export function PdfReaderApp({ wasmUrl }: { wasmUrl: string }) {
  const { engine, error, isLoading } = usePdfiumEngine({
    wasmUrl,
    worker: true,
    encoderPoolSize: 2,
    fontFallback: null,
  });

  if (error) {
    return (
      <div className="pdf-reader-engine-state yuel-app" role="alert">
        <AlertTriangle aria-hidden="true" />
        <h1>PDF 引擎启动失败</h1>
        <p>{error.message || '无法加载本地 PDFium WASM。'}</p>
      </div>
    );
  }

  if (isLoading || !engine) {
    return (
      <div className="pdf-reader-engine-state yuel-app" role="status" aria-live="polite">
        <LoaderCircle className="is-spinning" aria-hidden="true" />
        <h1>正在启动 PDF 引擎</h1>
        <p>加载扩展内置的 PDFium WASM 与渲染 Worker。</p>
      </div>
    );
  }

  return (
    <EmbedPDF engine={engine} plugins={PDF_READER_PLUGINS}>
      {({ activeDocument, activeDocumentId, pluginsReady }) => (
        <PdfReaderWorkspace
          activeDocument={activeDocument}
          activeDocumentId={activeDocumentId}
          engine={engine}
          pluginsReady={pluginsReady}
        />
      )}
    </EmbedPDF>
  );
}
