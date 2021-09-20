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

let websocketFactory: ((url: string) => WebSocket) | null;

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

  public get state(): WebsocketReadyStates {
    return this.websocket ? this.websocket.readyState : WebsocketReadyStates.CLOSED;
  }

  public static setWebSocketFactory(factoryFn: ((url: string) => WebSocket) | null): void {
    websocketFactory = factoryFn;
  }

  constructor(private url: string, private requestTimeoutMs: number, private onError?: ErrorCallback) {
    this.pendingRequests = {};
    this.rpcMethods = {};
  }

  public async open(): Promise<Event> {
    if (this.websocket) {
      await this.close();
    }

    return this.createWebsocket();
  }

  public close(): Promise<CloseEvent | boolean> {
    if (this.websocket === undefined) {
      return Promise.resolve(
        globalThis.CloseEvent ? new CloseEvent('No websocket was opened', { wasClean: false, code: 1005 }) : true,
      );
    }

    this.websocket.close(1000); // 1000 = normal closure
    this.websocket = undefined;

    return this.closeDeferredPromise.asPromise();
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  public on(methodName: string, callback: (...args: any[]) => any): void {
    this.rpcMethods[methodName.toLowerCase()] = callback; // case-insensitive!
  }

  public off(methodName: string): void {
    delete this.rpcMethods[methodName.toLowerCase()]; // case-insensitive!
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
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
      // istanbul ignore next
      return Promise.reject({ code: JsonRpcErrorCodes.INTERNAL_ERROR, message: `Internal error. ${e}` });
    }

    return this.createPendingRequest(request);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/explicit-module-boundary-types
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
      // istanbul ignore next
      throw Error(e);
    }
  }

  private createWebsocket(): Promise<Event> {
    // See https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent for close event codes

    // this.websocket = new WebSocket(this.url, ['jsonrpc-2.0']);
    if (websocketFactory) {
      this.websocket = websocketFactory(this.url);
    } else {
      this.websocket = new WebSocket(this.url);
    }

    const openDeferredPromise = new DeferredPromise<Event>();
    this.closeDeferredPromise = new DeferredPromise<CloseEvent>();

    this.websocket.onopen = (event): void => {
      openDeferredPromise.resolve(event);
    };

    this.websocket.onerror = (err): void => {
      openDeferredPromise.reject(err);
    };

    this.websocket.onclose = (event): void => {
      this.websocket = undefined;

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

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private respondOk(id: number, result: any): void {
    this.respond(id, result);
  }

  private respondError(id: number, error: JsonRpcError): void {
    this.respond(id, undefined, error);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private respond(id: number, result?: any, error?: JsonRpcError): void {
    // istanbul ignore if
    if (!this.websocket || this.state !== WebsocketReadyStates.OPEN) {
      throw new Error('The websocket is not opened');
    }

    // istanbul ignore if
    if (!!result && !!error) {
      throw new Error('Invalid response. Either result or error must be set, but not both');
    }

    const response: JsonRpcResponse = {
      jsonrpc: this.jsonRpcVersion,
      error: error,
      id: id,
      result: result,
    };

    try {
      this.websocket.send(JSON.stringify(response));
    } catch (e) {
      // istanbul ignore next
      throw Error(e);
    }
  }

  private handleMessage(msg: string): void {
    let data = null;
    try {
      data = JSON.parse(msg);
    } catch (e) /* istanbul ignore next */ {
      this.handleError(JsonRpcErrorCodes.PARSE_ERROR, `Invalid JSON was received. ${e}`);
      return;
    }

    const isResponse =
      !!data && this.hasProperty(data, 'id') && (this.hasProperty(data, 'result') || this.hasProperty(data, 'error'));
    const isRequest = !!data && this.hasProperty(data, 'method');

    const requestId = isRequest && data.id ? data.id : undefined;

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

    try {
      const result = method(...requestParams);
      if (request.id) {
        this.respondOk(request.id, result);
      }
    } catch (e) {
      if (request.id) {
        this.respondError(request.id, e);
      }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private getRequestParams(method: (...args: any) => any, request: JsonRpcRequest): any[] {
    let requestParams = [];
    if (request.params) {
      if (request.params instanceof Array) {
        if (method.length !== request.params.length) {
          throw new Error(
            `Invalid parameters. Method '${request.method}' expects ${method.length} parameters, but got ${request.params.length}`,
          );
        }
        requestParams = request.params;
      } else if (request.params instanceof Object) {
        const parameterNames = getParameterNames(method);

        if (method.length !== Object.keys(request.params).length) {
          throw new Error(
            `Invalid parameters. Method '${
              request.method
            }' expects parameters [${parameterNames}], but got [${Object.keys(request.params)}]`,
          );
        }

        parameterNames.forEach((paramName) => {
          const paramValue = request.params[paramName];
          if (paramValue === undefined) {
            throw new Error(
              `Invalid parameters. Method '${
                request.method
              }' expects parameters [${parameterNames}], but got [${Object.keys(request.params)}]`,
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
    if (activeRequest === undefined) {
      this.callOnError({
        code: JsonRpcErrorCodes.INTERNAL_ERROR,
        message: `Received a response with id ${response.id}, which does not match any requests made by this client`,
      });
      return;
    }

    clearTimeout(activeRequest.timeout);

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
    return setTimeout(() => {
      const activeRequest = this.pendingRequests[requestId];

      // istanbul ignore if
      if (activeRequest === undefined) {
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
    }, this.requestTimeoutMs) as unknown as number;
  }

  private callOnError(error: JsonRpcError): void {
    if (this.onError !== undefined) {
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
