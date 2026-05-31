import type { FastifyInstance } from 'fastify';
import type { PrismaClient }    from '@prisma/client';
import type { IUserRepository } from '../IAM/UserRepository.js';
import type { LocalJwtIdentityProvider } from '../../Platform/Adapters/Local/LocalJwtIdentityProvider.js';
import type { INotifier } from '../../Platform/Ports/INotifier.js';
import { hashPassword, verifyPassword } from './passwordUtils.js';
import { Errors } from '../../Shared/errors.js';
import { randomBytes } from 'node:crypto';

interface AuthDeps {
  prisma:          PrismaClient;
  userRepo:        IUserRepository;
  jwt:             LocalJwtIdentityProvider;
  notifier:        INotifier;
  /** Default clientId for self-registered users (the demo client). */
  defaultClientId: string;
  /** Base URL of the frontend app, e.g. http://localhost:5173 */
  frontendUrl:     string;
}

interface RegisterBody      { email: string; password: string; displayName: string }
interface LoginBody         { email: string; password: string }
interface ForgotPasswordBody { email: string }
interface ResetPasswordBody  { token: string; password: string }

const RESET_TOKEN_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Auth endpoints — only registered when AUTH_PROVIDER=local-jwt.
 * These are PUBLIC_PATHS (no Bearer token required).
 *
 * POST /auth/register        — creates a PENDING user with hashed password
 * POST /auth/login           — verifies credentials, returns a signed JWT
 * POST /auth/forgot-password — generates a reset token and emails a link
 * POST /auth/reset-password  — validates token and updates password
 */
export function registerAuthEndpoints(app: FastifyInstance, deps: AuthDeps): void {
  const { prisma, userRepo, jwt, notifier, defaultClientId, frontendUrl } = deps;

  // POST /auth/register
  app.post<{ Body: RegisterBody }>('/auth/register', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { email, password, displayName } = req.body ?? {};
    if (!email || !password || !displayName) {
      throw Errors.badRequest('email, password, and displayName are required');
    }
    if (password.length < 8) {
      throw Errors.badRequest('Password must be at least 8 characters');
    }

    const existing = await prisma.portalUser.findFirst({ where: { email } });
    if (existing) throw Errors.conflict('Email already registered');

    const passwordHash = await hashPassword(password);
    const authUserId   = crypto.randomUUID();

    await userRepo.create({ clientId: defaultClientId, authUserId, email, displayName });
    await prisma.portalUser.update({ where: { authUserId }, data: { passwordHash } });

    reply.status(201);
    return { message: 'Registration received. An administrator will activate your account.' };
  });

  // POST /auth/login
  app.post<{ Body: LoginBody }>('/auth/login', {
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (req) => {
    const { email, password } = req.body ?? {};
    if (!email || !password) throw Errors.badRequest('email and password are required');

    const row = await prisma.portalUser.findFirst({ where: { email } });
    if (!row || !row.passwordHash) throw Errors.unauthorized('Invalid credentials');
    if (!row.isActive) throw Errors.forbidden('Account is deactivated');

    const valid = await verifyPassword(password, row.passwordHash);
    if (!valid) throw Errors.unauthorized('Invalid credentials');

    const accessToken = jwt.sign({
      sub:         row.authUserId,
      clientId:    row.clientId,
      email:       row.email,
      displayName: row.displayName,
    });

    return { accessToken, userId: row.id, email: row.email, displayName: row.displayName };
  });

  // POST /auth/forgot-password
  app.post<{ Body: ForgotPasswordBody }>('/auth/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { email } = req.body ?? {};
    if (!email) throw Errors.badRequest('email is required');

    // Always return 200 to avoid user enumeration
    const row = await prisma.portalUser.findFirst({ where: { email } });
    if (row && row.passwordHash) {
      const token     = randomBytes(32).toString('hex');
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MS);
      await prisma.portalUser.update({
        where: { id: row.id },
        data:  { passwordResetToken: token, passwordResetExpiresAt: expiresAt },
      });

      const resetUrl = `${frontendUrl}?reset_token=${token}`;
      await notifier.sendEmail({
        to:       [row.email],
        subject:  'Reset your Help Center password',
        htmlBody: `
          <p>Hi ${row.displayName ?? row.email},</p>
          <p>We received a request to reset your Help Center password.</p>
          <p><a href="${resetUrl}" style="color:#5e35b1;font-weight:bold;">Reset my password</a></p>
          <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
        `.trim(),
      });
    }

    reply.status(200);
    return { message: 'If that email is registered, a reset link has been sent.' };
  });

  // POST /auth/reset-password
  app.post<{ Body: ResetPasswordBody }>('/auth/reset-password', {
    config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
  }, async (req, reply) => {
    const { token, password } = req.body ?? {};
    if (!token || !password) throw Errors.badRequest('token and password are required');
    if (password.length < 8) throw Errors.badRequest('Password must be at least 8 characters');

    const row = await prisma.portalUser.findFirst({ where: { passwordResetToken: token } });
    if (!row || !row.passwordResetExpiresAt || row.passwordResetExpiresAt < new Date()) {
      throw Errors.badRequest('Reset link is invalid or has expired');
    }

    const passwordHash = await hashPassword(password);
    await prisma.portalUser.update({
      where: { id: row.id },
      data:  { passwordHash, passwordResetToken: null, passwordResetExpiresAt: null },
    });

    reply.status(200);
    return { message: 'Password updated successfully. You can now sign in.' };
  });
}
