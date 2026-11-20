import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/marketing/auth-form';
import { ReadPage } from '@/components/marketing/read-page';

export const metadata: Metadata = { title: 'Log in' };

export default function LoginPage() {
  return (
    <ReadPage title="Log in">
      <AuthForm mode="login" />
      <p className="mt-8 text-[17px] font-medium">
        New to Keel?{' '}
        <Link
          href="/signup"
          className="underline decoration-2 underline-offset-4"
        >
          Sign up
        </Link>
      </p>
    </ReadPage>
  );
}
