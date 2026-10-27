import type {
  APIGatewayTokenAuthorizerEvent,
  APIGatewayAuthorizerResult,
} from 'aws-lambda';
import * as jwt from 'jsonwebtoken';
import jwksClient from 'jwks-rsa';

function policy(
  principalId: string,
  effect: 'Allow' | 'Deny',
  resource: string,
  context?: Record<string, string>,
): APIGatewayAuthorizerResult {
  return {
    principalId,
    policyDocument: {
      Version: '2012-10-17',
      Statement: [
        {
          Action: 'execute-api:Invoke',
          Effect: effect,
          Resource: resource,
        },
      ],
    },
    context,
  };
}

export const authorizer = async (
  event: APIGatewayTokenAuthorizerEvent,
): Promise<APIGatewayAuthorizerResult> => {
  const token = event.authorizationToken?.replace(/^Bearer\s+/i, '');
  if (!token) {
    throw new Error('Unauthorized');
  }

  // Local offline tokens: local.<base64url>
  if (token.startsWith('local.')) {
    try {
      const payload = JSON.parse(Buffer.from(token.slice(6), 'base64url').toString());
      return policy(payload.sub, 'Allow', event.methodArn, {
        userId: payload.sub,
        email: payload.email,
        role: payload.role || 'user',
      });
    } catch {
      throw new Error('Unauthorized');
    }
  }

  const region = process.env.AWS_DEFAULT_REGION || 'us-east-1';
  const userPoolId = process.env.COGNITO_USER_POOL_ID;
  if (!userPoolId) throw new Error('Unauthorized');

  const issuer = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}`;
  const client = jwksClient({
    jwksUri: `${issuer}/.well-known/jwks.json`,
    cache: true,
  });

  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string' || !decoded.header.kid) {
    throw new Error('Unauthorized');
  }

  const key = await client.getSigningKey(decoded.header.kid);
  const verified = jwt.verify(token, key.getPublicKey(), {
    issuer,
    algorithms: ['RS256'],
  }) as jwt.JwtPayload;

  return policy(verified.sub || 'user', 'Allow', event.methodArn, {
    userId: verified.sub || '',
    email: (verified.email as string) || '',
    role: (verified['custom:role'] as string) || 'user',
  });
};
