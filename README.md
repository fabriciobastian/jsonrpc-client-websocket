[![✅ Continuous Integration](https://github.com/fabriciobastian/jsonrpc-client-websocket/actions/workflows/ci.yml/badge.svg)](https://github.com/fabriciobastian/jsonrpc-client-websocket/actions/workflows/ci.yml) [![License](https://img.shields.io/github/license/fabriciobastian/jsonrpc-client-websocket)](https://choosealicense.com/licenses/mit/) [![NPM downloads](https://img.shields.io/npm/dt/jsonrpc-client-websocket.svg)](https://www.npmjs.com/package/jsonrpc-client-websocket)

![jsonrpc-client-websocket](https://raw.githubusercontent.com/fabriciobastian/jsonrpc-client-websocket/main/assets/jsonrpc-client-websocket-banner-light-small.png)

A simple JSON RPC 2.0 client over websockets

## Open connection

```typescript
const websocketUrl = 'ws://mywebsocketurl:port';
const requestTimeoutMs = 2000;
const websocket = new JsonRpcWebsocket(websocketUrl, requestTimeoutMs, (error: JsonRpcError) => {
  /* handle error */
});
await websocket.open();
```

Requests that do not receive a response within the specified timeout will fail with a REQUEST_TIMEOUT code.
The callback (optional) is used for eventual errors, such as receiving a response that does not match any request id and
connection errors. Furthermore, all errors that are sent to an eventual caller are also reported on the callback, e.g.
if an rpc method is called with an invalid number of parameters, etc...

## Close connection

```typescript
await websocket.close();
```

## Call RPC method

Considering that the server has a method `sum(a: int, b: int)`

### with positional parameters

```typescript
websocket.call('sum', [1, 2])
  .then((response) => {
    // handle response
  })
  .catch((error) => {
    // handle error
  });
```

### with named parameters

```typescript
websocket.call('sum', { b: 1, a: 2 })
  .then((response) => {
    // handle response
  })
  .catch((error) => {
    // handle error
  });
```

## Send notification

Considering that the server has a method `log(message: string)`

```typescript
websocket.notify('log', ['a log message']);
```

## Define RPC method

```typescript
websocket.on('sum', (a: number, b: number) => {
  return a + b;
});
```

The defined RPC methods can also be called with both positional and named parameters.

### Minification/Obfuscation

For code that will be minified or obfuscated, pass the public parameter names as
the optional third argument to `on`:

```typescript
websocket.on('subtract', (x: number, y: number) => x - y, ['a', 'b']);
```

The list follows the callback's argument order: `a` maps to `x`, and `b` maps to `y`.
The order of keys in the request object does not matter:

```typescript
websocket.call('subtract', { b: 2, a: 5 })
  .then((response) => {
    // response.result is 3
  })
  .catch((error) => {
    // handle error
  });
```

Positional calls such as `websocket.call('subtract', [5, 2])` also work. The explicit
list defines both the parameter order and the required argument count, even if
minification renames or removes unused callback parameters. Names must be unique;
use an empty list for a method that takes no arguments. The list is copied when
the method is registered.

Without the third argument, existing registrations continue to infer named
parameters from the callback's source. Those names may change during minification
or obfuscation, so use explicit names for named calls in production bundles.
If property mangling is enabled, preserve the public keys in request objects too.

## Remove RPC method

```typescript
websocket.off('sum');
```

## Development

Use the Node.js version in `.nvmrc` and its bundled npm, then run:

```sh
npm ci
npm test
npm run lint
npm run format:check
npm run build
```

TypeScript checks both the library and tests. ESLint uses native flat configuration
with TypeScript and Jest rules. TypeScript stays on the latest 6.0 patch supported
by `typescript-eslint`; upgrading to TypeScript 7 requires its official support.
Tests live alongside the source and are excluded from build output.
`npm run update-all` respects peer dependency requirements when selecting updates.

These tooling requirements apply to development only. The published library still
targets ES2020 and has no runtime dependencies.

## Publishing

Releases are staged through GitHub Actions using
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/) (OIDC).
A maintainer approves each staged package on npm before it becomes publicly available.
