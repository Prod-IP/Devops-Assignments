import { Logger } from '@aws-lambda-powertools/logger';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { Metrics, MetricUnit } from '@aws-lambda-powertools/metrics';

export function createLogger(serviceName: string) {
  return new Logger({ serviceName });
}

export function createTracer(serviceName: string) {
  return new Tracer({ serviceName });
}

export function createMetrics(serviceName: string, namespace = 'Ecommerce') {
  return new Metrics({ namespace, serviceName });
}

export { Logger, Tracer, Metrics, MetricUnit };
