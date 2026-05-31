import jwt from 'jsonwebtoken';
import type { IIdentityProvider, UserIdentity } from '../../Ports/IIdentityProvider.js';

export interface LocalJwtConfig {
  secret:     string;
  expiresIn?: string; // default '7d'
}

interface LocalJwtPayload {
  sub:         string;
  clientId:    string;
  email:       string;
  displayName: string;
  iat?:        number;
  exp?:        number;
}

/**
 * LocalJwtIdentityProvider — issues and verifies HS256 JWTs locally.
 * Used with AUTH_PROVIDER=local-jwt for local development / demos.
 * Migration path: swap for SupabaseIdentityProvider or EntraIdentityProvider
 * by changing AUTH_PROVIDER env var. No business logic changes needed.
 */
export class LocalJwtIdentityProvider implements IIdentityProvider {
  private readonly secret:    string;
  private readonly expiresIn: string;

  constructor(cfg: LocalJwtConfig) {
    this.secret    = cfg.secret;
    this.expiresIn = cfg.expiresIn ?? '7d';
  }

  async verify(token: string): Promise<UserIdentity> {
    const decoded = jwt.verify(token, this.secret, {
      algorithms: ['HS256'],
    }) as LocalJwtPayload;

    return {
      userId:      decoded.sub,
      clientId:    decoded.clientId,
      email:       decoded.email,
      displayName: decoded.displayName,
    };
  }

  /** Sign a new token for a portal user. Called only by AuthEndpoints after credential verification. */
  sign(payload: { sub: string; clientId: string; email: string; displayName: string }): string {
    return jwt.sign(
      { clientId: payload.clientId, email: payload.email, displayName: payload.displayName },
      this.secret,
      { algorithm: 'HS256', expiresIn: this.expiresIn as jwt.SignOptions['expiresIn'], subject: payload.sub },
    );
  }
}
