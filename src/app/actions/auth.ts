'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';

export async function login(prevState: any, formData: FormData) {
  const password = formData.get('password') as string;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!password) {
    return { error: 'Password is required' };
  }

  if (password !== adminPassword) {
    return { error: 'Invalid password' };
  }

  // Set auth cookie
  (await cookies()).set('foxora_auth', 'authenticated', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7, // 1 week
    path: '/',
  });

  redirect('/');
}

export async function logout() {
  (await cookies()).delete('foxora_auth');
  redirect('/login');
}
