import { Injectable } from '@nestjs/common';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { Repository } from '@ecommerce/db';
import {
  ORDER_EVENT_SOURCE,
  ORDER_PLACED,
  ORDER_UPDATED,
  notFound,
  type CreateOrderInput,
  type Order,
  type OrderStatus,
} from '@ecommerce/common';
import { createLogger, createMetrics, MetricUnit } from '@ecommerce/powertools';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('orders-service');
const metrics = createMetrics('orders-service');

type OrderItem = Order & {
  PK: string;
  SK: string;
  GSI1PK?: string;
  GSI1SK?: string;
};

type IdempotencyItem = {
  PK: string;
  SK: string;
  orderId: string;
  ttl: number;
};

@Injectable()
export class OrdersService {
  private readonly orders = new Repository<OrderItem>(
    process.env.ORDERS_TABLE || 'ecommerce-orders-local',
  );
  private readonly idempotency = new Repository<IdempotencyItem>(
    process.env.IDEMPOTENCY_TABLE || 'ecommerce-idempotency-local',
  );

  private eb() {
    return new EventBridgeClient({
      region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
      ...(process.env.AWS_ENDPOINT_URL
        ? {
            endpoint: process.env.AWS_ENDPOINT_URL,
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
            },
          }
        : {}),
    });
  }

  async create(userId: string, input: CreateOrderInput): Promise<Order> {
    if (input.idempotencyKey) {
      const existing = await this.idempotency.get(
        `IDEMPOTENCY#${userId}`,
        input.idempotencyKey,
      );
      if (existing) {
        return this.get(existing.orderId);
      }
    }

    const orderId = uuidv4();
    const now = new Date().toISOString();
    const items = input.items.map((i) => ({
      productId: i.productId,
      quantity: i.quantity,
      price: 0, // caller/cart would normally resolve price; admin/products integration
    }));
    const total = items.reduce((sum, i) => sum + i.price * i.quantity, 0);

    const order: OrderItem = {
      PK: `ORDER#${orderId}`,
      SK: 'METADATA',
      GSI1PK: `USER#${userId}`,
      GSI1SK: `ORDER#${now}`,
      orderId,
      userId,
      items,
      status: 'PENDING',
      total,
      shippingAddress: input.shippingAddress,
      createdAt: now,
      updatedAt: now,
    };

    await this.orders.put(order);

    if (input.idempotencyKey) {
      await this.idempotency.put({
        PK: `IDEMPOTENCY#${userId}`,
        SK: input.idempotencyKey,
        orderId,
        ttl: Math.floor(Date.now() / 1000) + 86400,
      });
    }

    await this.publish(ORDER_PLACED, order);
    metrics.addMetric('OrdersCreated', MetricUnit.Count, 1);
    logger.info('Order created', { orderId, userId });
    return this.toOrder(order);
  }

  async get(orderId: string): Promise<Order> {
    const item = await this.orders.get(`ORDER#${orderId}`, 'METADATA');
    if (!item) throw notFound('Order not found');
    return this.toOrder(item);
  }

  async listByUser(userId: string): Promise<Order[]> {
    const rows = await this.orders.query({
      IndexName: 'GSI1',
      KeyConditionExpression: 'GSI1PK = :pk',
      ExpressionAttributeValues: { ':pk': `USER#${userId}` },
    });
    return rows.map(this.toOrder);
  }

  async listAll(): Promise<Order[]> {
    const rows = await this.orders.scan({
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: { ':sk': 'METADATA' },
    });
    return rows.map(this.toOrder);
  }

  async updateStatus(orderId: string, status: OrderStatus): Promise<Order> {
    const updated = await this.orders.update(
      `ORDER#${orderId}`,
      'METADATA',
      'SET #status = :status, #updatedAt = :updatedAt',
      { '#status': 'status', '#updatedAt': 'updatedAt' },
      { ':status': status, ':updatedAt': new Date().toISOString() },
    );
    if (!updated) throw notFound('Order not found');
    await this.publish(ORDER_UPDATED, updated);
    return this.toOrder(updated);
  }

  private async publish(detailType: string, order: OrderItem) {
    const bus = process.env.EVENT_BUS_NAME || 'ecommerce-orders';
    await this.eb().send(
      new PutEventsCommand({
        Entries: [
          {
            EventBusName: bus,
            Source: ORDER_EVENT_SOURCE,
            DetailType: detailType,
            Detail: JSON.stringify({
              orderId: order.orderId,
              userId: order.userId,
              items: order.items,
              status: order.status,
              total: order.total,
            }),
          },
        ],
      }),
    );
  }

  private toOrder(item: OrderItem): Order {
    return {
      orderId: item.orderId,
      userId: item.userId,
      items: item.items,
      status: item.status,
      total: item.total,
      shippingAddress: item.shippingAddress,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
