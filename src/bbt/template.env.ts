import nunjucks, { Callback, Extension, Loader, LoaderSource } from 'nunjucks';
import { moment } from 'obsidian';

(nunjucks.runtime as any).memberLookup = function memberLookup(
  obj: any,
  val: any
) {
  if (obj === undefined || obj === null) {
    return undefined;
  }

  if (val == '__proto__' || val == 'constructor') {
    return function () {
      return function () {};
    };
  }

  if (typeof obj[val] === 'function') {
    // eslint-disable-next-line prefer-spread
    return (...args: any[]) => obj[val].apply(obj, args);
  }

  return obj[val];
};

function _prepareAttributeParts(attr: string) {
  if (!attr) {
    return [];
  }

  return attr.split('.');
}

function hasOwnProp(obj: any, k: string) {
  return Object.prototype.hasOwnProperty.call(obj, k);
}

function getAttrGetter(attribute: string) {
  const parts = _prepareAttributeParts(attribute);

  return function attrGetter(item: any) {
    let _item = item;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];

      if (hasOwnProp(_item, part)) {
        _item = _item[part];
      } else {
        /* istanbul ignore next */
        return undefined;
      }
    }

    return _item;
  };
}

type FilterByCmd =
  | 'startswith'
  | 'endswith'
  | 'contains'
  | 'dateafter'
  | 'dateonorafter'
  | 'datebefore'
  | 'dateonorbefore';

export function filterBy(
  arr: any[],
  prop: string,
  cmd: FilterByCmd,
  ...val: string[] | moment.Moment[]
) {
  const getter = getAttrGetter(prop);

  if (val.length === 0) return arr;

  return arr.filter((v: any) => {
    let toTest: string = typeof v === 'string' ? v : getter(v);

    if (!toTest) return false;

    if (
      typeof val[0] === 'string' &&
      ['startswith', 'endswith', 'contains'].includes(cmd)
    ) {
      toTest = toTest.toString().toLocaleLowerCase();

      return (val as string[]).some((value) => {
        const testVal = value.toLocaleLowerCase();

        if (cmd === 'startswith') {
          return toTest.startsWith(testVal);
        }

        if (cmd === 'endswith') {
          return toTest.endsWith(testVal);
        }

        if (cmd === 'contains') {
          return toTest.includes(testVal);
        }

        return true;
      });
    }

    if (
      ['dateafter', 'dateonorafter', 'datebefore', 'dateonorbefore'].includes(
        cmd
      )
    ) {
      return (val as moment.Moment[]).some((value) => {
        if (!moment.isMoment(toTest) || !moment.isMoment(value)) return false;

        switch (cmd) {
          case 'dateafter':
            return toTest.isAfter(value);
          case 'dateonorafter':
            return toTest.isSameOrAfter(value);
          case 'datebefore':
            return toTest.isBefore(value);
          case 'dateonorbefore':
            return toTest.isSameOrBefore(value);
        }
      });
    }

    return false;
  });
}

export function format(date: moment.Moment, format: string) {
  if (date instanceof moment) {
    return date.format(format);
  }

  return (
    'Error: `format` can only be applied to dates. Tried for format ' +
    typeof date
  );
}

interface WithRetained {
  _retained?: Record<string, string>;
}

export class PersistExtension implements Extension {
  static id: string = 'PersistExtension';
  tags: string[] = ['persist'];

  parse(parser: any, nodes: any) {
    // get the tag token
    const tok = parser.nextToken();

    // parse the args and move after the block end. passing true
    // as the second arg is required if there are no parentheses
    const args = parser.parseSignature(null, true);
    parser.advanceAfterBlockEnd(tok.value);

    // parse the body and possibly the error block, which is optional
    const body = parser.parseUntilBlocks('endpersist');

    parser.advanceAfterBlockEnd();

    // See above for notes about CallExtension
    return new nodes.CallExtension(this, 'run', args, [body]);
  }

  run(context: any, id: string, body: any) {
    let retained = '';

    if (context?.ctx?._retained && context.ctx._retained[id]) {
      retained = context.ctx._retained[id];
    }

    let trimmed = body() as string;
    if (retained) trimmed = trimmed.replace(/^\r?\n/, '');

    return new nunjucks.runtime.SafeString(
      `%% begin ${id} %%${retained}${trimmed}%% end ${id} %%`
    );
  }

  static hasPersist(str: string) {
    return /%% begin (.+?) %%([\w\W]*?)%% end \1 %%/gi.test(str);
  }
  static prepareTemplateData<T>(templateData: T, md: string): T & WithRetained {
    const out: Record<string, string> = {};

    if (!md) return templateData;

    const matches = md.matchAll(/%% begin (.+?) %%([\w\W]*?)%% end \1 %%/gi);
    for (const match of matches) {
      out[match[1]] = match[2];
    }

    return {
      ...templateData,
      _retained: out,
    };
  }
}

export class ObsidianMarkdownLoader extends Loader {
  sourceFile: string;

  async = true;

  setSourceFile(path: string) {
    this.sourceFile = path;
  }

  getLinkPath(link: string) {
    let match = link.trim().match(/^\[\[([^\]]+)\]\]$/);

    if (match) {
      return match[1];
    }

    match = link.trim().match(/^\[[^\]]*\]\(([^)]+)\)$/);

    if (match) {
      return match[1];
    }

    return null;
  }

  getSource(name: string, callback: Callback<Error, LoaderSource>): void {
    const linkPath = this.getLinkPath(name);

    if (!linkPath) {
      return callback(
        new Error('Cannot find file. Invalid markdown link: ' + name),
        null
      );
    }

    const file = app.metadataCache.getFirstLinkpathDest(
      linkPath,
      this.sourceFile || ''
    );

    if (!file) {
      return callback(
        new Error('Cannot find file. File not found: ' + name),
        null
      );
    }

    app.vault
      .cachedRead(file)
      .then((content) => {
        const src = {
          src: content,
          path: linkPath,
          noCache: true,
        };

        callback(null, src);
        this.emit('load', name, src);
      })
      .catch((e) => {
        callback(e, null);
      });
  }
}

const loader = new ObsidianMarkdownLoader();

export const template = new nunjucks.Environment(loader as any, {
  autoescape: false,
});

// The following code has been borrowed from the discussion at https://github.com/mozilla/nunjucks/issues/313
template.addFilter('setAttribute', function (dictionary, key: any, value: any) {
  dictionary[key] = value;
  return dictionary;
});
template.addFilter('filterby', filterBy);
template.addFilter('format', format);
template.addExtension(PersistExtension.id, new PersistExtension());

export function renderTemplate(
  sourceFile: string,
  templateStr: string,
  templateData: Record<any, any>
) {
  return new Promise<string>((res, rej) => {
    loader.setSourceFile(sourceFile);

    template.renderString(templateStr, templateData, (err, output) => {
      if (err) {
        return rej(err);
      }

      res(output);
    });
  });
}
