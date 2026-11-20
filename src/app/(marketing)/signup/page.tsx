import type { Metadata } from 'next';
import Link from 'next/link';
import { AuthForm } from '@/components/marketing/auth-form';
import { ReadPage } from '@/components/marketing/read-page';

export const metadata: Metadata = { title: 'Sign up' };

export default function SignupPage() {
  return (
    <ReadPage title="Sign up">
      <AuthForm mode="signup" />
      <p className="mt-8 text-[17px] font-medium">
        Already have an account?{' '}
        <Link
          href="/login"
          className="underline decoration-2 underline-offset-4"
        >
          Log in
        </Link>
      </p>
    </ReadPage>
  );
}
