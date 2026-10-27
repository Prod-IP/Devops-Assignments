import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  ScanCommand,
  UpdateCommand,
  TransactWriteCommand,
  type QueryCommandInput,
} from '@aws-sdk/lib-dynamodb';
import { getDocClient } from './client';

export type Item = Record<string, unknown>;

export class Repository<T extends Item> {
  constructor(protected readonly tableName: string) {}

  protected get client() {
    return getDocClient();
  }

  async get(pk: string, sk: string): Promise<T | null> {
    const result = await this.client.send(
      new GetCommand({
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
      }),
    );
    return (result.Item as T) || null;
  }

  async put(item: T): Promise<T> {
    await this.client.send(
      new PutCommand({
        TableName: this.tableName,
        Item: item,
      }),
    );
    return item;
  }

  async delete(pk: string, sk: string): Promise<void> {
    await this.client.send(
      new DeleteCommand({
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
      }),
    );
  }

  async query(params: Omit<QueryCommandInput, 'TableName'>): Promise<T[]> {
    const result = await this.client.send(
      new QueryCommand({
        TableName: this.tableName,
        ...params,
      }),
    );
    return (result.Items as T[]) || [];
  }

  async scan(filter?: {
    FilterExpression?: string;
    ExpressionAttributeValues?: Record<string, unknown>;
    ExpressionAttributeNames?: Record<string, string>;
  }): Promise<T[]> {
    const result = await this.client.send(
      new ScanCommand({
        TableName: this.tableName,
        ...filter,
      }),
    );
    return (result.Items as T[]) || [];
  }

  async update(
    pk: string,
    sk: string,
    updateExpression: string,
    expressionAttributeNames: Record<string, string>,
    expressionAttributeValues: Record<string, unknown>,
  ): Promise<T | null> {
    const result = await this.client.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: { PK: pk, SK: sk },
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: expressionAttributeValues,
        ReturnValues: 'ALL_NEW',
      }),
    );
    return (result.Attributes as T) || null;
  }

  async transactWrite(items: Array<{ Put?: { Item: Item } }>) {
    await this.client.send(
      new TransactWriteCommand({
        TransactItems: items.map((i) => {
          if (i.Put) {
            return { Put: { TableName: this.tableName, Item: i.Put.Item } };
          }
          throw new Error('Unsupported transact item');
        }),
      }),
    );
  }
}
