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

  return createPdfFixture(
    [firstPageContent, secondPageContent],
    [
      {
        title: 'Introduction',
        pageIndex: 0,
        children: [{
          title: 'Local rendering',
          pageIndex: 0,
        }],
      },
      {
        title: 'Page two',
        pageIndex: 1,
      },
    ],
    [{
      pageIndex: 0,
      targetPageIndex: 1,
      rect: [70, 704, 410, 744],
    }],
  );
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

interface PdfFixtureOutlineNode {
  title: string;
  pageIndex: number;
  children?: PdfFixtureOutlineNode[];
}

interface PdfFixtureLink {
  pageIndex: number;
  targetPageIndex: number;
  rect: [number, number, number, number];
}

interface AssignedPdfFixtureOutlineNode extends PdfFixtureOutlineNode {
  objectId: number;
  parentObjectId: number;
  children: AssignedPdfFixtureOutlineNode[];
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

function createPdfFixture(
  pageContents: string[],
  outline: PdfFixtureOutlineNode[] = [],
  links: PdfFixtureLink[] = [],
): Buffer {
  const pageObjectIds = pageContents.map((_, index) => index + 3);
  const fontObjectId = pageContents.length + 3;
  const contentObjectIds = pageContents.map(
    (_, index) => fontObjectId + index + 1,
  );
  let nextObjectId = contentObjectIds.at(-1)! + 1;
  const assignedLinks = links.map((link) => ({
    ...link,
    objectId: nextObjectId++,
  }));
  const outlineRootObjectId = outline.length > 0
    ? nextObjectId++
    : undefined;
  const assignOutlineNodes = (
    nodes: PdfFixtureOutlineNode[],
    parentObjectId: number,
  ): AssignedPdfFixtureOutlineNode[] => nodes.map((node) => {
    assertIntegerInRange(
      node.pageIndex,
      0,
      pageContents.length - 1,
      'PDF outline page index',
    );
    const assigned: AssignedPdfFixtureOutlineNode = {
      ...node,
      objectId: nextObjectId++,
      parentObjectId,
      children: [],
    };
    assigned.children = assignOutlineNodes(
      node.children ?? [],
      assigned.objectId,
    );
    return assigned;
  });
  const assignedOutline = outlineRootObjectId === undefined
    ? []
    : assignOutlineNodes(outline, outlineRootObjectId);
  const pageReferences = pageObjectIds
    .map((objectId) => `${objectId} 0 R`)
    .join(' ');
  const objectsById = new Map<number, string>();

  objectsById.set(1, [
    '<< /Type /Catalog /Pages 2 0 R',
    ...(outlineRootObjectId === undefined
      ? []
      : [`   /Outlines ${outlineRootObjectId} 0 R`, '   /PageMode /UseOutlines']),
    '>>',
  ].join('\n'));
  objectsById.set(
    2,
    `<< /Type /Pages /Kids [${pageReferences}] /Count ${pageContents.length} >>`,
  );
  pageObjectIds.forEach((objectId, index) => {
    const annotationReferences = assignedLinks
      .filter((link) => link.pageIndex === index)
      .map((link) => `${link.objectId} 0 R`)
      .join(' ');
    objectsById.set(objectId, [
      '<< /Type /Page',
      '   /Parent 2 0 R',
      '   /MediaBox [0 0 612 792]',
      `   /Resources << /Font << /F1 ${fontObjectId} 0 R >> >>`,
      `   /Contents ${contentObjectIds[index]} 0 R`,
      ...(annotationReferences ? [`   /Annots [${annotationReferences}]`] : []),
      '>>',
    ].join('\n'));
  });
  objectsById.set(
    fontObjectId,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  );
  pageContents.forEach((content, index) => {
    objectsById.set(
      contentObjectIds[index],
      `<< /Length ${Buffer.byteLength(content, 'ascii')} >>\nstream\n${content}endstream`,
    );
  });
  assignedLinks.forEach((link) => {
    assertIntegerInRange(
      link.pageIndex,
      0,
      pageContents.length - 1,
      'PDF link page index',
    );
    assertIntegerInRange(
      link.targetPageIndex,
      0,
      pageContents.length - 1,
      'PDF link target page index',
    );
    objectsById.set(link.objectId, [
      '<< /Type /Annot',
      '   /Subtype /Link',
      `   /Rect [${link.rect.join(' ')}]`,
      '   /Border [0 0 0]',
      `   /Dest [${pageObjectIds[link.targetPageIndex]} 0 R /Fit]`,
      '>>',
    ].join('\n'));
  });

  if (outlineRootObjectId !== undefined) {
    objectsById.set(outlineRootObjectId, [
      '<< /Type /Outlines',
      `   /First ${assignedOutline[0].objectId} 0 R`,
      `   /Last ${assignedOutline.at(-1)!.objectId} 0 R`,
      `   /Count ${countAssignedOutlineItems(assignedOutline)}`,
      '>>',
    ].join('\n'));
    addAssignedOutlineObjects(
      assignedOutline,
      pageObjectIds,
      objectsById,
    );
  }

  const objectCount = nextObjectId - 1;
  const objects = Array.from({ length: objectCount }, (_, index) => {
    const objectId = index + 1;
    const object = objectsById.get(objectId);
    if (!object) {
      throw new Error(`Missing generated PDF object ${objectId}`);
    }
    return object;
  });

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

function addAssignedOutlineObjects(
  nodes: AssignedPdfFixtureOutlineNode[],
  pageObjectIds: number[],
  objectsById: Map<number, string>,
): void {
  nodes.forEach((node, index) => {
    const previous = nodes[index - 1];
    const next = nodes[index + 1];
    const childCount = countAssignedOutlineItems(node.children);
    objectsById.set(node.objectId, [
      '<<',
      `   /Title (${escapePdfString(node.title)})`,
      `   /Parent ${node.parentObjectId} 0 R`,
      `   /Dest [${pageObjectIds[node.pageIndex]} 0 R /Fit]`,
      ...(previous ? [`   /Prev ${previous.objectId} 0 R`] : []),
      ...(next ? [`   /Next ${next.objectId} 0 R`] : []),
      ...(node.children.length > 0
        ? [
          `   /First ${node.children[0].objectId} 0 R`,
          `   /Last ${node.children.at(-1)!.objectId} 0 R`,
          `   /Count ${childCount}`,
        ]
        : []),
      '>>',
    ].join('\n'));
    addAssignedOutlineObjects(node.children, pageObjectIds, objectsById);
  });
}

function countAssignedOutlineItems(
  nodes: AssignedPdfFixtureOutlineNode[],
): number {
  return nodes.reduce(
    (count, node) => count + 1 + countAssignedOutlineItems(node.children),
    0,
  );
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
