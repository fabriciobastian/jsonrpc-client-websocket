/* tslint:disable:max-classes-per-file */

// See https://www.jsonrpc.org/specification for the protocol details

export enum JsonRpcErrorCodes {
	PARSE_ERROR = -32700,
	INVALID_REQUEST = -32600,
	METHOD_NOT_FOUND = -32601,
	INVALID_PARAMS = -32602,
	INTERNAL_ERROR = -32603,
	// App specific
	INVALID_RESPONSE = -32001,
	REQUEST_TIMEOUT = -32002
}

export class JsonRpcError {
	public code: number;
	public message: string;
	public data?: any;
}

export class JsonRpcResponse {
	public jsonrpc: string; // Protocol version
	public id: number | any;
	public result?: any;
	public error?: JsonRpcError;
}

export class JsonRpcRequest {
	public jsonrpc: string;
	public id?: number | any;
	public method: string;
	public params?: any;
}
