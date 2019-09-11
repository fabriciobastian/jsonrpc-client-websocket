import { JsonRpcError, JsonRpcRequest, JsonRpcResponse, JsonRpcErrorCodes } from './jsonrpc.model';
import { DeferredPromise } from './deferred-promise';

export enum WebsocketReadyStates {
	CONNECTING = 0,
	OPEN = 1,
	CLOSING = 2,
	CLOSED = 3
}

interface IPendingRequest {
	request: JsonRpcRequest;
	response: DeferredPromise<JsonRpcResponse>;
	timeout: number;
}

type ErrorCallback = (error: JsonRpcError) => void;

export class JsonRpcWebsocket {
	public jsonRpcVersion = '2.0';

	private websocket: WebSocket;

	private requestId = 0;
	private pendingRequests: {
		[id: number]: IPendingRequest;
	};

	private rpcMethods: {
		[name: string]: (...args: any) => any
	};

	public onError: ErrorCallback;

	constructor(private url: string, private requestTimeoutMs: number) {
		this.pendingRequests = {};
		this.rpcMethods = {};
	}

	public open(): Promise<Event> {
		// See https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent for close event codes

		if (!!(this.websocket)) {
			this.close();
		}

		// this.websocket = new WebSocket(this.url, ['jsonrpc-2.0']);
		this.websocket = new WebSocket(this.url);

		const openDeferredPromise = new DeferredPromise<Event>();

		this.websocket.onopen = (event) => {
			openDeferredPromise.resolve(event);
		};

		this.websocket.onerror = (err) => {
			openDeferredPromise.reject(err);
		};

		this.websocket.onclose = (event) => {
			this.websocket = void 0;

			if (event.code !== 1000) { // 1000 = normal closure
				const error: JsonRpcError = {
					code: event.code,
					message: event.reason,
					data: event
				};

				this.errorCallback(error);
			}
		};

		this.websocket.onmessage = (message: MessageEvent) => this.handleMessage(message.data);

		return openDeferredPromise.asPromise();
	}

	public close() {
		if (this.websocket === void 0) {
			return;
		}

		this.websocket.close();
		this.websocket = void 0;
	}

	public get state(): WebsocketReadyStates {
		return !!(this.websocket) ? this.websocket.readyState : WebsocketReadyStates.CLOSED;
	}

	public on(methodName: string, callback: (...args: any[]) => any): void {
		this.rpcMethods[methodName.toLowerCase()] = callback; // case-insensitive!
	}

	public call(method: string, params?: any): Promise<JsonRpcResponse> {
		if (!this.websocket || this.state !== WebsocketReadyStates.OPEN) {
			return Promise.reject({ code: JsonRpcErrorCodes.INTERNAL_ERROR, message: 'The websocket is not opened' });
		}

		const request: JsonRpcRequest = {
			jsonrpc: this.jsonRpcVersion,
			id: this.getRequestId(),
			method: method,
			params: params
		};

		try {
			this.websocket.send(JSON.stringify(request));
		} catch (e) {
			return Promise.reject({ code: JsonRpcErrorCodes.INTERNAL_ERROR, message: `Internal error. ${e}` });
		}

		return this.createPendingRequest(request);
	}

	public notify(method: string, params?: any) {
		if (!this.websocket || this.state !== WebsocketReadyStates.OPEN) {
			throw new Error('The websocket is not opened');
		}

		const request: JsonRpcRequest = {
			jsonrpc: this.jsonRpcVersion,
			method: method,
			params: params
		};

		try {
			this.websocket.send(JSON.stringify(request));
		} catch (e) {
			throw Error(e);
		}
	}

	public respondOk(id: number, result: any) {
		this.respond(id, result);
	}

	public respondError(id: number, error: JsonRpcError) {
		this.respond(id, void 0, error);
	}

	private respond(id: number, result?: any, error?: JsonRpcError) {
		if (!this.websocket || this.state !== WebsocketReadyStates.OPEN) {
			throw new Error('The websocket is not opened');
		}

		if (!!(result) && !!(error)) {
			throw new Error('Invalid response. Either result or error must be set, but not both');
		}

		const response: JsonRpcResponse = {
			jsonrpc: this.jsonRpcVersion,
			id: id,
			result: result,
			error: error
		};

		try {
			this.websocket.send(JSON.stringify(response));
		} catch (e) {
			throw Error(e);
		}
	}

	private handleMessage(msg: any) {
		let data = null;
		try {
			data = JSON.parse(msg);
		} catch (e) {
			this.handleError(JsonRpcErrorCodes.PARSE_ERROR, `Invalid JSON was received. ${e}`);
			return;
		}

		const isResponse = !!(data) && (this.hasProperty(data, 'result') || this.hasProperty(data, 'error') && this.hasProperty(data, 'id'));
		const isRequest = !!(data) && this.hasProperty(data, 'method');

		const requestId = isRequest && data.id ? data.id : void 0;

		if (!(data.jsonrpc) || data.jsonrpc !== this.jsonRpcVersion) {
			this.handleError(
				JsonRpcErrorCodes.INVALID_REQUEST,
				`Invalid JSON RPC protocol version. Expecting ${this.jsonRpcVersion}, but got ${data.jsonrpc}`,
				requestId);
			return;
		}

		if (isResponse) {
			this.handleResponse(data as JsonRpcResponse);
		} else if (isRequest) {
			this.handleRequest(data as JsonRpcRequest);
		} else {
			this.handleError(
				JsonRpcErrorCodes.INVALID_REQUEST,
				`Received unknown data: ${JSON.stringify(data)}`,
				requestId);
		}
	}

	private handleRequest(request: JsonRpcRequest) {
		const method = this.rpcMethods[request.method.toLowerCase()]; // case-insensitive!
		if (!method) {
			this.handleError(JsonRpcErrorCodes.METHOD_NOT_FOUND, `Method \'${request.method}\' was not found`, request.id);
			return;
		}

		const requestParams = (request.params) ? request.params : [];
		const nbrReqParams = requestParams.length;

		if (method.length !== nbrReqParams) {
			this.handleError(
				JsonRpcErrorCodes.INVALID_PARAMS,
				`Invalid parameters. Method \'${request.method}\' expects ${method.length} parameters, but got ${nbrReqParams}`,
				request.id);
			return;
		}

		const result = method(...requestParams); // only positional arguments are supported (no named arguments)
		if (request.id) {
			this.respondOk(request.id, result ? result : {});
		}
	}

	private handleResponse(response: JsonRpcResponse) {
		const activeRequest = this.pendingRequests[response.id];
		if (activeRequest === void 0) {
			this.errorCallback({
				code: JsonRpcErrorCodes.INTERNAL_ERROR,
				message: `Received a response with id ${response.id}, which does not match any requests made by this client`
			});
			return;
		}

		self.clearTimeout(activeRequest.timeout);

		if (this.hasProperty(response, 'result') && this.hasProperty(response, 'error')) {
			const errorResponse: JsonRpcResponse = {
				jsonrpc: this.jsonRpcVersion,
				id: activeRequest.request.id,
				error: {
					code: JsonRpcErrorCodes.INVALID_RESPONSE,
					message: `Invalid response. Either result or error must be set, but not both. ${JSON.stringify(response)}`
				}
			};
			activeRequest.response.reject(errorResponse);
			return;
		}

		if (this.hasProperty(response, 'error')) {
			activeRequest.response.reject(response);
		} else {
			activeRequest.response.resolve(response);
		}
	}

	private handleError(code: number, message: string, requestId?: number) {
		const error: JsonRpcError = {code: code, message: message};
		this.errorCallback(error);
		if (requestId) {
			this.respondError(requestId, error);
		}
	}

	private createPendingRequest(request): Promise<JsonRpcResponse> {
		const response = new DeferredPromise<JsonRpcResponse>();
		this.pendingRequests[request.id] = {
			request: request,
			response: response,
			timeout: this.setupRequestTimeout(request.id)
		};
		return response.asPromise();
	}

	private setupRequestTimeout(requestId: number): number {
		return self.setTimeout(() => {
			const activeRequest = this.pendingRequests[requestId];
			if (activeRequest === void 0) {
				return;
			}

			const response: JsonRpcResponse = {
				jsonrpc: this.jsonRpcVersion,
				id: activeRequest.request.id,
				error: {
					code: JsonRpcErrorCodes.INTERNAL_ERROR,
					message: `Request ${activeRequest.request.id} exceeded the maximum time of ${this.requestTimeoutMs}ms and was aborted`
				}
			};

			delete this.pendingRequests[requestId];

			activeRequest.response.reject(response);
		}, this.requestTimeoutMs);
	}

	private errorCallback(error: JsonRpcError) {
		if (this.onError != void 0) {
			this.onError(error);
		}
	}

	private getRequestId() {
		return ++this.requestId;
	}

	private hasProperty (object: any, propertyName: string) {
		return Object.prototype.hasOwnProperty.call(object, propertyName);
	}
}
