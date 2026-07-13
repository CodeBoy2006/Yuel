export function createPdfSmokeFixture(): Buffer {
  const contentStream = [
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

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    [
      '<< /Type /Page',
      '   /Parent 2 0 R',
      '   /MediaBox [0 0 612 792]',
      '   /Resources << /Font << /F1 4 0 R >> >>',
      '   /Contents 5 0 R',
      '>>',
    ].join('\n'),
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${Buffer.byteLength(contentStream, 'ascii')} >>\nstream\n${contentStream}endstream`,
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
