import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import GuestView from '@/components/guest-view';

export default async function LoginPage() {
    // Signed-in visitors never see this screen.
    const session = await auth();
    if (session?.user) redirect('/');
    return <GuestView />;
}
