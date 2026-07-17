const SAFE_PDF_LINK_PROTOCOLS = new Set(['http:', 'https:']);

export function getSafePdfExternalUrl(
  uri: string,
  documentUrl?: string,
): string | undefined {
  const value = uri.trim();
  if (!value) return undefined;

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    const baseValue = documentUrl?.trim();
    if (!baseValue) return undefined;

    try {
      const baseUrl = new URL(baseValue);
      if (!SAFE_PDF_LINK_PROTOCOLS.has(baseUrl.protocol)) return undefined;
      url = new URL(value, baseUrl);
    } catch {
      return undefined;
    }
  }

  return SAFE_PDF_LINK_PROTOCOLS.has(url.protocol)
    ? url.toString()
    : undefined;
}

export function openSafePdfExternalLink(
  uri: string,
  documentUrl?: string,
): boolean {
  const url = getSafePdfExternalUrl(uri, documentUrl);
  if (!url) return false;

  window.open(url, '_blank', 'noopener,noreferrer');
  return true;
}
