# `react-mf2`

[![Build Status](https://github.com/k-yle/react-mf2/workflows/test/badge.svg)](https://github.com/k-yle/react-mf2/actions)
[![npm version](https://badge.fury.io/js/react-mf2.svg)](https://badge.fury.io/js/react-mf2)
[![npm](https://img.shields.io/npm/dt/react-mf2.svg)](https://www.npmjs.com/package/react-mf2)
![npm bundle size](https://img.shields.io/bundlephobia/minzip/react-mf2)

A super tiny library (**772 bytes**!) to render a [MessageFormat 2](https://github.com/unicode-org/message-format-wg) string as a react/JSX element.

This library can be used with any translation system, it has 0 dependencies, and only has peer-dependencies on [react](https://npm.im/react) and [messageformat](https://npm.im/messageformat) itself.

Given this message:

```ts
const message = new MessageFormat(
  'en-SG',
  /* mf2 */ `Your {#link href=$url class=important}latest deployment{/link} has {#br/} been released to {$count} regions.`,
);
```

If we use `message.format()`, we'll get a string. This string can't contain [markup](https://www.unicode.org/reports/tr35/tr35-messageFormat.html#markup) like [`<a>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/a) or [`<strong>`](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/strong):

```js
message.format({ count: 1234, url: 'https://example.com' });

// result:
('Your latest deployment has been released to \u20671,234\u2069 regions.');
```

This library solves the limitation by giving you the result as a react JSX element:

```jsx
import { formatToJsx } from 'react-mf2';
formatToJsx(message, { count: 1234, url: 'https://example.com' });

// result:
<span lang="en-SG">
  Your
  <a href="https://example.com" class="important">
    latest deployment
  </a>
  has <br /> been released to <bdi dir="ltr">1,234</bdi> regions.
</span>;
```

## Install

```bash
npm install react-mf2
```

`react` and `messageformat` are peer dependencies, you need to install them yourself.

This library tries to support ancient tech stacks: a CommonsJS bundle is still published, NodeJS can be as old as v20.19, and even React v16.14 is still supported.

## Usage

```ts
import { MessageFormat } from 'messageformat';
import { formatToJsx } from 'react-mf2';

const message = new MessageFormat(
  'en-SG',
  /* mf2 */ `Your {#link href=$url class=important}latest deployment{/link} has {#br/} been {#bold}released{/bold} to {$count} regions.`,
);

formatToJsx(
  message,
  // the second argument is for value parameters:
  {
    count: 1234,
    url: 'https://example.com',
  },
  // the third argument is for defining markup (components):
  {
    bold: 'strong',
    link: ({ children, ...props }) => <Link {...props}>{children}</Link>,
    br: 'br',
  },
);
```

For security reasons, you must explictly list every permitted component.
You can used both [named JSX IntrinsicElements](https://www.totaltypescript.com/what-is-jsx-intrinsicelements), and custom react components.

For example:

```jsx
{
  // define a custom react component inline:
  link: ({ children, ...props }) => <Link {...props}>{children}</Link>,

  // reference a custom react component:
  a: Link,

  // reference a JSX IntrinsicElement (<strong>):
  bold: 'strong',
}
```

Typically, you'll want to define a minimal set of markup which is always available to translators. For example, some basic HTML elements:

```jsx
formatToJsx(message, params, {
  link: 'a',
  bold: 'b',
  italics: 'i',
  underline: 'u',
});

// or if your translators prefer a more concise notation:
formatToJsx(message, params, {
  a: 'a',
  b: 'b',
  i: 'i',
  u: 'u',
});
```

## Security

MessageFormat 2 allows translators to define markup attributes, which become react component props.
For example: `{#link href=|https://example.com|} click here {/link}`.

Some clearly unacceptable props are blocked, like [`children`](https://react.dev/learn/passing-props-to-a-component#passing-jsx-as-children) and [`dangerouslySetInnerHTML`](https://legacy.reactjs.org/docs/dom-elements.html#dangerouslysetinnerhtml).
As of React v19, [`javascript:` URLs are also blocked](https://github.com/react/react/pull/26507).
However, just like any other React component library, this library does not attempt to sanitise malicious values like `href=|javascript:alert(1)|`.
That is the reponsibility of the app.

## Why another library?

There is already [an npm package for MF2 react](https://npm.im/mf2react), but it's unusable because:

- Basic features like props don't work (for example `{#link href=$url}`)
- It has no license, so it's copyrighted and can't be used by anyone.
- It's tightly coupled to [react-i18next](https://npm.im/react-i18next) and can't be used with any other react framework
