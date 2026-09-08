/* eslint-disable quotes -- for the mf2 vscode extension */
import { describe, expect, it, vi } from 'vitest';
import {
  MessageFormat,
  type MessageFormatOptions,
  MessageFunctionError,
  MessageResolutionError,
} from 'messageformat';
import { DraftFunctions, type MessageFunction } from 'messageformat/functions';
import { renderToStaticMarkup } from 'react-dom/server';
import { type MarkupHandlers, formatToJsx } from '../index.js';

const runTest = (
  message: string,
  params?: Record<string, unknown>,
  markup?: MarkupHandlers,
  expectedErrors?: unknown[],
  locale = 'es',
  options?: MessageFormatOptions<string>,
) => {
  const onError = vi.fn();
  const jsx = formatToJsx(
    new MessageFormat(locale, message, options),
    params,
    markup,
    { onError },
  );
  const html = renderToStaticMarkup(jsx);

  expect(onError).toHaveBeenCalledTimes(expectedErrors?.length || 0);
  if (expectedErrors?.length) {
    for (const [index, error] of expectedErrors.entries()) {
      expect(onError).toHaveBeenNthCalledWith(index + 1, error);
    }
  }

  return html;
};

const Link: React.FC<React.ComponentProps<'a'>> = ({ children, ...props }) => (
  <a {...props}>{children}</a>
);

describe(formatToJsx, () => {
  describe('basic cases', () => {
    it.each([
      { input: /* mf2 */ ``, output: '' },
      { input: /* mf2 */ `hello`, output: 'hello' },
      {
        input: /* mf2 */ `Hello {$count}`,
        output: 'Hello <bdi dir="rtl">1,234</bdi>',
        locale: 'he',
      },
      {
        input: /* mf2 */ `Hello {$count}`,
        output: 'Hello 1.234', // different number separator, and no need for <bdi>
        locale: 'de',
      },
      { input: /* mf2 */ `A {#br/} B`, output: 'A <br/> B' },
      { input: /* mf2 */ `A {#br u:id=first /} B`, output: 'A <br/> B' }, // u:id is ignored, it becomes the react key
      { input: /* mf2 */ `A {#link}B{/link}`, output: 'A <a>B</a>' },
      {
        input: /* mf2 */ `A {#link href=|C| }B{/link}`,
        output: 'A <a href="C">B</a>',
      },
      {
        input: /* mf2 */ `{#br arbitraryProp=|hi| /}`,
        output: '<br arbitraryProp="hi"/>',
      },

      // bidi isolation:
      {
        locale: 'fr', // no tag in ltr
        input: /* mf2 */ `x {$count} y`,
        output: 'x 1\u202F234 y',
      },
      {
        locale: 'fr', // ltr in ltr
        input: /* mf2 */ `x {$count :number u:dir=ltr} y`,
        output: 'x <bdi dir="ltr">1\u202F234</bdi> y',
      },
      {
        locale: 'he', // ltr in rtl
        input: /* mf2 */ `x {$count :number u:dir=ltr} y`,
        output: 'x <bdi dir="ltr">1,234</bdi> y',
      },
      {
        locale: 'he', // rtl in rtl
        input: /* mf2 */ `x {$count} y`,
        output: 'x <bdi dir="rtl">1,234</bdi> y',
      },
      {
        locale: 'he', // ltr in rtl
        input: /* mf2 */ `x {$count :number u:dir=ltr} y`,
        output: 'x <bdi dir="ltr">1,234</bdi> y',
      },

      // default functions:
      {
        input: /* mf2 */ `{$count :offset subtract=1}`,
        output: '1233',
      },
      {
        input: /* mf2 */ `{$count :number minimumFractionDigits=2}`,
        output: '1234,00',
      },
    ])('$input', ({ input, output, locale }) => {
      const out = runTest(
        input,
        { count: 1234, url: 'https://example.com' },
        { bold: 'strong', link: Link, br: 'br' },
        [],
        locale,
      );

      expect(out).toStrictEqual(output);
    });

    it('supports nested markup', () => {
      expect(
        runTest(/* mf2 */ `{#b}bold {#i}and italic{/i}{/b}`, undefined, {
          b: 'b',
          i: 'i',
        }),
      ).toBe('<b>bold <i>and italic</i></b>');
    });

    it('preserves empty markup', () => {
      expect(
        runTest(/* mf2 */ `a{#b}{/b}c`, undefined, { b: 'b' }, [], 'en'),
      ).toBe('a<b></b>c');
    });
  });

  describe('complex real cases', () => {
    it('handles the sample case from the readme', () => {
      const errors = [
        expect.any(MessageResolutionError), // because of $invalid
      ];
      const out = runTest(
        /* mf2 */ `Your {#link href=$url class=important}latest deployment{/link} has {#br/} been {#bold}released{/bold} to {$count}-{$invalid} regions.`,
        {
          count: 1234,
          url: 'https://example.com',
        },
        {
          bold: 'strong',
          link: Link,
          br: 'br',
        },
        errors,
        'yi',
      );

      expect(out).toStrictEqual(
        'Your <a href="https://example.com" class="important">latest deployment</a> has <br/> been <strong>released</strong> to <bdi dir="rtl">1,234</bdi>-<bdi dir="auto"><code>{$invalid}</code></bdi> regions.',
      );
    });
  });

  describe('safety', () => {
    it('blocks XSS attacks', () => {
      const errors = [
        new TypeError(
          '“dangerouslySetInnerHTML” cannot be used in markup (“bold”)',
        ),
      ];
      const out = runTest(
        /* mf2 */ `{#bold dangerouslySetInnerHTML=$evil/}`,
        { evil: { __html: '<img src=x onerror=alert(1)>' } },
        { bold: 'b' },
        errors,
      );

      expect(out).toStrictEqual('<b></b>');
    });

    it('does not allow children as a prop', () => {
      const errors = [
        new TypeError('“children” cannot be used in markup (“bold”)'),
      ];
      const out = runTest(
        /* mf2 */ `{#bold children=|bad|}good{/bold}`,
        {},
        { bold: 'b' },
        errors,
      );

      expect(out).toStrictEqual('<b>good</b>');
    });

    it('does not allow the key or ref props', () => {
      const html = runTest(
        /* mf2 */ `{#b key=|kk| ref=|rr|}hello{/b}`,
        undefined,
        { b: 'b' },
        [
          new TypeError('“key” cannot be used in markup (“b”)'),
          new TypeError('“ref” cannot be used in markup (“b”)'),
        ],
      );

      expect(html).toBe('<b>hello</b>');
    });
  });

  describe('attributes', () => {
    it('ignores other u: attributes', () => {
      const errors = [
        new TypeError('“u:whatever” cannot be used in markup (“bold”)'),
      ];
      const out = runTest(
        /* mf2 */ `{#bold u:whatever=a/}`,
        {},
        { bold: 'b' },
        errors,
      );

      expect(out).toStrictEqual('<b></b>');
    });
  });

  describe('errors', () => {
    it('renders missing params', () => {
      const html = runTest(/* mf2 */ `a {$missing} b`, {}, undefined, [
        expect.any(MessageResolutionError),
      ]);

      expect(html).toBe('a <bdi dir="auto"><code>{$missing}</code></bdi> b');
    });

    it('renders invalid options (:offset)', () => {
      const html = runTest(/* mf2 */ `a {$n :offset} b`, { n: 5 }, undefined, [
        expect.any(MessageFunctionError),
      ]);

      expect(html).toBe('a <bdi dir="auto"><code>{$n}</code></bdi> b');
    });

    it('reports mismatched closing tag but still renders', () => {
      const html = runTest(/* mf2 */ `a {/invalidd} b`, undefined, {}, [
        new SyntaxError('Unexpected closing markup'),
      ]);

      expect(html).toBe('a  b');
    });

    it('unwraps markup that has no handler, and reports it once', () => {
      // the lookup runs for the opening and the closing tag, but only the
      // opening one is worth reporting
      const html = runTest(
        /* mf2 */ `a {#invalidd}b{/invalidd} c`,
        undefined,
        {},
        [new ReferenceError('No definition for markup “invalidd”')],
      );

      expect(html).toBe('a b c');
    });

    it('renders the contents of unclosed markup, and reports it', () => {
      const html = runTest(/* mf2 */ `a {#b}rest`, undefined, { b: 'b' }, [
        new SyntaxError('Unclosed markup'),
      ]);

      expect(html).toBe('a <b>rest</b>');
    });

    it("handles JS's annoying 'constructor' prop in markup", () => {
      expect(
        runTest(
          /* mf2 */ `{#constructor}hi{/constructor}`,
          {},
          // @ts-expect-error -- TS doesn't like it
          { constructor: 'a' },
          [],
        ),
      ).toBe('<a>hi</a>');
    });

    it("handles JS's annoying 'constructor' prop in options", () => {
      expect(runTest(/* mf2 */ `hi {$constructor}`, { constructor: 'a' })).toBe(
        'hi <bdi dir="auto">a</bdi>',
      );
    });

    it('auto closes the nearest markup even if its mismatched', () => {
      expect(
        runTest(/* mf2 */ `{#b}1{#i}2{/b}3{/i}`, undefined, { b: 'b', i: 'i' }),
      ).toBe('<b>1<i>2</i>3</b>');
    });
  });

  describe('escaping', () => {
    it("renders a quoted literal (pipe inside MF2's pipe-delimited strings)", () => {
      expect(runTest(String.raw`{|a \| b| :string}`)).toBe(
        '<bdi dir="auto">a | b</bdi>',
      );
    });

    it('ignores attributes', () => {
      expect(
        runTest(/* mf2 */ `{#b @translate=no @comment=hi}x{/b}`, undefined, {
          b: 'b',
        }),
      ).toBe('<b>x</b>');
    });

    it('escapes html syntax in both the message and in params', () => {
      expect(
        runTest(/* mf2 */ `a < b & c {$x}`, { x: '<script>alert(1)' }),
      ).toBe('a &lt; b &amp; c <bdi dir="auto">&lt;script&gt;alert(1)</bdi>');
    });

    it("uses react's existing behaviour to block javascript: URLs", () => {
      expect(
        runTest(/* mf2 */ `{#a href=|javascript:alert(1)|}x{/a}`, undefined, {
          a: 'a',
        }),
      ).toBe(
        '<a href="javascript:throw new Error(&#x27;React has blocked a javascript: URL as a security precaution.&#x27;)">x</a>',
      );
    });
  });

  describe('Draft Functions', () => {
    it('renders dates', () => {
      expect(
        runTest(
          /* mf2 */ `x {$d :date timeZone=UTC} y`,
          { d: new Date('2026-07-12T14:05:09Z') },
          undefined,
          [],
          'en',
          { functions: DraftFunctions },
        ),
      ).toBe('x Jul 12, 2026 y');
    });

    it('wraps a date in <bdi> when the direction differs', () => {
      expect(
        runTest(
          /* mf2 */ `x {$d :date timeZone=UTC u:dir=rtl} y`,
          { d: new Date('2026-07-12T14:05:09Z') },
          undefined,
          [],
          'en',
          { functions: DraftFunctions },
        ),
      ).toBe('x <bdi dir="rtl">Jul 12, 2026</bdi> y');
    });

    it('renders a date inside markup', () => {
      expect(
        runTest(
          /* mf2 */ `Released {#b}{$d :date timeZone=UTC}{/b}.`,
          { d: new Date('2026-07-12T14:05:09Z') },
          { b: 'b' },
          [],
          'en',
          { functions: DraftFunctions },
        ),
      ).toBe('Released <b>Jul 12, 2026</b>.');
    });

    it('renders when trying to format params as dates', () => {
      const html = runTest(
        /* mf2 */ `a {$d :date} b`,
        { d: 'not a date' },
        undefined,
        [new MessageFunctionError('bad-operand', 'Input is not a valid date')],
        'en',
        { functions: DraftFunctions },
      );

      expect(html).toBe('a <bdi dir="auto"><code>{$d}</code></bdi> b');
    });

    it('errors if :date is used but DraftFunctions is not registered', () => {
      const html = runTest(
        /* mf2 */ `a {$d :date} b`,
        { d: new Date('2026-07-12T14:05:09Z') },
        undefined,
        [expect.any(MessageResolutionError)],
        'en',
      );

      expect(html).toBe('a <bdi dir="auto"><code>{$d}</code></bdi> b');
    });
  });

  describe('custom functions', () => {
    it('supports custom functions that return a string value', () => {
      const myCustomFunc: MessageFunction<'myCustomFunc'> = (
        ctx,
        options,
        v,
      ) => {
        const value = `${v}`.toUpperCase();
        return {
          type: 'myCustomFunc',
          dir: 'auto',
          toParts: () => [{ type: 'myCustomFunc', value }],
          toString: () => value,
          valueOf: () => value,
        };
      };

      expect(
        runTest(
          /* mf2 */ `a {$s :myCustomFunc} b`,
          { s: 'hi' },
          undefined,
          [],
          'en',
          { functions: { myCustomFunc } },
        ),
      ).toBe('a <bdi dir="auto">HI</bdi> b');
    });

    it('supports custom functions that return parts', () => {
      const myCustomFunc: MessageFunction<'myCustomFunc'> = (
        _ctx,
        _options,
        operand,
      ) => ({
        type: 'myCustomFunc',
        dir: 'auto',
        toParts: () => [
          {
            type: 'myCustomFunc',
            parts: [...`${operand}`].map((value) => ({
              type: 'my sub part',
              value,
            })),
          },
        ],
        toString: () => `${operand}`,
      });

      expect(
        runTest(
          /* mf2 */ `{$s :myCustomFunc}`,
          { s: 'abc' },
          undefined,
          [],
          'en',
          { functions: { myCustomFunc } },
        ),
      ).toBe('<bdi dir="auto">abc</bdi>');
    });
  });
});
