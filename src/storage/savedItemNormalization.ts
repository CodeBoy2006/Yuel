export function normalizeHttpUrl(value: string | undefined): string | undefined {
  const input = value?.trim();
  if (!input) return undefined;

  try {
    const url = new URL(input);
    return url.protocol === 'http:' || url.protocol === 'https:'
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}
