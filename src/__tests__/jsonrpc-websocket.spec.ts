// tslint:disable: max-line-length
import { ErrorCallback, JsonRpcWebsocket, WebsocketReadyStates } from '../jsonrpc-websocket';
import { WS } from 'jest-websocket-mock';
import { JsonRpcError, JsonRpcErrorCodes, JsonRpcRequest, JsonRpcResponse, } from '../jsonrpc.model';
import { DeferredPromise } from '../deferred-promise';

const testUrl = 'ws://localhost:1234';
const requestTimeoutMs = 500;

const requestId = 1;
const jsonRpcVersion = '2.0';

function createErrorResponse(code: number, message: string): JsonRpcResponse {
	return {
		jsonrpc: jsonRpcVersion,
		id: requestId,
		error: createError(code, message)
	};
}

function createOkResponse(result: any) {
	return {
		jsonrpc: jsonRpcVersion,
		id: requestId,
		result: result
	};
}

function createError(code: number, message: string): JsonRpcError {
	return {
		code: code,
		message: message
	};
}

function createRequest(method: string, params?: any, id?: number): JsonRpcRequest {
	return {
		jsonrpc: jsonRpcVersion,
		id: id,
		method: method,
		params: params
	};
}

async function createServerAndJsonSocketAndConnect(onError?: ErrorCallback): Promise<[WS, JsonRpcWebsocket]> {
	const server = new WS(testUrl, {jsonProtocol: true});
	const websocket = new JsonRpcWebsocket(testUrl, requestTimeoutMs, onError);
	await websocket.open();
	await server.connected;
	return [server, websocket];
}

function closeSocketAndRestartServer(websocket: JsonRpcWebsocket): void {
	if (!!(websocket) && websocket.state === WebsocketReadyStates.OPEN) {
		websocket.close();
	}
	WS.clean();
}

describe('JSON RPC 2.0 Websocket not opened', () => {
	it('should throw when trying to send data and the socket is not opened', () => {
		const websocket = new JsonRpcWebsocket(testUrl, requestTimeoutMs);

		expect(websocket.call('test', ['any'])).rejects.toEqual(createError(JsonRpcErrorCodes.INTERNAL_ERROR, 'The websocket is not opened'));
		expect(() => websocket.notify('test', ['any'])).toThrowError(new Error('The websocket is not opened'));
		expect(() => websocket.respondOk(1, ['any'])).toThrowError(new Error('The websocket is not opened'));
	});
});

describe('JSON RPC 2.0 Websocket manage connection', () => {
	let websocket: JsonRpcWebsocket;
	let server: WS;

	beforeEach(async() => {
		[server, websocket] = await createServerAndJsonSocketAndConnect();
	});

	afterEach(() => {
		closeSocketAndRestartServer(websocket);
	});

	it('should create the socket', () => {
		expect(websocket).toBeTruthy();
	});

	it('should open/close the connection', async() => {
		websocket.open();
		await expect(server.connected).resolves.toBeTruthy();

		websocket.close();
		await expect(server.closed).resolves.toBeTruthy();
	});

	it('should return the correct state', async() => {
		expect(websocket.state).toBe(WebsocketReadyStates.OPEN);

		websocket.close();
		await server.closed;

		expect([WebsocketReadyStates.CLOSED, WebsocketReadyStates.CLOSING]).toContain(websocket.state);
	});
});

describe('JSON RPC 2.0 Websocket send requests', () => {
	let websocket: JsonRpcWebsocket;
	let server: WS;

	beforeEach(async() => {
		[server, websocket] = await createServerAndJsonSocketAndConnect();
	});

	afterEach(() => {
		closeSocketAndRestartServer(websocket);
	});

	it('should send notification', async() => {
		const expectedRequest = createRequest('test', ['any']);

		websocket.notify('test', ['any']);

		await expect(server).toReceiveMessage(expectedRequest);
	});

	it('should send request and timeout, if no response is provided', async() => {
		const expectedRequest = createRequest('test', ['any'], requestId);
		const expectedError = createErrorResponse(JsonRpcErrorCodes.REQUEST_TIMEOUT, `Request 1 exceeded the maximum time of ${requestTimeoutMs}ms and was aborted`);

		await expect(websocket.call('test', ['any'])).rejects.toEqual(expectedError);
		await expect(server).toReceiveMessage(expectedRequest);
	});

	it('should send request and receive response', async(done) => {
		const expectedRequest = createRequest('test', ['any'], requestId);
		const expectedResponse = createOkResponse('test success');

		websocket.call('test', ['any'])
			.then((actualResponse) => {
				expect(actualResponse).toEqual(expectedResponse);
				done();
			});

		await expect(server).toReceiveMessage(expectedRequest);
		server.send(expectedResponse);
	});

	it('should reject result if response has both error and result', async(done) => {
		const expectedRequest = createRequest('test', ['any'], requestId);

		const invalidResponse: JsonRpcResponse = {
			jsonrpc: websocket.jsonRpcVersion,
			id: requestId,
			error: { code: 1, message: 'any'},
			result: 'any'
		};

		const expectedRejectResponse = createErrorResponse(JsonRpcErrorCodes.INVALID_RESPONSE,
			`Invalid response. Either result or error must be set, but not both. ${JSON.stringify(invalidResponse)}`);

		websocket.call('test', ['any'])
			.catch((actualRejectResponse) => {
				expect(actualRejectResponse).toEqual(expectedRejectResponse);
				done();
			});

		await expect(server).toReceiveMessage(expectedRequest);
		server.send(invalidResponse);
	});

	it('should handle error responses', async(done) => {
		const expectedRequest = createRequest('test', ['any'], requestId);

		const expectedErrorResponse: JsonRpcResponse = {
			jsonrpc: websocket.jsonRpcVersion,
			id: requestId,
			error: { code: JsonRpcErrorCodes.INVALID_PARAMS, message: 'Invalid parameters'},
		};

		websocket.call('test', ['any'])
			.catch((actualErrorResponse) => {
				expect(actualErrorResponse).toEqual(expectedErrorResponse);
				done();
			});

		await expect(server).toReceiveMessage(expectedRequest);
		server.send(expectedErrorResponse);
	});
});

describe('JSON RPC 2.0 Websocket receive requests', () => {
	let websocket: JsonRpcWebsocket;
	let server: WS;

	beforeEach(async() => {
		[server, websocket] = await createServerAndJsonSocketAndConnect();
	});

	afterEach(() => {
		closeSocketAndRestartServer(websocket);
	});

	it('should call the registered method with positional parameters and respond the request', async() => {
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

	it('should call the registered method with named params and respond the request', async() => {
		const request = createRequest('sum', {b: 3, a: 2}, requestId);
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

	it('should respond with an error when the requested method is not found', async() => {
		const invalidMethodName = 'invalidMethod';

		const request = createRequest(invalidMethodName, void 0, requestId);
		const expectedResponse = createErrorResponse(JsonRpcErrorCodes.METHOD_NOT_FOUND, `Method \'${invalidMethodName}\' was not found`);

		server.send(request);

		await expect(server).toReceiveMessage(expectedResponse);
	});

	it('should repond with an error when the amount of positional parameters on the request do not match the amount of parameters in the registered method', async() => {
		const request = createRequest('sum', [2, 3, 4], requestId);
		const expectedResponse = createErrorResponse(JsonRpcErrorCodes.INVALID_PARAMS,
			`Invalid parameters. Method \'${request.method}\' expects 2 parameters, but got ${request.params.length}`);

		const sumCalled = new DeferredPromise<boolean>();
		websocket.on('sum', (a: number, b: number) => {
			sumCalled.resolve(true);
			return a + b;
		});

		server.send(request);

		await expect(server).toReceiveMessage(expectedResponse);
	});

	it('should repond with an error when the parameter names on the request do not match the names of the parameters in the registered method', async() => {
		const request = createRequest('sum', {a: 1, b2: 3}, requestId);
		const expectedResponse = createErrorResponse(JsonRpcErrorCodes.INVALID_PARAMS,
			`Invalid parameters. Method \'${request.method}\' expects parameters [a,b], but got [${Object.keys(request.params)}]`);

		const sumCalled = new DeferredPromise<boolean>();
		websocket.on('sum', (a: number, b: number) => {
			sumCalled.resolve(true);
			return a + b;
		});

		server.send(request);

		await expect(server).toReceiveMessage(expectedResponse);
	});

	it('should repond with an error when the amount of named parameters on the request do not match the amount of parameters in the registered method', async() => {
		const request = createRequest('sum', {a: 1, b: 3, c: 2}, requestId);
		const expectedResponse = createErrorResponse(JsonRpcErrorCodes.INVALID_PARAMS,
			`Invalid parameters. Method \'${request.method}\' expects parameters [a,b], but got [${Object.keys(request.params)}]`);

		const sumCalled = new DeferredPromise<boolean>();
		websocket.on('sum', (a: number, b: number) => {
			sumCalled.resolve(true);
			return a + b;
		});

		server.send(request);

		await expect(server).toReceiveMessage(expectedResponse);
	});

	it('should respond with an error if the protocol version does not match the expected version', async() => {
		const version = '1.0';

		const request = { jsonrpc: version, id: requestId, method: 'any' };
		const expectedResponse = createErrorResponse(JsonRpcErrorCodes.INVALID_REQUEST,
			`Invalid JSON RPC protocol version. Expecting ${websocket.jsonRpcVersion}, but got ${version}`);

		server.send(request);

		await expect(server).toReceiveMessage(expectedResponse);
	});
});

describe('JSON RPC 2.0 Websocket reports on error calback', () => {
	let websocket;
	let server;
	let callbackErrorPromise: DeferredPromise<boolean>;
	let callbackError: JsonRpcError;

	beforeEach(async() => {
		callbackErrorPromise = new DeferredPromise<boolean>();
		[server, websocket] = await createServerAndJsonSocketAndConnect(
			(error: JsonRpcError) => {
				callbackErrorPromise.resolve(true);
				callbackError = error;
			}
		);
	});

	afterEach(() => {
		closeSocketAndRestartServer(websocket);
	});

	it('should report error if not a request nor a response (id is missing)', async() => {
		const request = { jsonrpc: websocket.jsonRpcVersion, something: 'else' };

		const expectedError = createError(JsonRpcErrorCodes.INVALID_REQUEST, `Received unknown data: ${JSON.stringify(request)}`);

		server.send(request);

		await expect(callbackErrorPromise.asPromise()).resolves.toBeTruthy();
		expect(callbackError).toEqual(expectedError);
	});
});