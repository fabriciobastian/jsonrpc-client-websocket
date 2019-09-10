import { JsonRpcError, JsonRpcResponse } from './jsonrpc.model';
import { ReplaySubject } from 'rxjs';
export declare enum WebsocketReadyStates {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3
}
export declare class JsonRpcWebsocket {
    private url;
    private requestTimeoutMs;
    jsonRpcVersion: string;
    private websocket;
    private requestId;
    private pendingRequests;
    private rpcMethods;
    onError$: ReplaySubject<JsonRpcError>;
    constructor(url: string, requestTimeoutMs: number);
    open(): Promise<Event>;
    close(): void;
    readonly state: WebsocketReadyStates;
    on(methodName: string, callback: (...args: any[]) => any): void;
    call(method: string, params?: any): Promise<JsonRpcResponse>;
    notify(method: string, params?: any): void;
    respondOk(id: number, result: any): void;
    respondError(id: number, error: JsonRpcError): void;
    private respond;
    private handleMessage;
    private handleRequest;
    private handleResponse;
    private handleError;
    private createPendingRequest;
    private setupRequestTimeout;
    private getRequestId;
    private hasProperty;
}
