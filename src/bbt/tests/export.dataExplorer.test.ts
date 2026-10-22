import { dataExplorerPrompt } from '../export';

jest.mock(
  'obsidian',
  () => ({
    moment: require('moment'),
    normalizePath: (p: string) => p.replace(/\\/g, '/'),
    Notice: jest.fn(),
    htmlToMarkdown: (html: string) => html,
  }),
  { virtual: true }
);

jest.mock('../../helpers', () => ({
  doesEXEExist: () => false,
  getVaultRoot: () => '/vault',
}));

jest.mock('../cayw', () => ({
  getCiteKeys: async () => [{ key: 'smith2020', library: 1 }],
  getCiteKeyFromAny: (item: any) =>
    item.citekey || item.citationKey
      ? { key: item.citekey || item.citationKey, library: item.libraryID }
      : null,
}));

jest.mock('../exportNotes', () => ({
  processZoteroAnnotationNotes: async (_key: string, note: string) => note,
}));

jest.mock('../extractAnnotations', () => ({
  extractAnnotations: jest.fn(),
}));

jest.mock('../basicTemplates/applyBasicTemplates', () => ({
  applyBasicTemplates: async (_source: string, data: any) => data,
}));

const pdfPath = '/zotero/storage/ABCD1234/paper.pdf';

jest.mock('../jsonRPC', () => ({
  getItemJSONFromCiteKeys: async () => [
    {
      citekey: 'smith2020',
      libraryID: 1,
      uri: 'http://zotero.org/users/local/abc/items/ITEM1234',
      attachments: [
        {
          path: '/zotero/storage/ABCD1234/paper.pdf',
          uri: 'http://zotero.org/users/local/abc/items/ABCD1234',
        },
      ],
    },
  ],
  getAttachmentsFromCiteKey: async () => [
    {
      path: '/zotero/storage/ABCD1234/paper.pdf',
      annotations: [
        {
          key: 'ANNOT123',
          annotationType: 'image',
          annotationColor: '#ffd400',
          annotationPageLabel: '11',
          annotationPosition: {
            pageIndex: 9,
            rects: [[43.2, 221.4, 300, 400]],
          },
          annotationImagePath: '/zotero/cache/library/ANNOT123.png',
          dateModified: '2024-01-01T00:00:00Z',
        },
      ],
    },
  ],
  getIssueDateFromCiteKey: async (): Promise<any> => undefined,
  getCollectionFromCiteKey: async (): Promise<any> => undefined,
  getBibFromCiteKey: async (): Promise<any> => undefined,
  getItemJSONFromRelations: async (): Promise<any[]> => [],
}));

describe('dataExplorerPrompt() image annotations (#364)', () => {
  it('uses the base name and output path placeholders in the right fields', async () => {
    const items = await dataExplorerPrompt({
      database: 'Zotero',
      shouldConcat: false,
      exportFormats: [],
      citeFormats: [],
    } as any);

    const attachment = items[0].attachments.find(
      (a: any) => a.path === pdfPath
    );
    const [annotation] = attachment.annotations;

    // Same layout as a real import: `<image base name>-<page>-x<x>-y<y>.<ext>`
    // inside `<image output path>/`.
    expect(annotation.imageBaseName).toBe('base_name-10-x43-y221.png');
    expect(annotation.imageRelativePath).toBe(
      'output_path/base_name-10-x43-y221.png'
    );
    expect(annotation.imagePath).toBe(
      '/vault/output_path/base_name-10-x43-y221.png'
    );
  });
});
