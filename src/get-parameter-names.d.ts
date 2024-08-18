declare module 'get-parameter-names' {
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  function getParameterNames(fn: Function): string[];
  export = getParameterNames;
}
