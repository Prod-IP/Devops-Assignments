import {
  CognitoIdentityProviderClient,
  SignUpCommand,
  InitiateAuthCommand,
  AuthFlowType,
} from '@aws-sdk/client-cognito-identity-provider';
import { Injectable } from '@nestjs/common';
import { Repository } from '@ecommerce/db';
import { badRequest, unauthorized, type LoginInput, type RegisterInput, type UserProfile } from '@ecommerce/common';
import { createLogger } from '@ecommerce/powertools';
import { v4 as uuidv4 } from 'uuid';

const logger = createLogger('auth-service');

function cognitoClient() {
  return new CognitoIdentityProviderClient({
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

@Injectable()
export class AuthService {
  private readonly users = new Repository<Record<string, unknown>>(
    process.env.USERS_TABLE || 'ecommerce-users-local',
  );

  async register(input: RegisterInput): Promise<{ userId: string; email: string }> {
    const userId = uuidv4();
    const clientId = process.env.COGNITO_CLIENT_ID;
    if (!clientId) {
      // Local/dev fallback without Cognito
      const profile: UserProfile = {
        userId,
        email: input.email,
        name: input.name,
        role: 'user',
        createdAt: new Date().toISOString(),
      };
      await this.users.put({
        PK: `USER#${userId}`,
        SK: 'PROFILE',
        GSI1PK: `EMAIL#${input.email}`,
        GSI1SK: 'PROFILE',
        ...profile,
        passwordHash: input.password, // local only
      });
      logger.info('Registered local user', { userId, email: input.email });
      return { userId, email: input.email };
    }

    try {
      await cognitoClient().send(
        new SignUpCommand({
          ClientId: clientId,
          Username: input.email,
          Password: input.password,
          UserAttributes: [
            { Name: 'email', Value: input.email },
            { Name: 'name', Value: input.name },
          ],
        }),
      );
    } catch (err: any) {
      logger.error('Cognito signup failed', { error: err?.message });
      throw badRequest('Registration failed');
    }

    const profile: UserProfile = {
      userId,
      email: input.email,
      name: input.name,
      role: 'user',
      createdAt: new Date().toISOString(),
    };
    await this.users.put({
      PK: `USER#${userId}`,
      SK: 'PROFILE',
      GSI1PK: `EMAIL#${input.email}`,
      GSI1SK: 'PROFILE',
      ...profile,
    });
    return { userId, email: input.email };
  }

  async login(input: LoginInput): Promise<{ accessToken: string; idToken?: string }> {
    const clientId = process.env.COGNITO_CLIENT_ID;
    if (!clientId) {
      const rows = await this.users.query({
        IndexName: 'GSI1',
        KeyConditionExpression: 'GSI1PK = :pk AND GSI1SK = :sk',
        ExpressionAttributeValues: {
          ':pk': `EMAIL#${input.email}`,
          ':sk': 'PROFILE',
        },
      });
      const user = rows[0];
      if (!user || user.passwordHash !== input.password) {
        throw unauthorized('Invalid credentials');
      }
      // Local JWT-like token (base64 payload) for offline testing
      const token = Buffer.from(
        JSON.stringify({ sub: user.userId, email: user.email, role: user.role }),
      ).toString('base64url');
      return { accessToken: `local.${token}` };
    }

    try {
      const result = await cognitoClient().send(
        new InitiateAuthCommand({
          AuthFlow: AuthFlowType.USER_PASSWORD_AUTH,
          ClientId: clientId,
          AuthParameters: {
            USERNAME: input.email,
            PASSWORD: input.password,
          },
        }),
      );
      return {
        accessToken: result.AuthenticationResult?.AccessToken || '',
        idToken: result.AuthenticationResult?.IdToken,
      };
    } catch {
      throw unauthorized('Invalid credentials');
    }
  }

  async getProfile(userId: string): Promise<UserProfile | null> {
    const item = await this.users.get(`USER#${userId}`, 'PROFILE');
    if (!item) return null;
    return {
      userId: item.userId as string,
      email: item.email as string,
      name: item.name as string,
      role: item.role as 'user' | 'admin',
      createdAt: item.createdAt as string,
    };
  }

  async listUsers(): Promise<UserProfile[]> {
    const rows = await this.users.query({
      KeyConditionExpression: 'begins_with(PK, :pk)',
      ExpressionAttributeValues: { ':pk': 'USER#' },
    });
    // Scan-like via GSI is preferred; for local seed we query known pattern
    return rows
      .filter((r) => r.SK === 'PROFILE')
      .map((item) => ({
        userId: item.userId as string,
        email: item.email as string,
        name: item.name as string,
        role: item.role as 'user' | 'admin',
        createdAt: item.createdAt as string,
      }));
  }
}
