import { renderCiteTemplate } from '../export';

jest.mock(
  'obsidian',
  () => ({
    moment: require('moment'),
    normalizePath: (p: string) => p,
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

jest.mock('../jsonRPC', () => ({
  getItemJSONFromCiteKeys: async () => [
    {
      citekey: 'smith2020',
      libraryID: 1,
      title: 'A Title',
      uri: 'http://zotero.org/users/local/abc/items/ITEM1234',
      creators: [
        { creatorType: 'author', firstName: 'Ada', lastName: 'Smith' },
        { creatorType: 'author', firstName: 'Bo', lastName: 'Jones' },
        { creatorType: 'editor', name: 'Example Org' },
      ],
      tags: [{ tag: 'reading' }, { tag: 'deep work' }],
      attachments: [],
    },
  ],
  getIssueDateFromCiteKey: async (): Promise<any> => undefined,
  getCollectionFromCiteKey: async (): Promise<any> => undefined,
  getBibFromCiteKey: async (): Promise<any> => undefined,
  getItemJSONFromRelations: async (): Promise<any[]> => [],
}));

describe('renderCiteTemplate() template data (#454)', () => {
  it('provides the derived fields shown in the Data Explorer', async () => {
    const output = await renderCiteTemplate({
      database: { database: 'Zotero' },
      format: {
        name: 'cite',
        format: 'template',
        template: '{{authors}} | {{editors}} | {{allTags}} | {{hashTags}}',
      },
    } as any);

    expect(output).toBe(
      'Ada Smith, Bo Jones | Example Org | reading, deep work | #reading, #deep-work'
    );
  });

  it('still provides the raw item data', async () => {
    const output = await renderCiteTemplate({
      database: { database: 'Zotero' },
      format: {
        name: 'cite',
        format: 'template',
        template: '[@{{citekey}}] {{title}} {{creators[0].lastName}}',
      },
    } as any);

    expect(output).toBe('[@smith2020] A Title Smith');
  });
});
