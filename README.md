# jsonrpc-client-websocket

A websocket client that implements the JSON RPC 2.0 protocol

## Open connection

```typescript
    const websocketUrl = "ws://mywebsocketurl:port"
    const requestTimeoutMs = 2000;
    const websocket = new JsonRpcWebsocket(
        websocketUrl,
        requestTimeoutMs,
        (error: JsonRpcError) => { /* handle error */ });
    await websocket.open();
```
Requests that do not receive a response within the specified timeout will fail with a REQUEST_TIMEOUT code.
The callback (optional) is used for eventual errors, such as receiving a response that does not match any request id and
connection errors. Furthermore, all errors that are sent to an eventual caller are also reported on the callback, e.g.
if an rpc method is called with an invalid number of parameters, etc...

## Close connection

```typescript
    websocket.close();
```

## Call RPC method or send notification

Considering that the server has a method `sum(a: int, b: int)`

```typescript
    websocket.call('sum', [1,2])
        .then((response) => {
            // handle response
        })
        .catch((error) => {
            // handle error
        });
```

or a method `log(message: string)`

```typescript
    websocket.notify('log', ['a log message']);
```

## Define RPC method

```typescript
    websocket.on('sum', (a: number, b: number) => {
        return a + b;
    });
```
For now, only positional parameter calls are supported (named arguments is not supported).

