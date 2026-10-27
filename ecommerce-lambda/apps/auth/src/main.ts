import 'reflect-metadata';
import { createNestHttpApp } from '@ecommerce/common';
import { AuthModule } from './app.module';

async function bootstrap() {
  const app = await createNestHttpApp(AuthModule);
  await app.listen(process.env.PORT || 3001);
  console.log(`Auth listening on ${process.env.PORT || 3001}`);
}

bootstrap();
