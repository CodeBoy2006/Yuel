export function createPdfSmokeFixture(): Buffer {
  const firstPageContent = [
    'BT',
    '/F1 24 Tf',
    '72 720 Td',
    '(Yuel PDF Reader Smoke Test) Tj',
    '0 -42 Td',
    '/F1 14 Tf',
    '(Local PDFium WASM and Worker rendering) Tj',
    'ET',
    '',
  ].join('\n');
  const secondPageContent = [
    'BT',
    '/F1 24 Tf',
    '72 720 Td',
    '(Yuel PDF Reader Page Two) Tj',
    '0 -42 Td',
    '/F1 14 Tf',
    '(Thumbnail navigation reaches this page) Tj',
    'ET',
    '',
  ].join('\n');

  return createPdfFixture([firstPageContent, secondPageContent]);
}

export interface PdfStressFixture {
  buffer: Buffer;
  expectedWords: number;
  linesPerPage: number;
  pageCount: number;
}

export interface PdfStressFixtureOptions {
  linesPerPage?: number;
  pageCount?: number;
}

export function createPdfStressFixture({
  linesPerPage = 6,
  pageCount = 160,
}: PdfStressFixtureOptions = {}): PdfStressFixture {
  assertIntegerInRange(pageCount, 1, 1_000, 'PDF stress page count');
  assertIntegerInRange(linesPerPage, 1, 20, 'PDF stress lines per page');

  let expectedWords = 0;
  const pageContents = Array.from({ length: pageCount }, (_, pageIndex) => {
    const lines = Array.from({ length: linesPerPage }, (_, lineIndex) => {
      const text = [
        'Yuel PDF stress page',
        String(pageIndex + 1),
        'line',
        String(lineIndex + 1),
        'validates bounded virtual rendering and sequential analytics extraction',
        'while preserving stable local reading measurements.',
      ].join(' ');
      expectedWords += countFixtureWords(text);
      return text;
    });

    return [
      'BT',
      '/F1 11 Tf',
      '72 720 Td',
      ...lines.flatMap((line, lineIndex) => [
        ...(lineIndex > 0 ? ['0 -24 Td'] : []),
        `(${escapePdfString(line)}) Tj`,
      ]),
      'ET',
      '',
    ].join('\n');
  });

  return {
    buffer: createPdfFixture(pageContents),
    expectedWords,
    linesPerPage,
    pageCount,
  };
}

function createPdfFixture(pageContents: string[]): Buffer {
  const pageObjectIds = pageContents.map((_, index) => index + 3);
  const fontObjectId = pageContents.length + 3;
  const contentObjectIds = pageContents.map(
    (_, index) => fontObjectId + index + 1,
  );
  const pageReferences = pageObjectIds
    .map((objectId) => `${objectId} 0 R`)
    .join(' ');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    `<< /Type /Pages /Kids [${pageReferences}] /Count ${pageContents.length} >>`,
    ...pageObjectIds.map((_, index) => [
      '<< /Type /Page',
      '   /Parent 2 0 R',
      '   /MediaBox [0 0 612 792]',
      `   /Resources << /Font << /F1 ${fontObjectId} 0 R >> >>`,
      `   /Contents ${contentObjectIds[index]} 0 R`,
      '>>',
    ].join('\n')),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    ...pageContents.map((content) =>
      `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}endstream`),
  ];

  let pdf = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
  const offsets = [0];

  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(pdf, 'binary'));
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = Buffer.byteLength(pdf, 'binary');
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  pdf += offsets
    .slice(1)
    .map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`)
    .join('');
  pdf += [
    'trailer',
    `<< /Size ${objects.length + 1} /Root 1 0 R >>`,
    'startxref',
    String(xrefOffset),
    '%%EOF',
    '',
  ].join('\n');

  return Buffer.from(pdf, 'binary');
}

function escapePdfString(text: string): string {
  return text
    .replaceAll('\\', '\\\\')
    .replaceAll('(', '\\(')
    .replaceAll(')', '\\)');
}

function countFixtureWords(text: string): number {
  return text.match(/[A-Za-z]+(?:'[A-Za-z]+)?|\d+/g)?.length ?? 0;
}

function assertIntegerInRange(
  value: number,
  minimum: number,
  maximum: number,
  label: string,
): void {
  if (!Number.isInteger(value) || value < minimum || value > maximum) {
    throw new RangeError(`${label} must be an integer from ${minimum} to ${maximum}`);
  }
}
