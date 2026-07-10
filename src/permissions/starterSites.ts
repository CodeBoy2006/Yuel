const STARTER_SITES = [
  { label: 'MDN', host: 'developer.mozilla.org', includeSubdomains: false },
  { label: 'GitHub', host: 'github.com', includeSubdomains: true },
  { label: 'Medium', host: 'medium.com', includeSubdomains: true },
  { label: 'Wikipedia', host: 'en.wikipedia.org', includeSubdomains: false },
  { label: 'arXiv', host: 'arxiv.org', includeSubdomains: false },
] as const;

export const STARTER_SITE_LABELS = STARTER_SITES.map((site) => site.label);
export const STARTER_CONTENT_SCRIPT_MATCHES = STARTER_SITES.flatMap((site) => [
  `https://${site.host}/*`,
  ...(site.includeSubdomains ? [`https://*.${site.host}/*`] : []),
]);

export function isStarterSiteUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'https:') {
      return false;
    }

    return isStarterSiteHost(parsed.hostname);
  } catch {
    return false;
  }
}

function isStarterSiteHost(hostname: string): boolean {
  return STARTER_SITES.some(
    (site) => hostname === site.host || (site.includeSubdomains && hostname.endsWith(`.${site.host}`)),
  );
}
