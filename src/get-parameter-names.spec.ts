import { getParameterNames } from './get-parameter-names';

describe('getParameterNames', () => {
  it.each<{ description: string; callback: (...args: never[]) => unknown; expected: string[] }>([
    {
      description: 'a named function',
      callback: function sum(first: number, second: number) {
        return first + second;
      },
      expected: ['first', 'second'],
    },
    {
      description: 'an anonymous function',
      callback: function (first: number, second: number) {
        return first + second;
      },
      expected: ['first', 'second'],
    },
    {
      description: 'an async function',
      callback: async function (value: number) {
        return value;
      },
      expected: ['value'],
    },
    {
      description: 'a method',
      callback: {
        sum(first: number, second: number) {
          return first + second;
        },
      }.sum,
      expected: ['first', 'second'],
    },
    {
      description: 'a parenthesized arrow',
      callback: (first: number, second: number) => first + second,
      expected: ['first', 'second'],
    },
    // prettier-ignore
    { description: 'an unparenthesized arrow', callback: value => String(value), expected: ['value'] },
    // prettier-ignore
    { description: 'an async unparenthesized arrow', callback: async value => String(value), expected: ['value'] },
    {
      description: 'default values',
      callback: (first = 1, second = 2) => first + second,
      expected: ['first', 'second'],
    },
    {
      description: 'comments between parameters',
      callback: (
        first: number, // line comment
        /* block comment */ second: number,
      ) => first + second,
      expected: ['first', 'second'],
    },
    {
      description: 'a function without parameters',
      callback: function () {
        return 'no parameters';
      },
      expected: [],
    },
    { description: 'an arrow without parameters', callback: () => 'no parameters', expected: [] },
  ])('extracts parameter names from $description', ({ callback, expected }) => {
    expect(getParameterNames(callback)).toEqual(expected);
  });
});
