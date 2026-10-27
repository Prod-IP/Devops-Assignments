/**
 * Seed Floci local AWS resources for ecommerce-lambda.
 * Requires: docker compose up -d floci && eval $(floci env)
 */
import {
  CreateTableCommand,
  DynamoDBClient,
  ResourceInUseException,
} from '@aws-sdk/client-dynamodb';
import { CreateBucketCommand, S3Client } from '@aws-sdk/client-s3';
import { CreateQueueCommand, SQSClient } from '@aws-sdk/client-sqs';
import { EventBridgeClient, CreateEventBusCommand } from '@aws-sdk/client-eventbridge';
import { DynamoDBDocumentClient, PutCommand } from '@aws-sdk/lib-dynamodb';

const endpoint = process.env.AWS_ENDPOINT_URL || 'http://localhost:4566';
const region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
const creds = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
};

const ddb = new DynamoDBClient({ region, endpoint, credentials: creds });
const doc = DynamoDBDocumentClient.from(ddb);
const s3 = new S3Client({ region, endpoint, credentials: creds, forcePathStyle: true });
const sqs = new SQSClient({ region, endpoint, credentials: creds });
const eb = new EventBridgeClient({ region, endpoint, credentials: creds });

const tables = [
  'ecommerce-users-local',
  'ecommerce-products-local',
  'ecommerce-cart-local',
  'ecommerce-orders-local',
  'ecommerce-idempotency-local',
];

async function ensureTable(name: string) {
  try {
    await ddb.send(
      new CreateTableCommand({
        TableName: name,
        BillingMode: 'PAY_PER_REQUEST',
        AttributeDefinitions: [
          { AttributeName: 'PK', AttributeType: 'S' },
          { AttributeName: 'SK', AttributeType: 'S' },
          { AttributeName: 'GSI1PK', AttributeType: 'S' },
          { AttributeName: 'GSI1SK', AttributeType: 'S' },
        ],
        KeySchema: [
          { AttributeName: 'PK', KeyType: 'HASH' },
          { AttributeName: 'SK', KeyType: 'RANGE' },
        ],
        GlobalSecondaryIndexes: [
          {
            IndexName: 'GSI1',
            KeySchema: [
              { AttributeName: 'GSI1PK', KeyType: 'HASH' },
              { AttributeName: 'GSI1SK', KeyType: 'RANGE' },
            ],
            Projection: { ProjectionType: 'ALL' },
          },
        ],
      }),
    );
    console.log('created table', name);
  } catch (e) {
    if (e instanceof ResourceInUseException || (e as any).name === 'ResourceInUseException') {
      console.log('table exists', name);
    } else {
      throw e;
    }
  }
}

async function main() {
  for (const t of tables) await ensureTable(t);

  try {
    await s3.send(new CreateBucketCommand({ Bucket: 'ecommerce-product-images-local' }));
  } catch {
    /* exists */
  }

  await sqs.send(new CreateQueueCommand({ QueueName: 'ecommerce-notify-local' }));
  await sqs.send(new CreateQueueCommand({ QueueName: 'ecommerce-inventory-local' }));

  try {
    await eb.send(new CreateEventBusCommand({ Name: 'ecommerce-orders' }));
  } catch {
    /* exists */
  }

  const now = new Date().toISOString();
  await doc.send(
    new PutCommand({
      TableName: 'ecommerce-products-local',
      Item: {
        PK: 'PRODUCT#11111111-1111-1111-1111-111111111111',
        SK: 'METADATA',
        GSI1PK: 'CATEGORY#gadgets',
        GSI1SK: 'PRODUCT#11111111-1111-1111-1111-111111111111',
        productId: '11111111-1111-1111-1111-111111111111',
        name: 'Demo Widget',
        price: 19.99,
        stock: 100,
        category: 'gadgets',
        createdAt: now,
        updatedAt: now,
      },
    }),
  );

  await doc.send(
    new PutCommand({
      TableName: 'ecommerce-users-local',
      Item: {
        PK: 'USER#admin-local',
        SK: 'PROFILE',
        GSI1PK: 'EMAIL#admin@example.com',
        GSI1SK: 'PROFILE',
        userId: 'admin-local',
        email: 'admin@example.com',
        name: 'Admin',
        role: 'admin',
        passwordHash: 'password1',
        createdAt: now,
      },
    }),
  );

  console.log('Seed complete. Optional: floci snapshot save dev-seed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
