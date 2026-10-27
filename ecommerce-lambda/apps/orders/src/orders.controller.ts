import { Body, Controller, Get, Headers, Param, Patch, Post } from '@nestjs/common';
import {
  CreateOrderSchema,
  UpdateOrderStatusSchema,
  ZodValidationPipe,
  unauthorized,
  forbidden,
} from '@ecommerce/common';
import { OrdersService } from './orders.service';

@Controller('orders')
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'orders' };
  }

  @Post()
  create(
    @Headers() headers: Record<string, string | undefined>,
    @Body(new ZodValidationPipe(CreateOrderSchema)) body: unknown,
  ) {
    const userId = headers['x-user-id'];
    if (!userId) throw unauthorized();
    return this.orders.create(userId, body as any);
  }

  @Get()
  list(@Headers() headers: Record<string, string | undefined>) {
    const userId = headers['x-user-id'];
    if (!userId) throw unauthorized();
    return this.orders.listByUser(userId);
  }

  @Get(':orderId')
  get(@Param('orderId') orderId: string) {
    return this.orders.get(orderId);
  }

  @Patch(':orderId/status')
  updateStatus(
    @Headers() headers: Record<string, string | undefined>,
    @Param('orderId') orderId: string,
    @Body(new ZodValidationPipe(UpdateOrderStatusSchema)) body: unknown,
  ) {
    if (headers['x-user-role'] !== 'admin') throw forbidden();
    return this.orders.updateStatus(orderId, (body as any).status);
  }
}
