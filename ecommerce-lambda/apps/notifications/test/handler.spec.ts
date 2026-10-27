import { sendOrderEmail, handler } from '../src/handler';

jest.mock('@aws-sdk/client-ses', () => ({
  SESClient: class {
    async send() {
      return { MessageId: 'msg-1' };
    }
  },
  SendEmailCommand: class {
    constructor(public input: any) {}
  },
}));

describe('notifications', () => {
  it('sendOrderEmail dry-run', async () => {
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
    const result = await sendOrderEmail({ orderId: 'o1', userId: 'u1', status: 'PENDING' });
    expect(result.MessageId).toBe('dry-run');
  });

  it('handler processes SQS records', async () => {
    process.env.NOTIFICATIONS_DRY_RUN = 'true';
    await handler(
      {
        Records: [
          {
            body: JSON.stringify({
              detail: { orderId: 'o1', userId: 'u1', status: 'CONFIRMED', total: 10 },
            }),
          } as any,
        ],
      },
      {} as any,
      () => undefined,
    );
  });
});
