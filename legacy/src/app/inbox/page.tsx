import { InboxPage } from '@/components/Inbox';
import { testAccountsEnabled } from '@/lib/backend/test-accounts';

export const dynamic = 'force-dynamic';
export default function InboxRoute() { return <InboxPage testAccountsEnabled={testAccountsEnabled()}/>; }
