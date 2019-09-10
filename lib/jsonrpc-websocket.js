"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const jsonrpc_model_1 = require("./jsonrpc.model");
const rxjs_1 = require("rxjs");
const deferred_promise_1 = require("./deferred-promise");
var WebsocketReadyStates;
(function (WebsocketReadyStates) {
    WebsocketReadyStates[WebsocketReadyStates["CONNECTING"] = 0] = "CONNECTING";
    WebsocketReadyStates[WebsocketReadyStates["OPEN"] = 1] = "OPEN";
    WebsocketReadyStates[WebsocketReadyStates["CLOSING"] = 2] = "CLOSING";
    WebsocketReadyStates[WebsocketReadyStates["CLOSED"] = 3] = "CLOSED";
})(WebsocketReadyStates = exports.WebsocketReadyStates || (exports.WebsocketReadyStates = {}));
class JsonRpcWebsocket {
    constructor(url, requestTimeoutMs) {
        this.url = url;
        this.requestTimeoutMs = requestTimeoutMs;
        this.jsonRpcVersion = '2.0';
        this.requestId = 0;
        this.onError$ = new rxjs_1.ReplaySubject(1);
        this.pendingRequests = {};
        this.rpcMethods = {};
    }
    open() {
        // See https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent for close event codes
        if (!!(this.websocket)) {
            this.close();
        }
        // this.websocket = new WebSocket(this.url, ['jsonrpc-2.0']);
        this.websocket = new WebSocket(this.url);
        const openDeferredPromise = new deferred_promise_1.DeferredPromise();
        this.websocket.onopen = (event) => {
            openDeferredPromise.resolve(event);
        };
        this.websocket.onerror = (err) => {
            openDeferredPromise.reject(err);
        };
        this.websocket.onclose = (event) => {
            this.websocket = void 0;
            if (event.code !== 1000) { // 1000 = normal closure
                const error = {
                    code: event.code,
                    message: event.reason,
                    data: event
                };
                this.onError$.next(error);
            }
        };
        this.websocket.onmessage = (message) => this.handleMessage(message.data);
        return openDeferredPromise.asPromise();
    }
    close() {
        if (this.websocket === void 0) {
            return;
        }
        this.websocket.close();
        this.websocket = void 0;
    }
    get state() {
        return !!(this.websocket) ? this.websocket.readyState : WebsocketReadyStates.CLOSED;
    }
    on(methodName, callback) {
        this.rpcMethods[methodName.toLowerCase()] = callback; // case-insensitive!
    }
    call(method, params) {
        if (this.state !== WebsocketReadyStates.OPEN || !this.websocket) {
            return Promise.reject({ code: jsonrpc_model_1.JsonRpcErrorCodes.INTERNAL_ERROR, message: 'The websocket is not opened' });
        }
        const request = {
            jsonrpc: this.jsonRpcVersion,
            id: this.getRequestId(),
            method: method,
            params: params
        };
        try {
            this.websocket.send(JSON.stringify(request));
        }
        catch (e) {
            return Promise.reject({ code: jsonrpc_model_1.JsonRpcErrorCodes.INTERNAL_ERROR, message: `Internal error. ${e}` });
        }
        return this.createPendingRequest(request);
    }
    notify(method, params) {
        if (this.state !== WebsocketReadyStates.OPEN || !this.websocket) {
            throw new Error('The websocket is not opened');
        }
        const request = {
            jsonrpc: this.jsonRpcVersion,
            method: method,
            params: params
        };
        try {
            this.websocket.send(JSON.stringify(request));
        }
        catch (e) {
            throw Error(e);
        }
    }
    respondOk(id, result) {
        this.respond(id, result);
    }
    respondError(id, error) {
        this.respond(id, void 0, error);
    }
    respond(id, result, error) {
        if (this.state !== WebsocketReadyStates.OPEN || !this.websocket) {
            throw new Error('The websocket is not opened');
        }
        if (!!(result) && !!(error)) {
            throw new Error('Invalid response. Either result or error must be set, but not both');
        }
        const response = {
            jsonrpc: this.jsonRpcVersion,
            id: id,
            result: result,
            error: error
        };
        try {
            this.websocket.send(JSON.stringify(response));
        }
        catch (e) {
            throw Error(e);
        }
    }
    handleMessage(msg) {
        let data = null;
        try {
            data = JSON.parse(msg);
        }
        catch (e) {
            this.handleError(jsonrpc_model_1.JsonRpcErrorCodes.PARSE_ERROR, `Invalid JSON was received. ${e}`);
            return;
        }
        const isResponse = !!(data) && (this.hasProperty(data, 'result') || this.hasProperty(data, 'error') && this.hasProperty(data, 'id'));
        const isRequest = !!(data) && this.hasProperty(data, 'method');
        const requestId = isRequest && data.id ? data.id : void 0;
        if (!(data.jsonrpc) || data.jsonrpc !== this.jsonRpcVersion) {
            this.handleError(jsonrpc_model_1.JsonRpcErrorCodes.INVALID_REQUEST, `Invalid JSON RPC protocol version. Expecting ${this.jsonRpcVersion}, but got ${data.jsonrpc}`, requestId);
            return;
        }
        if (isResponse) {
            this.handleResponse(data);
        }
        else if (isRequest) {
            this.handleRequest(data);
        }
        else {
            this.handleError(jsonrpc_model_1.JsonRpcErrorCodes.INVALID_REQUEST, `Received unknown data: ${JSON.stringify(data)}`, requestId);
        }
    }
    handleRequest(request) {
        const method = this.rpcMethods[request.method.toLowerCase()]; // case-insensitive!
        if (!method) {
            this.handleError(jsonrpc_model_1.JsonRpcErrorCodes.METHOD_NOT_FOUND, `Method \'${request.method}\' was not found`, request.id);
            return;
        }
        const requestParams = (request.params) ? request.params : [];
        const nbrReqParams = requestParams.length;
        if (method.length !== nbrReqParams) {
            this.handleError(jsonrpc_model_1.JsonRpcErrorCodes.INVALID_PARAMS, `Invalid parameters. Method \'${request.method}\' expects ${method.length} parameters, but got ${nbrReqParams}`, request.id);
            return;
        }
        const result = method(...requestParams); // only positional arguments are supported (no named arguments)
        if (request.id) {
            this.respondOk(request.id, result ? result : {});
        }
    }
    handleResponse(response) {
        const activeRequest = this.pendingRequests[response.id];
        if (activeRequest === void 0) {
            this.onError$.next({
                code: jsonrpc_model_1.JsonRpcErrorCodes.INTERNAL_ERROR,
                message: `Received a response with id ${response.id}, which does not match any requests made by this client`
            });
            return;
        }
        self.clearTimeout(activeRequest.timeout);
        if (this.hasProperty(response, 'result') && this.hasProperty(response, 'error')) {
            const errorResponse = {
                jsonrpc: this.jsonRpcVersion,
                id: activeRequest.request.id,
                error: {
                    code: jsonrpc_model_1.JsonRpcErrorCodes.INVALID_RESPONSE,
                    message: `Invalid response. Either result or error must be set, but not both. ${JSON.stringify(response)}`
                }
            };
            activeRequest.response.reject(errorResponse);
            return;
        }
        if (this.hasProperty(response, 'error')) {
            activeRequest.response.reject(response);
        }
        else {
            activeRequest.response.resolve(response);
        }
    }
    handleError(code, message, requestId) {
        const error = { code: code, message: message };
        this.onError$.next(error);
        if (requestId) {
            this.respondError(requestId, error);
        }
    }
    createPendingRequest(request) {
        const response = new deferred_promise_1.DeferredPromise();
        this.pendingRequests[request.id] = {
            request: request,
            response: response,
            timeout: this.setupRequestTimeout(request.id)
        };
        return response.asPromise();
    }
    setupRequestTimeout(requestId) {
        return self.setTimeout(() => {
            const activeRequest = this.pendingRequests[requestId];
            if (activeRequest === void 0) {
                return;
            }
            const response = {
                jsonrpc: this.jsonRpcVersion,
                id: activeRequest.request.id,
                error: {
                    code: jsonrpc_model_1.JsonRpcErrorCodes.INTERNAL_ERROR,
                    message: `Request ${activeRequest.request.id} exceeded the maximum time of ${this.requestTimeoutMs}ms and was aborted`
                }
            };
            delete this.pendingRequests[requestId];
            activeRequest.response.reject(response);
        }, this.requestTimeoutMs);
    }
    getRequestId() {
        return ++this.requestId;
    }
    hasProperty(object, propertyName) {
        return Object.prototype.hasOwnProperty.call(object, propertyName);
    }
}
exports.JsonRpcWebsocket = JsonRpcWebsocket;
