import { redirect } from 'next/navigation';
import { AccountOnboarding } from '@/components/AccountOnboarding';
import { sessionAccount, publicAccount } from '@/lib/backend/sessions';
export const dynamic = 'force-dynamic';
export default async function Page() {
  const account = await sessionAccount();
  if (!account) redirect('/login');
  if (account.data.onboarding === 'completed') redirect('/account');
  return <AccountOnboarding account={publicAccount(account)} />;
}
