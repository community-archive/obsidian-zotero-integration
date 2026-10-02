import { copyFileSync, existsSync, mkdirSync } from 'fs';
import {
  Editor,
  Notice,
  TAbstractFile,
  TFile,
  TFolder,
  htmlToMarkdown,
  normalizePath,
} from 'obsidian';
import path from 'path';

import { getVaultRoot } from '../helpers';
import { DatabaseWithPort } from '../types';
import { getCiteKeys } from './cayw';
import { getLocalURI, mkMDDir, sanitizeFilePath } from './helpers';
import { getAttachmentsFromCiteKey, getNotesFromCiteKeys } from './jsonRPC';
import { removeStartingSlash } from './template.helpers';

export async function processZoteroAnnotationNotes(
  key: string,
  noteStr: string,
  attachments: Record<string, any>,
  destination?: string
) {
  const parsed = new DOMParser().parseFromString(noteStr, 'text/html');
  const annots = parsed.querySelectorAll('[data-annotation]');
  const cites = parsed.querySelectorAll('[data-citation]');

  for (const annot of Array.from(annots)) {
    try {
      const params = (annot as HTMLElement).dataset.annotation;
      const json = params ? JSON.parse(decodeURIComponent(params)) : null;

      if (!json) return;

      const annotationKey = json.annotationKey;

      const isImage = annot instanceof HTMLImageElement;

      if (isImage) {
        const imagePath = attachments[annotationKey];

        if (imagePath) {
          const parsed = path.parse(imagePath);
          const destPath = await getAvailablePathForAttachments(
            annotationKey,
            parsed.ext.slice(1),
            destination
          );

          const output = path.parse(path.join(getVaultRoot(), destPath));
          const imageOutputPath = output.dir;

          if (!existsSync(imageOutputPath)) {
            mkdirSync(imageOutputPath, { recursive: true });
          }

          let input = path.join(parsed.dir, `${annotationKey}${parsed.ext}`);

          try {
            if (!existsSync(input)) {
              const origInput = input;
              input = imagePath;
              if (!existsSync(input)) {
                throw new Error('Cannot find annotation image: ' + origInput);
              }
            }

            copyFileSync(input, path.join(getVaultRoot(), destPath));
          } catch (e) {
            new Notice(
              'Error: unable to copy annotation image from Zotero into your vault',
              7000
            );
            console.error(e);
          }

          annot.src = destPath;
        }
      }

      annot.insertAdjacentElement(
        isImage ? 'afterend' : 'beforebegin',
        createEl('a', {
          text: 'Go to annotation',
          href: getLocalURI('open-pdf', json.attachmentURI, {
            page: json.pageLabel,
            annotation: json.annotationKey,
          }),
        })
      );
      if (isImage) {
        annot.insertAdjacentElement('afterend', createEl('br'));
      } else {
        annot.insertAdjacentElement('beforebegin', createSpan({ text: ' ' }));
      }
    } catch (e) {
      console.error(e);
    }
  }

  cites.forEach((cite) => {
    try {
      const params = (cite as HTMLElement).dataset.citation;
      const json = params ? JSON.parse(decodeURIComponent(params)) : null;

      if (
        !json ||
        !json.citationItems.length ||
        !json.citationItems[0].uris?.length
      )
        return;

      const citeSpan = cite.querySelector('span');

      if (!citeSpan) return;

      const text = citeSpan.innerText;

      citeSpan.empty();
      citeSpan.createEl('a', {
        text,
        href: getLocalURI('select', json.citationItems[0].uris[0]),
      });
    } catch (e) {
      console.error(e);
    }
  });

  return parsed.body.innerHTML;
}

export async function noteExportPrompt(
  database: DatabaseWithPort,
  destination?: string
) {
  const citeKeys = await getCiteKeys(database);

  if (!citeKeys.length) return;

  const notes = await getNotesFromCiteKeys(citeKeys, database);

  if (!notes) {
    new Notice('No notes found for selected items', 7000);
    return;
  }

  const keys = Object.keys(notes);

  if (!keys.length) {
    new Notice('No notes found for selected items', 7000);
    return;
  }

  const attachments: Record<string, any> = {};

  for (const key of citeKeys) {
    const attachment = await getAttachmentsFromCiteKey(key, database);

    if (attachment) {
      const images: Record<string, string> = {};

      attachment.forEach((a: any) => {
        a.annotations?.forEach((annot: any) => {
          if (annot.annotationType === 'image') {
            images[annot.key] = annot.annotationImagePath;
          }
        });
      });

      attachments[key.key] = images;
    }
  }

  const notesMarkdown: Record<string, string> = {};

  for (const key of keys) {
    const processed: string[] = [];

    for (const note of notes[key]) {
      processed.push(
        htmlToMarkdown(
          await processZoteroAnnotationNotes(
            key,
            note,
            attachments[key],
            destination
          )
        )
      );
    }

    notesMarkdown[key] = processed.join('\n\n');
  }

  return notesMarkdown;
}

async function getAvailablePathForAttachments(
  base: string,
  extension: string,
  destination: string
): Promise<string> {
  let folderPath = (app.vault as any).getConfig('attachmentFolderPath');
  const sameFolder = folderPath === '.' || folderPath === './';
  let subfolder = null;
  if (folderPath.startsWith('./')) {
    subfolder = folderPath.slice(2);
  }

  if (sameFolder) {
    folderPath = destination ? destination : '';
  } else if (subfolder) {
    folderPath = path.join(destination ? destination : '', subfolder);
  }

  folderPath = normalizePath(folderPath);

  let folder: TAbstractFile = (
    app.vault as any
  ).getAbstractFileByPathInsensitive(folderPath);

  if (!folder && subfolder) {
    await (app.vault as any).createFolder(folderPath);
    folder = (app.vault as any).getAbstractFileByPathInsensitive(folderPath);
  }

  if (!(folder instanceof TFolder)) {
    return `${base}.${extension}`;
  }

  return `${(folder as any).getParentPrefix() + base}.${extension}`;
}

export function insertNotesIntoCurrentDoc(
  editor: Editor,
  notes: Record<string, string>
) {
  editor.replaceSelection(Object.values(notes).join('\n\n'));
}

export async function filesFromNotes(
  folder: string,
  notes: Record<string, string>
) {
  const keys = Object.keys(notes);
  const files: TFile[] = [];

  for (const key of keys) {
    const content = notes[key];

    if (!content.trim()) {
      new Notice(`No note content found for "${key}"; file was not written`, 7000);
      continue;
    }

    const file = await newFile(folder, key, content);
    if (!file) {
      break;
    }
    files.push(file);
  }

  return files.map((f) => f.path);
}

export async function newFile(
  folder: string,
  citeKey: string,
  content: string
) {
  const path = normalizePath(
    sanitizeFilePath(removeStartingSlash(`${folder}/${citeKey}.md`))
  );

  let file = app.vault.getAbstractFileByPath(path) as TFile;

  try {
    if (file) {
      await app.vault.modify(file, content);
    } else {
      await mkMDDir(path);
      file = await app.vault.create(path, content);
    }
  } catch (e) {
    console.error(e);
    new Notice(`Error creating file "${path}": ${e.message}`, 10000);
    return null;
  }

  return file;
}
