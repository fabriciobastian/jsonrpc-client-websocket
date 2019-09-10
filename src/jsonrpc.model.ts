// See https://www.jsonrpc.org/specification for the protocol details

export enum JsonRpcErrorCodes {
	PARSE_ERROR = -32700,
	INVALID_REQUEST = -32600,
	METHOD_NOT_FOUND = -32601,
	INVALID_PARAMS = -32602,
	INTERNAL_ERROR = -32603,
	// App specific
	INVALID_RESPONSE = -32001
}

export class JsonRpcError {
	code: number;
	message: string;
	data?: any;
}

export class JsonRpcResponse {
	jsonrpc: string; // Protocol version
	id: number;
	result?: any;
	error?: JsonRpcError;
}

export class JsonRpcRequest {
	jsonrpc: string;
	id?: number;
	method: string;
	params?: any;
}
