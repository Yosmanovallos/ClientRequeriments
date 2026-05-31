import type { IIdentityProvider, UserIdentity } from '../../Ports/IIdentityProvider';

const DEMO_USER: UserIdentity = {
  userId:      'demo-user-001',
  clientId:    '00000000-0000-0000-0000-000000000001',
  email:       'yosman.ovallos@provana.com',
  displayName: 'Yosman Ovallos',
};

/**
 * LocalIdentityProvider — accepts any non-empty token and returns the demo user.
 * Used during development / testing so no real auth service is needed.
 */
export class LocalIdentityProvider implements IIdentityProvider {
  async verify(token: string): Promise<UserIdentity> {
    if (!token) throw new Error('Missing token');
    return DEMO_USER;
  }
}
