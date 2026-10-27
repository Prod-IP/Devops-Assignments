import 'reflect-metadata';
import { Handler } from 'aws-lambda';
import { configure as serverlessExpress } from '@vendia/serverless-express';
import { createNestHttpApp } from '@ecommerce/common';
import { AdminModule } from './app.module';

let cachedServer: Handler;

export const handler: Handler = async (event, context, callback) => {
  if (!cachedServer) {
    const nestApp = await createNestHttpApp(AdminModule);
    cachedServer = serverlessExpress({ app: nestApp.getHttpAdapter().getInstance() });
  }
  return cachedServer(event, context, callback);
};
