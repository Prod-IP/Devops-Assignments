import { Injectable } from '@nestjs/common';
import { Repository } from '@ecommerce/db';
import {
  notFound,
  type CreateProductInput,
  type Product,
  type UpdateProductInput,
} from '@ecommerce/common';
import { createLogger, createMetrics, MetricUnit } from '@ecommerce/powertools';
import { v4 as uuidv4 } from 'uuid';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

const logger = createLogger('products-service');
const metrics = createMetrics('products-service');

type ProductItem = Product & { PK: string; SK: string; GSI1PK?: string; GSI1SK?: string };

@Injectable()
export class ProductsService {
  private readonly repo = new Repository<ProductItem>(
    process.env.PRODUCTS_TABLE || 'ecommerce-products-local',
  );

  private s3() {
    return new S3Client({
      region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
      ...(process.env.AWS_ENDPOINT_URL
        ? {
            endpoint: process.env.AWS_ENDPOINT_URL,
            forcePathStyle: true,
            credentials: {
              accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
              secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
            },
          }
        : {}),
    });
  }

  async list(category?: string): Promise<Product[]> {
    if (category) {
      const rows = await this.repo.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk',
        ExpressionAttributeValues: { ':pk': `CATEGORY#${category}` },
      });
      return rows.map(this.toProduct);
    }
    const rows = await this.repo.scan({
      FilterExpression: 'SK = :sk',
      ExpressionAttributeValues: { ':sk': 'METADATA' },
    });
    return rows.map(this.toProduct);
  }

  async get(productId: string): Promise<Product> {
    const item = await this.repo.get(`PRODUCT#${productId}`, 'METADATA');
    if (!item) throw notFound('Product not found');
    return this.toProduct(item);
  }

  async create(input: CreateProductInput): Promise<Product> {
    const productId = uuidv4();
    const now = new Date().toISOString();
    const product: ProductItem = {
      PK: `PRODUCT#${productId}`,
      SK: 'METADATA',
      GSI1PK: input.category ? `CATEGORY#${input.category}` : undefined,
      GSI1SK: `PRODUCT#${productId}`,
      productId,
      name: input.name,
      description: input.description,
      price: input.price,
      stock: input.stock,
      category: input.category,
      imageKey: input.imageKey,
      createdAt: now,
      updatedAt: now,
    };
    await this.repo.put(product);
    metrics.addMetric('ProductCreated', MetricUnit.Count, 1);
    logger.info('Product created', { productId });
    return this.toProduct(product);
  }

  async update(productId: string, input: UpdateProductInput): Promise<Product> {
    await this.get(productId);
    const names: Record<string, string> = { '#updatedAt': 'updatedAt' };
    const values: Record<string, unknown> = { ':updatedAt': new Date().toISOString() };
    const parts = ['#updatedAt = :updatedAt'];

    for (const [key, value] of Object.entries(input)) {
      if (value === undefined) continue;
      names[`#${key}`] = key;
      values[`:${key}`] = value;
      parts.push(`#${key} = :${key}`);
    }

    const updated = await this.repo.update(
      `PRODUCT#${productId}`,
      'METADATA',
      `SET ${parts.join(', ')}`,
      names,
      values,
    );
    return this.toProduct(updated!);
  }

  async remove(productId: string): Promise<void> {
    await this.get(productId);
    await this.repo.delete(`PRODUCT#${productId}`, 'METADATA');
  }

  async decrementStock(productId: string, quantity: number): Promise<void> {
    const product = await this.get(productId);
    const next = Math.max(0, product.stock - quantity);
    await this.repo.update(
      `PRODUCT#${productId}`,
      'METADATA',
      'SET #stock = :stock, #updatedAt = :updatedAt',
      { '#stock': 'stock', '#updatedAt': 'updatedAt' },
      { ':stock': next, ':updatedAt': new Date().toISOString() },
    );
    logger.info('Inventory decremented', { productId, quantity, next });
  }

  async createUploadUrl(productId: string, contentType: string) {
    await this.get(productId);
    const bucket = process.env.PRODUCT_IMAGES_BUCKET || 'ecommerce-product-images-local';
    const key = `products/${productId}/${Date.now()}`;
    const url = await getSignedUrl(
      this.s3(),
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentType: contentType }),
      { expiresIn: 900 },
    );
    return { uploadUrl: url, imageKey: key };
  }

  private toProduct(item: ProductItem): Product {
    return {
      productId: item.productId,
      name: item.name,
      description: item.description,
      price: item.price,
      stock: item.stock,
      category: item.category,
      imageKey: item.imageKey,
      createdAt: item.createdAt,
      updatedAt: item.updatedAt,
    };
  }
}
