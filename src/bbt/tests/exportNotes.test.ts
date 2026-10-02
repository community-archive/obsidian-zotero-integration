import { filesFromNotes } from '../exportNotes';

jest.mock(
  'obsidian',
  () => ({
    Modal: class {},
    Notice: jest.fn(),
    TFile: class {},
    TFolder: class {},
    htmlToMarkdown: (content: string) => content,
    moment: require('moment'),
    normalizePath: (filePath: string) => filePath.replace(/\\/g, '/'),
    request: jest.fn(),
  }),
  { virtual: true }
);

jest.mock('../../helpers', () => ({
  getVaultRoot: jest.fn(() => '/vault'),
}));

jest.mock('../cayw', () => ({
  getCiteKeys: jest.fn(),
}));

jest.mock('../jsonRPC', () => ({
  getAttachmentsFromCiteKey: jest.fn(),
  getNotesFromCiteKeys: jest.fn(),
}));

describe('filesFromNotes()', () => {
  beforeEach(() => {
    global.app = {
      vault: {
        adapter: {
          exists: jest.fn(async () => true),
        },
        create: jest.fn(async (path: string) => ({ path })),
        createFolder: jest.fn(async () => {}),
        getAbstractFileByPath: jest.fn(() => null),
        modify: jest.fn(async () => {}),
      },
    } as any;
  });

  it('creates a note with rendered content', async () => {
    const paths = await filesFromNotes('03 - Artigos', {
      romanQuantumsafeAuthenticationScheme2024: '# Expected title',
    });

    expect(global.app.vault.create).toHaveBeenCalledWith(
      '03 - Artigos/romanQuantumsafeAuthenticationScheme2024.md',
      '# Expected title'
    );
    expect(paths).toEqual([
      '03 - Artigos/romanQuantumsafeAuthenticationScheme2024.md',
    ]);
  });

  it('creates a missing destination folder before the note', async () => {
    (global.app.vault.adapter.exists as jest.Mock).mockResolvedValue(false);

    await filesFromNotes('03 - Artigos', {
      romanQuantumsafeAuthenticationScheme2024: '# Expected title',
    });

    expect(global.app.vault.createFolder).toHaveBeenCalledWith('03 - Artigos');
    expect(global.app.vault.create).toHaveBeenCalled();
  });

  it('updates an existing note with non-empty content', async () => {
    const file = {
      path: '03 - Artigos/romanQuantumsafeAuthenticationScheme2024.md',
    };
    (global.app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue(file);

    const paths = await filesFromNotes('03 - Artigos', {
      romanQuantumsafeAuthenticationScheme2024: '# Updated title',
    });

    expect(global.app.vault.modify).toHaveBeenCalledWith(file, '# Updated title');
    expect(global.app.vault.create).not.toHaveBeenCalled();
    expect(paths).toEqual([file.path]);
  });

  it('does not create a file for empty note content', async () => {
    const paths = await filesFromNotes('', {
      romanQuantumsafeAuthenticationScheme2024: '',
    });

    expect(global.app.vault.create).not.toHaveBeenCalled();
    expect(global.app.vault.modify).not.toHaveBeenCalled();
    expect(paths).toEqual([]);
  });

  it('does not overwrite an existing file with whitespace-only content', async () => {
    (global.app.vault.getAbstractFileByPath as jest.Mock).mockReturnValue({
      path: 'romanQuantumsafeAuthenticationScheme2024.md',
    });

    const paths = await filesFromNotes('', {
      romanQuantumsafeAuthenticationScheme2024: '  \n',
    });

    expect(global.app.vault.create).not.toHaveBeenCalled();
    expect(global.app.vault.modify).not.toHaveBeenCalled();
    expect(paths).toEqual([]);
  });

  it('returns no path when writing fails', async () => {
    const error = new Error('write failed');
    (global.app.vault.create as jest.Mock).mockRejectedValue(error);
    const consoleError = jest.spyOn(console, 'error').mockImplementation();

    const paths = await filesFromNotes('03 - Artigos', {
      romanQuantumsafeAuthenticationScheme2024: '# Expected title',
    });

    expect(consoleError).toHaveBeenCalledWith(error);
    expect(paths).toEqual([]);
    consoleError.mockRestore();
  });
});
