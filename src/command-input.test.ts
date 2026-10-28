import { Option } from 'commander';
import { expect, it } from 'vitest';
import { jsonFlag } from './command-definition.js';
import { commands } from './command-registry.js';
import { integerFlag } from './command-input.js';

// Options that steer the CLI and never reach the request body.
const localOptions = ['input', 'wait', 'count'];

it('maps every flag of a command to a request field unless the command builds it or requires a body file', () => {
  for (const [name, definition] of Object.entries(commands)) {
    // A required --input always supplies the body, so the mapping is never read.
    const requiresBodyFile = definition.flags.some(
      ([flags, , required]) => flags === jsonFlag[0] && required,
    );

    if (requiresBodyFile) {
      expect(
        definition.input,
        `${name} maps flags that are never read`,
      ).toBeUndefined();
      continue;
    }

    const options = definition.flags.map(([flags]) =>
      new Option(flags).attributeName(),
    );

    const mapped = [
      ...Object.keys(definition.input ?? {}),
      ...(definition.autoRequestId ? ['request'] : []),
    ];

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
  for (const value of ['abc', '1.5', '-1', '', '1e3', '9007199254740993']) {
    expect(() => integerFlag('maxPrice', value)).toThrow(
      expect.objectContaining({
        code: 'INVALID_ARGUMENTS',
        detail: expect.objectContaining({ fields: ['maxPrice'] }),
      }),
    );
  }
});
