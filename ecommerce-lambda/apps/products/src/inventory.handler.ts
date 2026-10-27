import type { SQSEvent, SQSHandler } from 'aws-lambda';
import { ProductsService } from './products.service';
import { createLogger } from '@ecommerce/powertools';

const logger = createLogger('products-inventory');
const service = new ProductsService();

export const inventoryHandler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const body = JSON.parse(record.body);
    // EventBridge → SQS wraps the detail
    const detail = body.detail || body;
    const items: Array<{ productId: string; quantity: number }> = detail.items || [];
    for (const item of items) {
      await service.decrementStock(item.productId, item.quantity);
    }
    logger.info('Processed inventory message', { orderId: detail.orderId });
  }
};
