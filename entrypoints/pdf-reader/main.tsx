import pdfiumWasmAssetUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import { createRoot } from 'react-dom/client';

import { resolvePdfiumWasmUrl } from '../../src/pdf/engine/wasm';
import { PDFReaderApp } from './App';
import './style.css';

const wasmUrl = resolvePdfiumWasmUrl(pdfiumWasmAssetUrl, window.location.href);

// EmbedPDF's engine hook is not Strict Mode-safe; duplicate effects race worker teardown.
createRoot(document.getElementById('root')!).render(<PDFReaderApp wasmUrl={wasmUrl} />);
