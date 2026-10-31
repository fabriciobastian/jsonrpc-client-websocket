export function getParameterNames(callback: (...args: never[]) => unknown): string[] {
  const source = Function.prototype.toString.call(callback).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, ' ');
  const parameters =
    source.match(/^(?:async\s+)?([^\s()=]+)\s*=>/)?.[1] ?? source.slice(source.indexOf('(') + 1, source.indexOf(')'));

  return parameters.replace(/=[^,]+/g, '').match(/[^\s,]+/g) ?? [];
}
