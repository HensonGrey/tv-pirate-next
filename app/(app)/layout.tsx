import { redirect } from 'next/navigation';
import { auth } from '@/auth';

// Replaces the old RequireAuth probe: the session is known before the first byte
// of HTML, so there is no hint to reconcile. see: docs/decisions/auth.md
export default async function AppLayout({ children }: LayoutProps<'/'>) {
    const session = await auth();
    if (!session?.user) redirect('/login');
    return <>{children}</>;
}
