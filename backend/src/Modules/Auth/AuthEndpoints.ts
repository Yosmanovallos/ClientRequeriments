import type { FastifyInstance } from 'fastify';
import type { PrismaClient }    from '@prisma/client';
import type { IUserRepository } from '../IAM/UserRepository.js';
import type { LocalJwtIdentityProvider } from '../../Platform/Adapters/Local/LocalJwtIdentityProvider.js';
import { hashPassword, verifyPassword } from './passwordUtils.js';
import { Errors } from '../../Shared/errors.js';

interface AuthDeps {
  prisma:   PrismaClient;
  userRepo: IUserRepository;
  jwt:      LocalJwtIdentityProvider;
  /** Default clientId for self-registered users (the demo client). */
  defaultClientId: string;
}

interface RegisterBody { email: string; password: string; displayName: string }
interface LoginBody    { email: string; password: string }

/**
 * Auth endpoints — only registered when AUTH_PROVIDER=local-jwt.
 * These are PUBLIC_PATHS (no Bearer token required).
 *
 * POST /auth/register — creates a PENDING user with hashed password
 * POST /auth/login    — verifies credentials, returns a signed JWT
 */
export function registerAuthEndpoints(app: FastifyInstance, deps: AuthDeps): void {
  const { prisma, userRepo, jwt, defaultClientId } = deps;

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

    // Check if email already registered
    const existing = await prisma.portalUser.findFirst({ where: { email } });
    if (existing) throw Errors.conflict('Email already registered');

    const passwordHash = await hashPassword(password);
    const authUserId   = crypto.randomUUID();

    // Create portal user (PENDING by default — admin must approve)
    await userRepo.create({ clientId: defaultClientId, authUserId, email, displayName });

    // Store the password hash on the newly created row
    await prisma.portalUser.update({
      where: { authUserId },
      data:  { passwordHash },
    });

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

    // sub = authUserId so the auth middleware can do findByAuthUserId(sub) after verification
    const accessToken = jwt.sign({
      sub:         row.authUserId,
      clientId:    row.clientId,
      email:       row.email,
      displayName: row.displayName,
    });

    return { accessToken, userId: row.id, email: row.email, displayName: row.displayName };
  });
}
