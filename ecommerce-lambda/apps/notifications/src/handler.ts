import type { SQSEvent, SQSHandler } from 'aws-lambda';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';
import { createLogger, createMetrics, MetricUnit } from '@ecommerce/powertools';

const logger = createLogger('notifications-service');
const metrics = createMetrics('notifications-service');

function ses() {
  return new SESClient({
    region: process.env.AWS_DEFAULT_REGION || 'us-east-1',
    ...(process.env.AWS_ENDPOINT_URL
      ? {
          endpoint: process.env.AWS_ENDPOINT_URL,
          credentials: {
            accessKeyId: process.env.AWS_ACCESS_KEY_ID || 'test',
            secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'test',
          },
        }
      : {}),
  });
}

export async function sendOrderEmail(detail: {
  orderId: string;
  userId: string;
  status?: string;
  total?: number;
}) {
  const from = process.env.SES_FROM_EMAIL || 'orders@example.com';
  const to = process.env.SES_TO_EMAIL || `user-${detail.userId}@example.com`;
  const subject = `Order ${detail.orderId} ${detail.status || 'PENDING'}`;
  const body = `Your order ${detail.orderId} is ${detail.status || 'PENDING'}. Total: ${detail.total ?? 0}`;

  if (process.env.NOTIFICATIONS_DRY_RUN === 'true') {
    logger.info('Dry-run email', { to, subject, body });
    return { MessageId: 'dry-run' };
  }

  const result = await ses().send(
    new SendEmailCommand({
      Source: from,
      Destination: { ToAddresses: [to] },
      Message: {
        Subject: { Data: subject },
        Body: { Text: { Data: body } },
      },
    }),
  );
  metrics.addMetric('EmailsSent', MetricUnit.Count, 1);
  return result;
}

export const handler: SQSHandler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    try {
      const envelope = JSON.parse(record.body);
      const detail = envelope.detail || envelope;
      await sendOrderEmail(detail);
      logger.info('Notification sent', { orderId: detail.orderId });
    } catch (err: any) {
      logger.error('Failed to send notification', { error: err?.message });
      throw err; // let SQS retry / DLQ
    }
  }
};
