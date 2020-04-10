import * as getParameterNames from 'get-parameter-names';
import { DeferredPromise } from './deferred-promise';
import { JsonRpcError, JsonRpcErrorCodes, JsonRpcRequest, JsonRpcResponse } from './jsonrpc.model';

export enum WebsocketReadyStates {
  CONNECTING = 0,
  OPEN = 1,
  CLOSING = 2,
  CLOSED = 3,
}

interface PendingRequest {
  request: JsonRpcRequest;
  response: DeferredPromise<JsonRpcResponse>;
  timeout: number;
}

export type ErrorCallback = (error: JsonRpcError) => void;

export class JsonRpcWebsocket {
  public jsonRpcVersion = '2.0';

  private websocket: WebSocket;
  private closeDeferredPromise: DeferredPromise<CloseEvent>;

  private requestId = 0;
  private pendingRequests: {
    [id: number]: PendingRequest;
  };

  private rpcMethods: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    [name: string]: (...args: any) => any;
  };

  constructor(private url: string, private requestTimeoutMs: number, private onError?: ErrorCallback) {
    this.pendingRequests = {};
    this.rpcMethods = {};
  }

  public open(): Promise<Event> {
    // See https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent for close event codes

    if (this.websocket) {
      this.close();
    }

    // this.websocket = new WebSocket(this.url, ['jsonrpc-2.0']);
    this.websocket = new WebSocket(this.url);

    const openDeferredPromise = new DeferredPromise<Event>();
    this.closeDeferredPromise = new DeferredPromise<CloseEvent>();

    this.websocket.onopen = (event): void => {
      openDeferredPromise.resolve(event);
    };

    this.websocket.onerror = (err): void => {
      openDeferredPromise.reject(err);
    };

    this.websocket.onclose = (event): void => {
      this.websocket = void 0;

      if (event.code !== 1000) {
        // 1000 = normal closure
        const error: JsonRpcError = {
          code: event.code,
          data: event,
          message: event.reason,
        };

        this.callOnError(error);
      }

      this.closeDeferredPromise.resolve(event);
    };

    this.websocket.onmessage = (message: MessageEvent): void => this.handleMessage(message.data);

    return openDeferredPromise.asPromise();
  }

  public close(): Promise<CloseEvent> {
    if (this.websocket === void 0) {
      return;
    }

    this.websocket.close(1000); // 1000 = normal closure
    this.websocket = void 0;

    return this.closeDeferredPromise.asPromise();
  }

  public get state(): WebsocketReadyStates {
    return this.websocket ? this.websocket.readyState : WebsocketReadyStates.CLOSED;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public on(methodName: string, callback: (...args: any[]) => any): void {
    this.rpcMethods[methodName.toLowerCase()] = callback; // case-insensitive!
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public call(method: string, params?: any): Promise<JsonRpcResponse> {
    if (!this.websocket || this.state !== WebsocketReadyStates.OPEN) {
      return Promise.reject({ code: JsonRpcErrorCodes.INTERNAL_ERROR, message: 'The websocket is not opened' });
    }

    const request: JsonRpcRequest = {
      id: this.getRequestId(),
      jsonrpc: this.jsonRpcVersion,
      method,
      params,
    };

    try {
      this.websocket.send(JSON.stringify(request));
    } catch (e) {
      return Promise.reject({ code: JsonRpcErrorCodes.INTERNAL_ERROR, message: `Internal error. ${e}` });
    }

    return this.createPendingRequest(request);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public notify(method: string, params?: any): void {
    if (!this.websocket || this.state !== WebsocketReadyStates.OPEN) {
      throw new Error('The websocket is not opened');
    }

    const request: JsonRpcRequest = {
      jsonrpc: this.jsonRpcVersion,
      method,
      params,
    };

    try {
      this.websocket.send(JSON.stringify(request));
    } catch (e) {
      throw Error(e);
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public respondOk(id: number, result: any): void {
    this.respond(id, result);
  }

  public respondError(id: number, error: JsonRpcError): void {
    this.respond(id, void 0, error);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private respond(id: number, result?: any, error?: JsonRpcError): void {
    if (!this.websocket || this.state !== WebsocketReadyStates.OPEN) {
      throw new Error('The websocket is not opened');
    }

    if (!!result && !!error) {
      throw new Error('Invalid response. Either result or error must be set, but not both');
    }

    const response: JsonRpcResponse = {
      error,
      id,
      jsonrpc: this.jsonRpcVersion,
      result,
    };

    try {
      this.websocket.send(JSON.stringify(response));
    } catch (e) {
      throw Error(e);
    }
  }

  private handleMessage(msg: string): void {
    let data = null;
    try {
      data = JSON.parse(msg);
    } catch (e) {
      this.handleError(JsonRpcErrorCodes.PARSE_ERROR, `Invalid JSON was received. ${e}`);
      return;
    }

    const isResponse =
      !!data && this.hasProperty(data, 'id') && (this.hasProperty(data, 'result') || this.hasProperty(data, 'error'));
    const isRequest = !!data && this.hasProperty(data, 'method');

    const requestId = isRequest && data.id ? data.id : void 0;

    if (!data.jsonrpc || data.jsonrpc !== this.jsonRpcVersion) {
      this.handleError(
        JsonRpcErrorCodes.INVALID_REQUEST,
        `Invalid JSON RPC protocol version. Expecting ${this.jsonRpcVersion}, but got ${data.jsonrpc}`,
        requestId,
      );
      return;
    }

    if (isResponse) {
      this.handleResponse(data as JsonRpcResponse);
    } else if (isRequest) {
      this.handleRequest(data as JsonRpcRequest);
    } else {
      this.handleError(JsonRpcErrorCodes.INVALID_REQUEST, `Received unknown data: ${JSON.stringify(data)}`, requestId);
    }
  }

  private handleRequest(request: JsonRpcRequest): void {
    const method = this.rpcMethods[request.method.toLowerCase()]; // case-insensitive!
    if (!method) {
      this.handleError(JsonRpcErrorCodes.METHOD_NOT_FOUND, `Method '${request.method}' was not found`, request.id);
      return;
    }

    let requestParams = [];
    try {
      requestParams = this.getRequestParams(method, request);
    } catch (error) {
      this.handleError(JsonRpcErrorCodes.INVALID_PARAMS, error.message, request.id);
      return;
    }

    const result = method(...requestParams); // only positional arguments are supported (no named arguments)
    if (request.id) {
      this.respondOk(request.id, result ? result : {});
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getRequestParams(method: (...args: any) => any, request: JsonRpcRequest): any[] {
    let requestParams = [];
    if (request.params) {
      if (request.params instanceof Array) {
        if (method.length !== request.params.length) {
          throw new Error(
            `Invalid parameters. Method '${request.method}' expects ${method.length} parameters, but got ${request.params.length}`
          );
        }
        requestParams = request.params;
      } else if (request.params instanceof Object) {
        const parameterNames = getParameterNames(method);

        if (method.length !== Object.keys(request.params).length) {
          throw new Error(
            `Invalid parameters. Method '${request.method}' expects parameters [${parameterNames}], but got [${Object.keys(request.params)}]`
          );
        }

        parameterNames.forEach(paramName => {
          const paramValue = request.params[paramName];
          if (!paramValue) {
            throw new Error(
              `Invalid parameters. Method '${request.method}' expects parameters [${parameterNames}], but got [${Object.keys(request.params)}]`
            );
          }
          requestParams.push(paramValue);
        });
      } else {
        throw new Error(`Invalid parameters. Expected array or object, but got ${typeof request.params}`);
      }
    }
    return requestParams;
  }

  private handleResponse(response: JsonRpcResponse): void {
    const activeRequest = this.pendingRequests[response.id];
    if (activeRequest === void 0) {
      this.callOnError({
        code: JsonRpcErrorCodes.INTERNAL_ERROR,
        message: `Received a response with id ${response.id}, which does not match any requests made by this client`,
      });
      return;
    }

    self.clearTimeout(activeRequest.timeout);

    if (this.hasProperty(response, 'result') && this.hasProperty(response, 'error')) {
      const errorResponse: JsonRpcResponse = {
        error: {
          code: JsonRpcErrorCodes.INVALID_RESPONSE,
          message: `Invalid response. Either result or error must be set, but not both. ${JSON.stringify(response)}`,
        },
        id: activeRequest.request.id,
        jsonrpc: this.jsonRpcVersion,
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

  private handleError(code: number, message: string, requestId?: number): void {
    const error: JsonRpcError = { code, message };
    this.callOnError(error);
    if (requestId) {
      this.respondError(requestId, error);
    }
  }

  private createPendingRequest(request): Promise<JsonRpcResponse> {
    const response = new DeferredPromise<JsonRpcResponse>();
    this.pendingRequests[request.id] = {
      request,
      response,
      timeout: this.setupRequestTimeout(request.id),
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
        error: {
          code: JsonRpcErrorCodes.REQUEST_TIMEOUT,
          message: `Request ${activeRequest.request.id} exceeded the maximum time of ${this.requestTimeoutMs}ms and was aborted`,
        },
        id: activeRequest.request.id,
        jsonrpc: this.jsonRpcVersion,
      };

      delete this.pendingRequests[requestId];

      activeRequest.response.reject(response);
    }, this.requestTimeoutMs);
  }

  private callOnError(error: JsonRpcError): void {
    if (this.onError !== void 0) {
      this.onError(error);
    }
  }

  private getRequestId(): number {
    return ++this.requestId;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private hasProperty(object: any, propertyName: string): boolean {
    return !!Object.prototype.hasOwnProperty.call(object, propertyName);
  }
}
