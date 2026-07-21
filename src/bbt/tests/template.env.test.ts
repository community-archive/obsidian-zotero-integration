import moment from 'moment';
import nunjucks from 'nunjucks';

import {
  ObsidianMarkdownLoader,
  PersistExtension,
  filterBy,
  format,
  renderTemplate,
} from '../template.env';

jest.mock(
  'obsidian',
  () => ({
    moment: require('moment'),
  }),
  { virtual: true }
);

describe('filter#filterBy', () => {
  const tests = [
    {
      a: {
        b: 'abcdefg',
      },
      b: 'dddd',
      date: moment('2022-04-04', 'YYYY-MM-DD'),
    },
    {
      a: {
        b: 'defghijk',
      },
      date: moment('2022-04-05', 'YYYY-MM-DD'),
    },
    {
      a: {
        b: 'abcxyz',
      },
      date: moment('2022-04-06', 'YYYY-MM-DD'),
    },
  ];

  it('handles empty props', () => {
    expect(filterBy(tests, '', 'endswith', 'yz')).toHaveLength(0);
  });

  it('filters by string that starts with string', () => {
    expect(filterBy(tests, 'a.b', 'startswith', 'ab')).toHaveLength(2);
    expect(filterBy(tests, 'a.b', 'startswith', 'ab')[0]).toBe(tests[0]);
    expect(filterBy(tests, 'a.b', 'startswith', 'ab')[1]).toBe(tests[2]);
  });

  it('filters by string that contains string', () => {
    expect(filterBy(tests, 'a.b', 'contains', 'bc')).toHaveLength(2);
    expect(filterBy(tests, 'a.b', 'contains', 'bc')[0]).toBe(tests[0]);
    expect(filterBy(tests, 'a.b', 'contains', 'bc')[1]).toBe(tests[2]);
  });

  it('filters by string that ends with string', () => {
    expect(filterBy(tests, 'a.b', 'endswith', 'yz')).toHaveLength(1);
    expect(filterBy(tests, 'a.b', 'endswith', 'yz')[0]).toBe(tests[2]);
  });

  it('returns empty array when date is not date', () => {
    expect(filterBy(tests, 'date', 'dateafter', 'yz')).toHaveLength(0);
  });

  it('filters by date that ends after date', () => {
    expect(
      filterBy(tests, 'date', 'dateafter', moment('2022-04-05', 'YYYY-MM-DD'))
    ).toHaveLength(1);
    expect(
      filterBy(
        tests,
        'date',
        'dateafter',
        moment('2022-04-05', 'YYYY-MM-DD')
      )[0]
    ).toBe(tests[2]);
  });

  it('filters by date that ends on or after date', () => {
    expect(
      filterBy(
        tests,
        'date',
        'dateonorafter',
        moment('2022-04-05', 'YYYY-MM-DD')
      )
    ).toHaveLength(2);
    expect(
      filterBy(
        tests,
        'date',
        'dateonorafter',
        moment('2022-04-05', 'YYYY-MM-DD')
      )[0]
    ).toBe(tests[1]);
    expect(
      filterBy(
        tests,
        'date',
        'dateonorafter',
        moment('2022-04-05', 'YYYY-MM-DD')
      )[1]
    ).toBe(tests[2]);
  });

  it('filters by date that ends before date', () => {
    expect(
      filterBy(tests, 'date', 'datebefore', moment('2022-04-05', 'YYYY-MM-DD'))
    ).toHaveLength(1);
    expect(
      filterBy(
        tests,
        'date',
        'datebefore',
        moment('2022-04-05', 'YYYY-MM-DD')
      )[0]
    ).toBe(tests[0]);
  });

  it('filters by date that ends on or before date', () => {
    expect(
      filterBy(
        tests,
        'date',
        'dateonorbefore',
        moment('2022-04-05', 'YYYY-MM-DD')
      )
    ).toHaveLength(2);
    expect(
      filterBy(
        tests,
        'date',
        'dateonorbefore',
        moment('2022-04-05', 'YYYY-MM-DD')
      )[0]
    ).toBe(tests[0]);
    expect(
      filterBy(
        tests,
        'date',
        'dateonorbefore',
        moment('2022-04-05', 'YYYY-MM-DD')
      )[1]
    ).toBe(tests[1]);
  });

  it('returns empty array when command not found', () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(filterBy(tests, 'date', 'nope', 'yz')).toHaveLength(0);
  });
});

describe('filter#format()', () => {
  it('formats moment dates', () => {
    const d = moment();
    expect(format(d, 'YYYY-MM-DD')).toBe(d.format('YYYY-MM-DD'));
  });

  it('returns an error on non-date values', () => {
    // eslint-disable-next-line @typescript-eslint/ban-ts-comment
    // @ts-ignore
    expect(format('hi', 'YYYY-MM-DD')).toBe(
      'Error: `format` can only be applied to dates. Tried for format string'
    );
  });
});

describe('class PersistExtension', () => {
  it('parses text and returns content to retain', () => {
    const expected = {
      _retained: {
        hello: 'world',
        'two words': 'hello',
      },
    };

    const templateData = {};

    const text = `
      %% begin hello %%world%% end hello %%

      %% begin two words %%hello%% end two words %%
    `;

    expect(PersistExtension.prepareTemplateData(templateData, text)).toEqual(
      expected
    );
    expect(PersistExtension.prepareTemplateData(templateData, '')).toEqual({});
  });

  it('appends new text to retained text', () => {
    const env = new nunjucks.Environment(undefined, {
      autoescape: false,
    });

    env.addExtension(PersistExtension.id, new PersistExtension());

    const templateData = {
      a: 'one',
      b: 'two',
      _retained: {
        hello: '‘hello’',
        'two words': 'world',
      },
    };

    const template = `
      {% persist "hello" %}{{a}}{% endpersist %}

      {% persist "two words" %}{{b}}{% endpersist %}
    `;

    const expected = `
      %% begin hello %%‘hello’one%% end hello %%

      %% begin two words %%worldtwo%% end two words %%
    `;

    expect(env.renderString(template, templateData)).toEqual(expected);
  });

  it('sanely handles new lines', () => {
    const env = new nunjucks.Environment(undefined, {
      autoescape: false,
    });

    env.addExtension(PersistExtension.id, new PersistExtension());

    const templateData = {
      a: 'one',
      b: 'two',
    };

    let template = `
{% persist "hello" %}
{{a}}
{% endpersist %}
    `.trim();

    let existing = `
%% begin hello %%
hello
%% end hello %%
    `.trim();

    let expected = `
%% begin hello %%
hello
one
%% end hello %%
    `.trim();

    expect(
      env.renderString(
        template,
        PersistExtension.prepareTemplateData(templateData, existing)
      )
    ).toEqual(expected);

    template = `
{% persist "hello" %}

{{a}}
{% endpersist %}
    `.trim();

    existing = `
%% begin hello %%

hello
%% end hello %%
    `.trim();

    expected = `
%% begin hello %%

hello

one
%% end hello %%
    `.trim();

    expect(
      env.renderString(
        template,
        PersistExtension.prepareTemplateData(templateData, existing)
      )
    ).toEqual(expected);
  });

  it('replaces rendered frontmatter with existing frontmatter', () => {
    const existing = `
---
title: Old Title
---
# Old Body
    `.trim();

    const rendered = `
---
title: New Title
---
# Hello
    `.trim();

    const expected = `
---
title: Old Title
---
# Hello
    `.trim();

    const templateData = PersistExtension.prepareTemplateData({}, existing);

    expect(
      PersistExtension.persistFrontmatter(
        rendered,
        templateData._retained?.frontmatter
      )
    ).toEqual(expected);
  });


  it('preserves existing frontmatter when new rendered output has no frontmatter', () => {
    const existing = `
---
title: Old Title
---
# Old Body
    `.trim();

    const rendered = `
# New Body
    `.trim();

    const expected = `
---
title: Old Title
---
# New Body
    `.trim();

    const templateData = PersistExtension.prepareTemplateData({}, existing);

    expect(
      PersistExtension.persistFrontmatter(
        rendered,
        templateData._retained?.frontmatter
      )
    ).toEqual(expected);
  });
});

describe('class ObsidianMarkdownLoader', () => {
  it('returns source of wikilinked file', (done) => {
    global.app = {
      metadataCache: {
        getFirstLinkpathDest: jest.fn(() => true),
      },
      vault: {
        cachedRead() {
          return Promise.resolve('hello content');
        },
      },
    } as any;

    const loader = new ObsidianMarkdownLoader();

    const env = new nunjucks.Environment(loader as any, {
      autoescape: false,
    });

    const template = `
      {% include "[[hello]]" %}
    `;
    const expected = `
      hello content
    `;

    env.renderString(template, {}, (err, res) => {
      expect(err).toBeNull();
      expect(res).toBe(expected);
      done();
    });
  });

  it('returns source of markdown linked file', (done) => {
    global.app = {
      metadataCache: {
        getFirstLinkpathDest: jest.fn(() => true),
      },
      vault: {
        cachedRead() {
          return Promise.resolve('hello content');
        },
      },
    } as any;

    const loader = new ObsidianMarkdownLoader();

    const env = new nunjucks.Environment(loader as any, {
      autoescape: false,
    });

    const template = `
      {% include "[](hello)" %}
    `;
    const expected = `
      hello content
    `;

    env.renderString(template, {}, (err, res) => {
      expect(err).toBeNull();
      expect(res).toBe(expected);
      done();
    });
  });

  it('supplies the set source file', (done) => {
    const getFirstFn = jest.fn(() => true);

    global.app = {
      metadataCache: {
        getFirstLinkpathDest: getFirstFn,
      },
      vault: {
        cachedRead() {
          return Promise.resolve('hello content');
        },
      },
    } as any;

    const loader = new ObsidianMarkdownLoader();

    const env = new nunjucks.Environment(loader as any, {
      autoescape: false,
    });

    const template = `
      {% include "[[hello]]" %}
    `;
    const expected = `
      hello content
    `;

    loader.setSourceFile('world');

    env.renderString(template, {}, (err, res) => {
      expect(err).toBeNull();
      expect(res).toBe(expected);
      expect(getFirstFn).toBeCalledWith('hello', 'world');
      done();
    });
  });

  it('returns error on invalid markdown link', (done) => {
    global.app = {
      metadataCache: {
        getFirstLinkpathDest: jest.fn(() => true),
      },
      vault: {
        cachedRead() {
          return Promise.resolve('hello content');
        },
      },
    } as any;

    const loader = new ObsidianMarkdownLoader();

    const env = new nunjucks.Environment(loader as any, {
      autoescape: false,
    });

    const template = `
      {% include "hello" %}
    `;

    env.renderString(template, {}, (err) => {
      expect(err).not.toBeNull();
      expect(err.message).toContain('Invalid markdown link');
      done();
    });
  });

  it('returns error on null file', (done) => {
    global.app = {
      metadataCache: {
        getFirstLinkpathDest: jest.fn(() => null),
      },
      vault: {
        cachedRead() {
          return Promise.resolve('hello content');
        },
      },
    } as any;

    const loader = new ObsidianMarkdownLoader();

    const env = new nunjucks.Environment(loader as any, {
      autoescape: false,
    });

    const template = `
      {% include "[[hello]]" %}
    `;

    env.renderString(template, {}, (err) => {
      expect(err).not.toBeNull();
      expect(err.message).toContain('File not found');
      done();
    });
  });

  it("returns error from obsidian's cachedRead", (done) => {
    global.app = {
      metadataCache: {
        getFirstLinkpathDest: jest.fn(() => true),
      },
      vault: {
        cachedRead() {
          return Promise.reject('hello content');
        },
      },
    } as any;

    const loader = new ObsidianMarkdownLoader();

    const env = new nunjucks.Environment(loader as any, {
      autoescape: false,
    });

    const template = `
      {% include "[[hello]]" %}
    `;

    env.renderString(template, {}, (err) => {
      expect(err).not.toBeNull();
      expect(err.message).toContain('hello content');
      done();
    });
  });
});

describe('renderTemplate()', () => {
  it('returns output from promise', (done) => {
    renderTemplate('', 'hello', {}).then((res) => {
      expect(res).toBe('hello');
      done();
    });
  });

  it('returns error from promise', (done) => {
    renderTemplate('', '{% hello %}', {}).catch((e) => {
      expect(e).toBeInstanceOf(Error);
      done();
    });
  });
});