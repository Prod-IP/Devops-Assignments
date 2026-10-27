import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import {
  CreateProductSchema,
  UpdateProductSchema,
  ZodValidationPipe,
} from '@ecommerce/common';
import { ProductsService } from './products.service';

@Controller('products')
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'products' };
  }

  @Get()
  list(@Query('category') category?: string) {
    return this.products.list(category);
  }

  @Get(':productId')
  get(@Param('productId') productId: string) {
    return this.products.get(productId);
  }

  @Post()
  create(@Body(new ZodValidationPipe(CreateProductSchema)) body: unknown) {
    return this.products.create(body as any);
  }

  @Patch(':productId')
  update(
    @Param('productId') productId: string,
    @Body(new ZodValidationPipe(UpdateProductSchema)) body: unknown,
  ) {
    return this.products.update(productId, body as any);
  }

  @Delete(':productId')
  async remove(@Param('productId') productId: string) {
    await this.products.remove(productId);
    return { deleted: true };
  }

  @Post(':productId/upload-url')
  uploadUrl(
    @Param('productId') productId: string,
    @Body() body: { contentType?: string },
  ) {
    return this.products.createUploadUrl(productId, body.contentType || 'image/jpeg');
  }
}
