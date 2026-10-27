import { Injectable } from '@nestjs/common';
import { Repository } from '@ecommerce/db';
import { type Cart, type CartItemInput, notFound } from '@ecommerce/common';
import { createLogger, createMetrics, MetricUnit } from '@ecommerce/powertools';

const logger = createLogger('cart-service');
const metrics = createMetrics('cart-service');

const CART_TTL_SECONDS = 60 * 60 * 24 * 7; // 7 days

type CartItem = Cart & { PK: string; SK: string };

@Injectable()
export class CartService {
  private readonly repo = new Repository<CartItem>(
    process.env.CART_TABLE || 'ecommerce-cart-local',
  );

  async get(userId: string): Promise<Cart> {
    const item = await this.repo.get(`USER#${userId}`, 'CART');
    if (!item) {
      return { userId, items: [], updatedAt: new Date().toISOString() };
    }
    return {
      userId: item.userId,
      items: item.items,
      updatedAt: item.updatedAt,
      ttl: item.ttl,
    };
  }

  async addItem(userId: string, item: CartItemInput): Promise<Cart> {
    const cart = await this.get(userId);
    const existing = cart.items.find((i) => i.productId === item.productId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      cart.items.push({ ...item });
    }
    return this.save(userId, cart.items);
  }

  async removeItem(userId: string, productId: string): Promise<Cart> {
    const cart = await this.get(userId);
    const items = cart.items.filter((i) => i.productId !== productId);
    return this.save(userId, items);
  }

  async clear(userId: string): Promise<Cart> {
    await this.repo.delete(`USER#${userId}`, 'CART');
    metrics.addMetric('CartAbandoned', MetricUnit.Count, 1);
    logger.info('Cart cleared', { userId });
    return { userId, items: [], updatedAt: new Date().toISOString() };
  }

  private async save(userId: string, items: Cart['items']): Promise<Cart> {
    const now = new Date().toISOString();
    const ttl = Math.floor(Date.now() / 1000) + CART_TTL_SECONDS;
    const record: CartItem = {
      PK: `USER#${userId}`,
      SK: 'CART',
      userId,
      items,
      updatedAt: now,
      ttl,
    };
    await this.repo.put(record);
    return { userId, items, updatedAt: now, ttl };
  }
}
