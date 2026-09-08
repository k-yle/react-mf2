import {
  type ElementType,
  Fragment,
  type ReactNode,
  createElement,
} from 'react';
import type {
  MessageExpressionPart,
  MessageFormat,
  MessageMarkupPart,
} from 'messageformat';

const BIDI_DIR: Record<string, string | undefined> = {
  '\u2066': 'ltr', // LRI
  '\u2067': 'rtl', // RLI
  '\u2068': 'auto', // FSI
  // \u2069 (PDI) is not included, since it's the closing tag
};

/**
 * If translations use these values as placeholders, they will
 * not be passed into react props (since they're special).
 */
// TODO: maybe style could be allowed?
const UNSAFE_PROPS = /^(u:|(children|dangerouslySetInnerHTML|key|ref|style)$)/;

type ExhaustivityCheck<_T extends never> = never;

export type MarkupHandlers = Readonly<Record<string, ElementType>>;

export interface Options {
  /**
   * this function is called during a rendering error, used
   * by both this library and the `messageformat` library
   */
  onError?: Parameters<MessageFormat['format']>[1];
}

function stringify(part: MessageExpressionPart<string>) {
  return (part.parts || [part]).map((piece) => piece.value || '').join('');
}

/**
 * Converts a {@link MessageFormat} v2 message into a react
 * component tree.
 *
 * @param message - the value returned by `new MessageFormat(…)`
 *
 * @param params - parameters for placeholders in the translatable string.
 *                 For example, in the string `"Hi {#bold}{$name}{/bold}"`,
 *                 the params would be `{ name: 'Bob' }`
 *
 * @param markup - an object which explicitly lists all markup (components)
 *                 which are allowed. For example, in the string
 *                 `"Hi {#bold}{$name}{/bold}"`, the markup would be `{ bold: 'b' }`
 *                 to map `bold` to an HTML `<b>` component.
 *
 * @param options - other settings, see the individual typedefs
 */
export function formatToJsx<P extends string = never>(
  message: MessageFormat<string, P>,
  params?: Record<string, unknown>,
  markup?: MarkupHandlers,
  options?: Options,
): ReactNode {
  const onError = options?.onError ?? console.warn;

  const parts = (message as MessageFormat<string, never>).formatToParts(
    params,
    onError,
  );

  /** mutable object, gets converted to {@link ReactElement} once finalised */
  type Element = [
    type: ElementType,
    props: Record<string, unknown> | undefined,
    ...children: ReactNode[],
  ];

  const stack: Element[] = [[Fragment, undefined]];

  // helpers for mutating the stack

  function create(node: ReactNode) {
    stack.at(-1)!.push(node);
  }

  function enter(type: ElementType, props?: Record<string, unknown>) {
    stack.push([type, props]);
  }

  function exit() {
    if (stack.length <= 1) {
      onError(new SyntaxError('Unexpected closing markup'));
    } else {
      create(createElement(...stack.pop()!));
    }
  }

  function partToProps(part: MessageMarkupPart) {
    const props: Record<string, unknown> = { key: part.id };
    for (const name in part.options) {
      if (UNSAFE_PROPS.test(name)) {
        onError(
          new TypeError(`“${name}” cannot be used in markup (“${part.name}”)`),
        );
      } else {
        props[name] = part.options[name];
      }
    }
    return props;
  }

  for (const part of parts) {
    switch (part.type) {
      case 'markup': {
        let Component =
          markup &&
          Object.hasOwn(markup, part.name) && // guard against .constuctor
          markup[part.name];

        if (!Component) {
          // continue so that children are rendered.
          Component = Fragment;

          // only emit an error once per component
          if (part.kind !== 'close') {
            onError(
              new ReferenceError(`No definition for markup “${part.name}”`),
            );
          }
        }

        switch (part.kind) {
          case 'open': {
            enter(Component, partToProps(part));
            break;
          }

          case 'close': {
            exit();
            break;
          }

          case 'standalone': {
            // no children since it's self-closing
            const node = createElement(Component, partToProps(part));
            create(node);
            break;
          }

          default: {
            type _ = ExhaustivityCheck<typeof part.kind>;
          }
        }
        break;
      }

      case 'bidiIsolation': {
        const dir = BIDI_DIR[part.value];
        if (dir) enter('bdi', { dir });
        else exit(); // PDI is the closing tag
        break;
      }

      case 'fallback': {
        create(createElement('code', null, `{${part.source}}`));
        break;
      }

      case 'text':
      case 'string': {
        create(part.value);
        break;
      }

      // handles 'number', 'unknown', and any other values which are not
      // in `DefaultFunctions` (e.g. datetime)
      default: {
        // TODO: should datetime be wrapped in <time datetime='…'> by us?
        create(stringify(part));
      }
    }
  }

  if (stack.length > 1) {
    onError(new SyntaxError('Unclosed markup'));
    while (stack.length > 1) exit();
  }

  return createElement(...stack[0]!);
}
