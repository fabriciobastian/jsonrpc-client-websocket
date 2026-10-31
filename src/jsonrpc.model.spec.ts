import { JsonRpcError, JsonRpcRequest, JsonRpcResponse } from './jsonrpc.model';

describe('JSON RPC model compatibility', () => {
  it.each([
    { name: 'JsonRpcError', Model: JsonRpcError },
    { name: 'JsonRpcRequest', Model: JsonRpcRequest },
    { name: 'JsonRpcResponse', Model: JsonRpcResponse },
  ])('does not add runtime fields to $name instances', ({ Model }) => {
    expect(Object.keys(new Model())).toEqual([]);
  });
});
