import { getDocClient, resetDocClient } from '../src';

jest.mock('@aws-sdk/client-dynamodb', () => ({
  DynamoDBClient: class {
    constructor(public config: any) {}
  },
}));

jest.mock('@aws-sdk/lib-dynamodb', () => ({
  DynamoDBDocumentClient: {
    from: (c: any) => ({ __client: c, send: jest.fn() }),
  },
  GetCommand: class {
    constructor(public input: any) {}
  },
  PutCommand: class {
    constructor(public input: any) {}
  },
  DeleteCommand: class {
    constructor(public input: any) {}
  },
  QueryCommand: class {
    constructor(public input: any) {}
  },
  ScanCommand: class {
    constructor(public input: any) {}
  },
  UpdateCommand: class {
    constructor(public input: any) {}
  },
  TransactWriteCommand: class {
    constructor(public input: any) {}
  },
}));

describe('db package', () => {
  beforeEach(() => {
    resetDocClient();
    process.env.AWS_ENDPOINT_URL = 'http://localhost:4566';
  });

  it('getDocClient caches and uses endpoint', () => {
    const a = getDocClient();
    const b = getDocClient();
    expect(a).toBe(b);
  });
});
