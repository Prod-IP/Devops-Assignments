import { Body, Controller, Delete, Get, Headers, Param, Post } from '@nestjs/common';
import { AddCartItemSchema, ZodValidationPipe, unauthorized } from '@ecommerce/common';
import { CartService } from './cart.service';

@Controller('cart')
export class CartController {
  constructor(private readonly cart: CartService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'cart' };
  }

  private userId(headers: Record<string, string | undefined>) {
    const id = headers['x-user-id'];
    if (!id) throw unauthorized();
    return id;
  }

  @Get()
  get(@Headers() headers: Record<string, string | undefined>) {
    return this.cart.get(this.userId(headers));
  }

  @Post('items')
  add(
    @Headers() headers: Record<string, string | undefined>,
    @Body(new ZodValidationPipe(AddCartItemSchema)) body: unknown,
  ) {
    return this.cart.addItem(this.userId(headers), body as any);
  }

  @Delete('items/:productId')
  remove(
    @Headers() headers: Record<string, string | undefined>,
    @Param('productId') productId: string,
  ) {
    return this.cart.removeItem(this.userId(headers), productId);
  }

  @Delete()
  clear(@Headers() headers: Record<string, string | undefined>) {
    return this.cart.clear(this.userId(headers));
  }
}
