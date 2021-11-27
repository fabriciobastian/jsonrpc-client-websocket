import { ErrorCallback, JsonRpcWebsocket, WebsocketReadyStates } from '../jsonrpc-websocket';
import { WS } from 'jest-websocket-mock';
import { JsonRpcError, JsonRpcErrorCodes, JsonRpcRequest, JsonRpcResponse } from '../jsonrpc.model';
import { DeferredPromise } from '../deferred-promise';

const testUrl = 'ws://localhost:1234';
const requestTimeoutMs = 500;

const requestId = 1;
const jsonRpcVersion = '2.0';

function createError(code: number, message: string): JsonRpcError {
  return {
    code: code,
    message: message,
  };
}

function createErrorResponse(code: number, message: string): JsonRpcResponse {
  return {
    jsonrpc: jsonRpcVersion,
    id: requestId,
    error: createError(code, message),
  };
}

function createOkResponse(result: unknown): JsonRpcResponse {
  return {
    jsonrpc: jsonRpcVersion,
    id: requestId,
    result: result,
  };
}

function createRequest(method: string, params?: unknown, id?: number): JsonRpcRequest {
  return {
    jsonrpc: jsonRpcVersion,
    id: id,
    method: method,
    params: params,
  };
}

async function createServerAndJsonSocketAndConnect(onError?: ErrorCallback): Promise<[WS, JsonRpcWebsocket]> {
  const server = new WS(testUrl, { jsonProtocol: true });
  const websocket = new JsonRpcWebsocket(testUrl, requestTimeoutMs, onError);
  await websocket.open();
  await server.connected;
  return [server, websocket];
}

async function closeSocketAndRestartServer(websocket: JsonRpcWebsocket): Promise<void> {
  if (!!websocket && websocket.state === WebsocketReadyStates.OPEN) {
    await websocket.close();
  }
  WS.clean();
}

describe('JSON RPC 2.0 Websocket not opened', () => {
  it('should throw when trying to send data and the socket is not opened', async () => {
    const websocket = new JsonRpcWebsocket(testUrl, requestTimeoutMs);

    await expect(websocket.call('test', ['any'])).rejects.toEqual(
      createError(JsonRpcErrorCodes.INTERNAL_ERROR, 'The websocket is not opened'),
    );
    expect(() => websocket.notify('test', ['any'])).toThrowError(new Error('The websocket is not opened'));
  });

  it('should reject open promise when fail to open connection', async () => {
    const websocket = new JsonRpcWebsocket(testUrl, requestTimeoutMs); // no server

    const openPromise = websocket.open();

    await expect(openPromise).rejects.toBeTruthy();
  });
});

describe('JSON RPC 2.0 Websocket manage connection', () => {
  let websocket: JsonRpcWebsocket;
  let server: WS;

  beforeEach(async () => {
    [server, websocket] = await createServerAndJsonSocketAndConnect();
  });

  afterEach(async () => {
    await closeSocketAndRestartServer(websocket);
  });

  it('should create the socket', () => {
    expect(websocket).toBeTruthy();
  });

  it('should open/close the connection', async () => {
    await websocket.open();
    await expect(server.connected).resolves.toBeTruthy();

    const closeEvent = await websocket.close();

    expect(closeEvent.code).toEqual(1000); // normal closure
    await server.closed;
  });

  it('should return the correct state', async () => {
    expect(websocket.state).toBe(WebsocketReadyStates.OPEN);

    await websocket.close();
    await server.closed;

    expect([WebsocketReadyStates.CLOSED, WebsocketReadyStates.CLOSING]).toContain(websocket.state);
  });

  it('should indicate that no websocket was opened, if no socket was opened when trying to close', async () => {
    await websocket.close();

    const closeEvent = await websocket.close();

    expect(closeEvent.type).toBe('No websocket was opened');
    expect(closeEvent.wasClean).toBeFalsy();
    expect(closeEvent.code).toBe(1005);
  });
});

describe('JSON RPC 2.0 Websocket send requests', () => {
  let websocket: JsonRpcWebsocket;
  let server: WS;

  beforeEach(async () => {
    [server, websocket] = await createServerAndJsonSocketAndConnect();
  });

  afterEach(async () => {
    await closeSocketAndRestartServer(websocket);
  });

  it('should send notification', async () => {
    const expectedRequest = createRequest('test', ['any']);

    websocket.notify('test', ['any']);

    await expect(server).toReceiveMessage(expectedRequest);
  });

  it('should send request and timeout if no response is provided', async () => {
    const expectedRequest = createRequest('test', ['any'], requestId);
    const expectedError = createErrorResponse(
      JsonRpcErrorCodes.REQUEST_TIMEOUT,
      `Request 1 exceeded the maximum time of ${requestTimeoutMs}ms and was aborted`,
    );

    await expect(websocket.call('test', ['any'])).rejects.toEqual(expectedError);
    await expect(server).toReceiveMessage(expectedRequest);
  });

  it('should send request and receive response', async () => {
    const expectedRequest = createRequest('test', ['any'], requestId);
    const expectedResponse = createOkResponse('test success');

    const actualResponse = websocket.call('test', ['any']);

    await expect(server).toReceiveMessage(expectedRequest);
    server.send(expectedResponse);

    expect(await actualResponse).toEqual(expectedResponse);
  });

  it('should reject result if response has both error and result', async () => {
    const expectedRequest = createRequest('test', ['any'], requestId);

    const invalidResponse: JsonRpcResponse = {
      jsonrpc: websocket.jsonRpcVersion,
      id: requestId,
      error: { code: 1, message: 'any' },
      result: 'any',
    };

    const expectedRejectResponse = createErrorResponse(
      JsonRpcErrorCodes.INVALID_RESPONSE,
      `Invalid response. Either result or error must be set, but not both. ${JSON.stringify(invalidResponse)}`,
    );

    const actualRejectResponse = websocket.call('test', ['any']);

    await expect(server).toReceiveMessage(expectedRequest);
    server.send(invalidResponse);

    await expect(actualRejectResponse).rejects.toEqual(expectedRejectResponse);
  });

  it('should handle error responses', async () => {
    const expectedRequest = createRequest('test', ['any'], requestId);

    const expectedErrorResponse: JsonRpcResponse = {
      jsonrpc: websocket.jsonRpcVersion,
      id: requestId,
      error: { code: JsonRpcErrorCodes.INVALID_PARAMS, message: 'Invalid parameters' },
    };

    const actualErrorResponse = websocket.call('test', ['any']);

    await expect(server).toReceiveMessage(expectedRequest);
    server.send(expectedErrorResponse);

    await expect(actualErrorResponse).rejects.toEqual(expectedErrorResponse);
  });
});

describe('JSON RPC 2.0 Websocket receive requests', () => {
  let websocket: JsonRpcWebsocket;
  let server: WS;

  beforeEach(async () => {
    [server, websocket] = await createServerAndJsonSocketAndConnect();
  });

  afterEach(async () => {
    await closeSocketAndRestartServer(websocket);
  });

  it('should call the registered method with positional parameters and respond the request', async () => {
    const request = createRequest('sum', [2, 3], requestId);
    const expectedResponse = createOkResponse(5);

    const sumCalled = new DeferredPromise<boolean>();
    websocket.on('sum', (a: number, b: number) => {
      sumCalled.resolve(true);
      return a + b;
    });

    server.send(request);

    await expect(sumCalled.asPromise()).resolves.toBeTruthy();
    await expect(server).toReceiveMessage(expectedResponse);
  });

  it('should call the registered method with named params and respond the request', async () => {
    const request = createRequest('sum', { b: 3, a: 2 }, requestId);
    const expectedResponse = createOkResponse(5);

    const sumCalled = new DeferredPromise<boolean>();
    websocket.on('sum', (a: number, b: number) => {
      sumCalled.resolve(true);
      return a + b;
    });

    server.send(request);

    await expect(sumCalled.asPromise()).resolves.toBeTruthy();
    await expect(server).toReceiveMessage(expectedResponse);
  });

  it('should call the registered method with boolean named params and respond the request', async () => {
    const request = createRequest('and', { b: true, a: false }, requestId);
    const expectedResponse = createOkResponse(false);

    const andCalled = new DeferredPromise<boolean>();
    websocket.on('and', (a: boolean, b: boolean) => {
      andCalled.resolve(true);
      return a && b;
    });

    server.send(request);

    await expect(server).toReceiveMessage(expectedResponse);
    await expect(andCalled.asPromise()).resolves.toBeTruthy();
  });

  it('should call a method which has no parameters', async () => {
    const request = createRequest('noParametersMethod', undefined, requestId);
    const expectedResponse = createOkResponse(undefined);

    const noParametersMethodCalled = new DeferredPromise<boolean>();
    websocket.on('noParametersMethod', () => {
      noParametersMethodCalled.resolve(true);
    });
    server.send(request);

    await expect(noParametersMethodCalled.asPromise()).resolves.toBeTruthy();
    await expect(server).toReceiveMessage(expectedResponse);
  });

  it('should not respond to notifications', async () => {
    const request = createRequest('notification'); // no id

    const notificationMethodCalled = new DeferredPromise<boolean>();
    websocket.on('notification', () => {
      notificationMethodCalled.resolve(true);
    });
    server.send(request);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sendSpy = jest.spyOn((websocket as any).websocket, 'send');
    // the above is not great, but it is unfortunatelly difficult test the absence
    // of a response. Therefore, I have chosen to spy on a private method.

    await expect(notificationMethodCalled.asPromise()).resolves.toBeTruthy();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it('should unregister a method and respond with an error if the unregistered method is called', async () => {
    const unregisteredMethodName = 'unregisteredMethod';

    websocket.on(unregisteredMethodName, () => '');
    websocket.off(unregisteredMethodName);

    const request = createRequest(unregisteredMethodName, undefined, requestId);
    const expectedResponse = createErrorResponse(
      JsonRpcErrorCodes.METHOD_NOT_FOUND,
      `Method '${unregisteredMethodName}' was not found`,
    );
    server.send(request);

    await expect(server).toReceiveMessage(expectedResponse);
  });

  it('should respond with an error when the requested method is not found', async () => {
    const invalidMethodName = 'invalidMethod';

    const request = createRequest(invalidMethodName, undefined, requestId);
    const expectedResponse = createErrorResponse(
      JsonRpcErrorCodes.METHOD_NOT_FOUND,
      `Method '${invalidMethodName}' was not found`,
    );

    server.send(request);

    await expect(server).toReceiveMessage(expectedResponse);
  });

  it('should respond with an error when the amount of positional parameters on the request do not match the amount of parameters in the registered method', async () => {
    const request = createRequest('sum', [2, 3, 4], requestId);
    const expectedResponse = createErrorResponse(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Invalid parameters. Method '${request.method}' expects 2 parameters, but got ${request.params.length}`,
    );

    websocket.on('sum', (a: number, b: number) => {
      return a + b;
    });

    server.send(request);

    await expect(server).toReceiveMessage(expectedResponse);
  });

  it('should respond with an error when the parameter names on the request do not match the names of the parameters in the registered method', async () => {
    const request = createRequest('sum', { a: 1, b2: 3 }, requestId);
    const expectedResponse = createErrorResponse(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Invalid parameters. Method '${request.method}' expects parameters [a,b], but got [${Object.keys(
        request.params,
      )}]`,
    );

    websocket.on('sum', (a: number, b: number) => {
      return a + b;
    });

    server.send(request);

    await expect(server).toReceiveMessage(expectedResponse);
  });

  it('should respond with an error when the amount of named parameters on the request do not match the amount of parameters in the registered method', async () => {
    const request = createRequest('sum', { a: 1, b: 3, c: 2 }, requestId);
    const expectedResponse = createErrorResponse(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Invalid parameters. Method '${request.method}' expects parameters [a,b], but got [${Object.keys(
        request.params,
      )}]`,
    );

    websocket.on('sum', (a: number, b: number) => {
      return a + b;
    });

    server.send(request);

    await expect(server).toReceiveMessage(expectedResponse);
  });

  it('should respond with an error if the protocol version does not match the expected version', async () => {
    const version = '1.0';

    const request = { jsonrpc: version, id: requestId, method: 'any' };
    const expectedResponse = createErrorResponse(
      JsonRpcErrorCodes.INVALID_REQUEST,
      `Invalid JSON RPC protocol version. Expecting ${websocket.jsonRpcVersion}, but got ${version}`,
    );

    server.send(request);

    await expect(server).toReceiveMessage(expectedResponse);
  });

  it('should respond with an error if the parameters argument is not an array or an object', async () => {
    const request = createRequest('sum', 1, requestId);
    const expectedResponse = createErrorResponse(
      JsonRpcErrorCodes.INVALID_PARAMS,
      `Invalid parameters. Expected array or object, but got ${typeof request.params}`,
    );

    const sumCalled = new DeferredPromise<boolean>();
    websocket.on('sum', (a: number, b: number) => {
      sumCalled.resolve(true);
      return a + b;
    });

    server.send(request);

    await expect(server).toReceiveMessage(expectedResponse);
  });

  it('should respond with an error if the called method throws an exception', async () => {
    const methodErrorMessage = 'This method always throw an exception';

    const request = createRequest('throwError', undefined, requestId);
    const expectedResponse = createErrorResponse(
      JsonRpcErrorCodes.REQUEST_FAILED,
      `Method 'throwError' has thrown: '${methodErrorMessage}'`,
    );

    websocket.on('throwError', () => {
      throw new Error(methodErrorMessage);
    });

    server.send(request);

    await expect(server).toReceiveMessage(expectedResponse);
  });
});

describe('JSON RPC 2.0 Websocket reports on error callback', () => {
  let websocket;
  let server;
  let callbackErrorPromise: DeferredPromise<boolean>;
  let callbackError: JsonRpcError;

  beforeEach(async () => {
    callbackErrorPromise = new DeferredPromise<boolean>();
    [server, websocket] = await createServerAndJsonSocketAndConnect((error: JsonRpcError) => {
      callbackErrorPromise.resolve(true);
      callbackError = error;
    });
  });

  afterEach(async () => {
    await closeSocketAndRestartServer(websocket);
  });

  it('should report error if not a request nor a response (id is missing)', async () => {
    const request = { jsonrpc: websocket.jsonRpcVersion, something: 'else' };

    const expectedError = createError(
      JsonRpcErrorCodes.INVALID_REQUEST,
      `Received unknown data: ${JSON.stringify(request)}`,
    );

    server.send(request);

    await expect(callbackErrorPromise.asPromise()).resolves.toBeTruthy();
    expect(callbackError).toEqual(expectedError);
  });

  it('should report error if response id does not match any request', async () => {
    const response = { jsonrpc: websocket.jsonRpcVersion, id: 1, result: 'some-result' };

    const expectedError = createError(
      JsonRpcErrorCodes.INTERNAL_ERROR,
      `Received a response with id ${response.id}, which does not match any requests made by this client`,
    );

    server.send(response);

    await expect(callbackErrorPromise.asPromise()).resolves.toBeTruthy();
    expect(callbackError).toEqual(expectedError);
  });
});
