import { Controller, Get, Headers } from '@nestjs/common';
import { forbidden } from '@ecommerce/common';
import { AdminService } from './admin.service';

@Controller('admin')
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  private assertAdmin(headers: Record<string, string | undefined>) {
    if (headers['x-user-role'] !== 'admin') throw forbidden();
  }

  @Get('health')
  health() {
    return { status: 'ok', service: 'admin' };
  }

  @Get('dashboard')
  dashboard(@Headers() headers: Record<string, string | undefined>) {
    this.assertAdmin(headers);
    return this.admin.dashboard();
  }

  @Get('users')
  users(@Headers() headers: Record<string, string | undefined>) {
    this.assertAdmin(headers);
    return this.admin.listUsers();
  }

  @Get('orders')
  orders(@Headers() headers: Record<string, string | undefined>) {
    this.assertAdmin(headers);
    return this.admin.listOrders();
  }
}
