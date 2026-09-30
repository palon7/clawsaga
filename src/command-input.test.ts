import { expect, it } from 'vitest';
import { commands } from './command-registry.js';
import { integerFlag, optionKey } from './command-input.js';

// Options that steer the CLI and never reach the request body.
const localOptions = ['input', 'noWait', 'count'];

it('maps every flag of a command to a request field unless the command builds it', () => {
  for (const [name, definition] of Object.entries(commands)) {
    const options = definition.flags.map(([flags]) => optionKey(flags));
    const mapped = Object.keys(definition.input ?? {});
    expect(
      mapped.filter((option) => !options.includes(option)),
      `${name} maps an option it does not have`,
    ).toEqual([]);
    if (definition.buildInput) continue;
    expect(
      options.filter(
        (option) => !mapped.includes(option) && !localOptions.includes(option),
      ),
      `${name} has a flag without a request field`,
    ).toEqual([]);
  }
});

it('sends numeric flags only when they are non-negative integers', () => {
  expect(integerFlag('maxPrice', '120')).toBe(120);
  for (const value of ['abc', '1.5', '-1', '', '1e3', '9007199254740993'])
    expect(() => integerFlag('maxPrice', value)).toThrow(
      expect.objectContaining({
        code: 'INVALID_ARGUMENTS',
        detail: expect.objectContaining({ fields: ['maxPrice'] }),
      }),
    );
});
