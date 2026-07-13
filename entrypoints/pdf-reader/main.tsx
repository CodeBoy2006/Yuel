import pdfiumWasmAssetUrl from '@embedpdf/pdfium/pdfium.wasm?url';
import React from 'react';
import { createRoot } from 'react-dom/client';

import { resolvePdfiumWasmUrl } from '../../src/pdf/engine/wasm';
import { PDFReaderApp } from './App';
import './style.css';

const wasmUrl = resolvePdfiumWasmUrl(pdfiumWasmAssetUrl, window.location.href);

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <PDFReaderApp wasmUrl={wasmUrl} />
  </React.StrictMode>,
);
