export const STARTER_CONTENT_SCRIPT_MATCHES = [
  'https://developer.mozilla.org/*',
  'https://github.com/*',
  'https://*.github.com/*',
  'https://medium.com/*',
  'https://*.medium.com/*',
  'https://en.wikipedia.org/*',
  'https://arxiv.org/*',
] as const;

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
  return (
    hostname === 'developer.mozilla.org' ||
    hostname === 'github.com' ||
    hostname.endsWith('.github.com') ||
    hostname === 'medium.com' ||
    hostname.endsWith('.medium.com') ||
    hostname === 'en.wikipedia.org' ||
    hostname === 'arxiv.org'
  );
}
