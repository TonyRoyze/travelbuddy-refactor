import { createGoogleAccount, findGoogleAccount } from './accounts';
import type { verifiedGoogleProfile } from './auth-security';

type Dependencies = { find: typeof findGoogleAccount; create: typeof createGoogleAccount };
export async function resolveGoogleAccount(profile: ReturnType<typeof verifiedGoogleProfile>, deps: Dependencies = { find: findGoogleAccount, create: createGoogleAccount }) {
  let account = await deps.find(profile.providerSubject);
  if (!account) {
    try { account = await deps.create(profile.displayName, { providerSubject: profile.providerSubject, email: profile.email, emailVerified: profile.emailVerified }); }
    catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 'P2002')) throw error;
      account = await deps.find(profile.providerSubject);
      if (!account) throw error;
    }
  }
  return account;
}
