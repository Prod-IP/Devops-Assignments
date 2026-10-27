import { Injectable } from '@nestjs/common';
import { Repository } from '@ecommerce/db';
import { createLogger } from '@ecommerce/powertools';

const logger = createLogger('admin-service');

@Injectable()
export class AdminService {
  private readonly orders = new Repository<Record<string, unknown>>(
    process.env.ORDERS_TABLE || 'ecommerce-orders-local',
  );
  private readonly products = new Repository<Record<string, unknown>>(
    process.env.PRODUCTS_TABLE || 'ecommerce-products-local',
  );
  private readonly users = new Repository<Record<string, unknown>>(
    process.env.USERS_TABLE || 'ecommerce-users-local',
  );

  async dashboard() {
    const [orders, products, users] = await Promise.all([
      this.orders.scan({
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: { ':sk': 'METADATA' },
      }),
      this.products.scan({
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: { ':sk': 'METADATA' },
      }),
      this.users.scan({
        FilterExpression: 'SK = :sk',
        ExpressionAttributeValues: { ':sk': 'PROFILE' },
      }),
    ]);

    const revenue = orders.reduce((sum, o) => sum + Number(o.total || 0), 0);
    const byStatus = orders.reduce<Record<string, number>>((acc, o) => {
      const s = String(o.status || 'UNKNOWN');
      acc[s] = (acc[s] || 0) + 1;
      return acc;
    }, {});

    logger.info('Admin dashboard computed', {
      orders: orders.length,
      products: products.length,
      users: users.length,
    });

    return {
      totals: {
        orders: orders.length,
        products: products.length,
        users: users.length,
        revenue,
      },
      ordersByStatus: byStatus,
      recentOrders: orders.slice(0, 20).map((o) => ({
        orderId: o.orderId,
        userId: o.userId,
        status: o.status,
        total: o.total,
        createdAt: o.createdAt,
      })),
      lowStock: products
        .filter((p) => Number(p.stock) <= 5)
        .map((p) => ({ productId: p.productId, name: p.name, stock: p.stock })),
    };
  }

  async listUsers() {
    const users = await this.users.scan({
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: { ':sk': 'PROFILE' },
    });
    return users.map((u) => ({
      userId: u.userId,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
    }));
  }

  async listOrders() {
    return this.orders.scan({
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: { ':sk': 'METADATA' },
    });
  }
}
