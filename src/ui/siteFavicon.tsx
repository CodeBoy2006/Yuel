import { Globe2 } from 'lucide-react';
import { useState } from 'react';

export type WebsiteFaviconUrlResolver = (domain: string) => string | undefined;

export function SiteFavicon({
  className = 'record-row__favicon',
  domain,
  resolveUrl,
}: {
  className?: string;
  domain: string;
  resolveUrl: WebsiteFaviconUrlResolver;
}) {
  const faviconUrl = resolveUrl(domain);
  const [failedUrl, setFailedUrl] = useState<string>();
  const showImage = faviconUrl !== undefined && faviconUrl !== failedUrl;

  return (
    <span className={className} aria-hidden="true">
      {showImage ? (
        <img
          src={faviconUrl}
          alt=""
          width="16"
          height="16"
          onError={() => setFailedUrl(faviconUrl)}
        />
      ) : (
        <Globe2 />
      )}
    </span>
  );
}

export function getWebsiteFaviconUrl(domain: string): string | undefined {
  if (typeof browser === 'undefined' || !browser.runtime?.getURL) return undefined;

  // Chrome exposes favicons through a virtual extension path that is not part of WXT's generated PublicPath union.
  const getRuntimeUrl = browser.runtime.getURL as unknown as (path: string) => string;
  return createWebsiteFaviconUrl(domain, getRuntimeUrl);
}

export function createWebsiteFaviconUrl(
  domain: string,
  getRuntimeUrl: (path: string) => string,
): string | undefined {
  const normalizedDomain = domain.trim().toLowerCase();
  if (!normalizedDomain || normalizedDomain === 'unknown') return undefined;

  try {
    const pageUrl = new URL(`https://${normalizedDomain}/`);
    if (pageUrl.hostname.toLowerCase() !== normalizedDomain) return undefined;

    const faviconUrl = new URL(getRuntimeUrl('/_favicon/'));
    faviconUrl.searchParams.set('pageUrl', pageUrl.toString());
    faviconUrl.searchParams.set('size', '32');
    return faviconUrl.toString();
  } catch {
    return undefined;
  }
}
