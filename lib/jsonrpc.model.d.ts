export declare enum JsonRpcErrorCodes {
    PARSE_ERROR = -32700,
    INVALID_REQUEST = -32600,
    METHOD_NOT_FOUND = -32601,
    INVALID_PARAMS = -32602,
    INTERNAL_ERROR = -32603,
    INVALID_RESPONSE = -32001
}
export declare class JsonRpcError {
    code: number;
    message: string;
    data?: any;
}
export declare class JsonRpcResponse {
    jsonrpc: string;
    id: number;
    result?: any;
    error?: JsonRpcError;
}
export declare class JsonRpcRequest {
    jsonrpc: string;
    id?: number;
    method: string;
    params?: any;
}
