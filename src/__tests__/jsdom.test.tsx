// @vitest-environment jsdom
/* eslint-disable quotes -- for the mf2 vscode extension */
import { StrictMode, useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { MessageFormat } from 'messageformat';
import { formatToJsx } from '../index.js';

describe('jsdom', () => {
  afterEach(cleanup);

  it('works in jsdom', () => {
    const { container } = render(
      formatToJsx(
        new MessageFormat(
          'en',
          /* mf2 */ `Your {#link href=$url}deployment{/link} is available in {$n} regions.`,
        ),
        { url: '/d', n: 1234 },
        { link: 'a' },
      ),
    );

    expect(container.innerHTML).toBe(
      'Your <a href="/d">deployment</a> is available in 1,234 regions.',
    );
  });

  it('works with stateful children', () => {
    const Toggle = ({ children }: React.PropsWithChildren) => {
      const [isEnabled, setIsEnabled] = useState(false);
      return (
        <button onClick={() => setIsEnabled(!isEnabled)}>
          {isEnabled ? '☑' : '☒'} {children}
        </button>
      );
    };

    const { getByRole } = render(
      <StrictMode>
        {formatToJsx(
          new MessageFormat('en', /* mf2 */ `{#toggle}label{/toggle}`),
          {},
          { toggle: Toggle },
        )}
      </StrictMode>,
    );
    const button = getByRole('button');
    expect(button.textContent).toBe('☒ label');

    fireEvent.click(button);
    expect(button.textContent).toBe('☑ label');
  });
});
