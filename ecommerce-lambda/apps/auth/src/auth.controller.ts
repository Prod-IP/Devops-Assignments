import { Body, Controller, Get, HttpCode, Post, Req } from '@nestjs/common';
import {
  LoginSchema,
  RegisterSchema,
  ZodValidationPipe,
  unauthorized,
} from '@ecommerce/common';
import { AuthService } from './auth.service';

@Controller()
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Get('health')
  health() {
    return { status: 'ok', service: 'auth' };
  }

  @Get('ready')
  ready() {
    return { status: 'ready', service: 'auth' };
  }

  @Post('auth/register')
  register(@Body(new ZodValidationPipe(RegisterSchema)) body: unknown) {
    return this.auth.register(body as any);
  }

  @Post('auth/login')
  @HttpCode(200)
  login(@Body(new ZodValidationPipe(LoginSchema)) body: unknown) {
    return this.auth.login(body as any);
  }

  @Get('auth/me')
  async me(@Req() req: any) {
    const userId = req.headers['x-user-id'];
    if (!userId) throw unauthorized();
    const profile = await this.auth.getProfile(userId);
    if (!profile) throw unauthorized();
    return profile;
  }
}
