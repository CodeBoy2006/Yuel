export function resolvePdfiumWasmUrl(assetUrl: string, pageUrl: string): string {
  const normalizedAssetUrl = assetUrl.trim();
  if (!normalizedAssetUrl) {
    throw new TypeError('The bundled PDFium WASM asset URL must not be empty.');
  }

  return new URL(normalizedAssetUrl, pageUrl).toString();
}
