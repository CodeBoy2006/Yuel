export async function createPdfSha256(buffer: ArrayBuffer): Promise<string> {
  const digest = await globalThis.crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function createPdfResourceId(sha256: string): string {
  if (!/^[a-f0-9]{64}$/.test(sha256)) {
    throw new RangeError('PDF resource IDs require a lowercase SHA-256 digest.');
  }
  return `pdf_${sha256}`;
}
