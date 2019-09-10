"use strict";
// See https://www.jsonrpc.org/specification for the protocol details
Object.defineProperty(exports, "__esModule", { value: true });
var JsonRpcErrorCodes;
(function (JsonRpcErrorCodes) {
    JsonRpcErrorCodes[JsonRpcErrorCodes["PARSE_ERROR"] = -32700] = "PARSE_ERROR";
    JsonRpcErrorCodes[JsonRpcErrorCodes["INVALID_REQUEST"] = -32600] = "INVALID_REQUEST";
    JsonRpcErrorCodes[JsonRpcErrorCodes["METHOD_NOT_FOUND"] = -32601] = "METHOD_NOT_FOUND";
    JsonRpcErrorCodes[JsonRpcErrorCodes["INVALID_PARAMS"] = -32602] = "INVALID_PARAMS";
    JsonRpcErrorCodes[JsonRpcErrorCodes["INTERNAL_ERROR"] = -32603] = "INTERNAL_ERROR";
    // App specific
    JsonRpcErrorCodes[JsonRpcErrorCodes["INVALID_RESPONSE"] = -32001] = "INVALID_RESPONSE";
})(JsonRpcErrorCodes = exports.JsonRpcErrorCodes || (exports.JsonRpcErrorCodes = {}));
class JsonRpcError {
}
exports.JsonRpcError = JsonRpcError;
class JsonRpcResponse {
}
exports.JsonRpcResponse = JsonRpcResponse;
class JsonRpcRequest {
}
exports.JsonRpcRequest = JsonRpcRequest;
