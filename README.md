[![📦 Build](https://github.com/fabriciobastian/jsonrpc-client-websocket/actions/workflows/build.yml/badge.svg)](https://github.com/fabriciobastian/jsonrpc-client-websocket/actions/workflows/build.yml) [![License](https://img.shields.io/github/license/fabriciobastian/jsonrpc-client-websocket)](https://choosealicense.com/licenses/mit/) [![NPM downloads](https://img.shields.io/npm/dt/jsonrpc-client-websocket.svg)](https://www.npmjs.com/package/jsonrpc-client-websocket)

![jsonrpc-client-websocket](https://github.com/fabriciobastian/jsonrpc-client-websocket/blob/master/assets/jsonrpc-client-websocket-banner-light-small.png?raw=true)

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

When using code minification/obfuscation the parameter names may change, which can
cause calls using named parameters to fail. To mitigate this you can do one or a
combination of the following:
- do not minify/obfuscate the code where `on` is used, so the function registration does not get modified
- use positional parameters
- register functions as following:

```typescript
websocket.on('sum', (params: { a: number; b: number }) => {
  return params.a + params.b;
});
```

and then call the function using positional parameters using the object:

```typescript
websocket.call('sum', [{ a: 1, b: 2 }])
  .then((response) => {
    // handle response
  })
  .catch((error) => {
    // handle error
  });
```

## Remove RPC method

```typescript
websocket.off('sum');
```
