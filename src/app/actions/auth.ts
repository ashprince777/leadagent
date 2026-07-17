'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import * as bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { Client } from 'pg';

const JWT_SECRET = new TextEncoder().encode(process.env.ADMIN_PASSWORD || 'default_secret');

export async function getSession() {
  const authCookie = (await cookies()).get('foxora_auth')?.value;
  if (!authCookie) return null;
  try {
    const { payload } = await jwtVerify(authCookie, JWT_SECRET);
    return { role: payload.role as string, email: payload.email as string };
  } catch(err) {
    return null;
  }
}

function getClient() {
  let url = process.env.POSTGRES_URL || '';
  if (url.includes('?')) url = url.split('?')[0];
  return new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });
}

export async function login(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;
  const adminPassword = process.env.ADMIN_PASSWORD;

  if (!email || !password) return { error: 'Email and Password are required' };

  // Super Admin Login
  if (email === 'admin@foxora.com' && password === adminPassword) {
    await setAuthCookie({ role: 'admin', email, status: 'approved' });
    redirect('/');
  }

  const client = getClient();
  let success = false;
  try {
    await client.connect();
    const res = await client.query('SELECT * FROM users WHERE email = $1', [email]);
    if (res.rows.length === 0) return { error: 'Invalid email or password' };
    
    const user = res.rows[0];
    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) return { error: 'Invalid email or password' };
    
    if (user.status === 'pending') return { error: 'Your account is pending admin approval.' };
    
    await setAuthCookie({ role: user.role, email: user.email, status: user.status });
    success = true;
  } catch(err) {
    console.error(err);
    return { error: 'Authentication failed' };
  } finally {
    await client.end();
  }
  if (success) redirect('/');
}

export async function signup(prevState: any, formData: FormData) {
  const email = formData.get('email') as string;
  const password = formData.get('password') as string;

  if (!email || !password || password.length < 6) {
    return { error: 'Valid Email and Password (min 6 chars) are required' };
  }

  const client = getClient();
  try {
    await client.connect();
    const res = await client.query('SELECT id FROM users WHERE email = $1', [email]);
    if (res.rows.length > 0) return { error: 'Email already exists' };
    
    const hash = await bcrypt.hash(password, 10);
    await client.query('INSERT INTO users (email, password_hash, role, status) VALUES ($1, $2, $3, $4)', [email, hash, 'sales', 'pending']);
    return { success: 'Account created! Please wait for admin approval to login.' };
  } catch(err) {
    console.error(err);
    return { error: 'Signup failed' };
  } finally {
    await client.end();
  }
}

async function setAuthCookie(payload: any) {
  const token = await new SignJWT(payload)
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);

  (await cookies()).set('foxora_auth', token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
    path: '/',
  });
}

export async function logout() {
  (await cookies()).delete('foxora_auth');
  redirect('/login');
}
