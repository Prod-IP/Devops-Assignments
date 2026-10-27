/**
 * Floci-backed integration test (opt-in via npm run test:int).
 * Skips automatically when AWS_ENDPOINT_URL is unset.
 */
import { DynamoDBClient, DescribeTableCommand } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, PutCommand, GetCommand } from '@aws-sdk/lib-dynamodb';

const endpoint = process.env.AWS_ENDPOINT_URL;
const run = endpoint ? describe : describe.skip;

run('Floci products integration', () => {
  const client = DynamoDBDocumentClient.from(
    new DynamoDBClient({
      region: 'us-east-1',
      endpoint,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    }),
  );

  it('reads seeded demo product', async () => {
    const ddb = new DynamoDBClient({
      region: 'us-east-1',
      endpoint,
      credentials: { accessKeyId: 'test', secretAccessKey: 'test' },
    });
    await ddb.send(new DescribeTableCommand({ TableName: 'ecommerce-products-local' }));

    const result = await client.send(
      new GetCommand({
        TableName: 'ecommerce-products-local',
        Key: {
          PK: 'PRODUCT#11111111-1111-1111-1111-111111111111',
          SK: 'METADATA',
        },
      }),
    );
    expect(result.Item?.name).toBe('Demo Widget');
  });

  it('writes and reads an order row', async () => {
    await client.send(
      new PutCommand({
        TableName: 'ecommerce-orders-local',
        Item: {
          PK: 'ORDER#int-test',
          SK: 'METADATA',
          orderId: 'int-test',
          userId: 'u1',
          status: 'PENDING',
          total: 1,
          items: [],
          shippingAddress: {},
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      }),
    );
    const got = await client.send(
      new GetCommand({
        TableName: 'ecommerce-orders-local',
        Key: { PK: 'ORDER#int-test', SK: 'METADATA' },
      }),
    );
    expect(got.Item?.orderId).toBe('int-test');
  });
});
