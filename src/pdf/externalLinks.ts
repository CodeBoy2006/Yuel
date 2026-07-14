const SAFE_PDF_LINK_PROTOCOLS = new Set(['http:', 'https:']);

export function getSafePdfExternalUrl(uri: string): string | undefined {
  const value = uri.trim();
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return SAFE_PDF_LINK_PROTOCOLS.has(url.protocol)
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

export function openSafePdfExternalLink(uri: string): boolean {
  const url = getSafePdfExternalUrl(uri);
  if (!url) return false;

  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
