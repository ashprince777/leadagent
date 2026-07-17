import { NextResponse } from 'next/server';
import { Client } from 'pg';

function getClient() {
  let url = process.env.POSTGRES_URL || '';
  if (url.includes('?')) url = url.split('?')[0];
  return new Client({
    connectionString: url,
    ssl: { rejectUnauthorized: false }
  });
}

// GET all users
export async function GET() {
  const client = getClient();
  try {
    await client.connect();
    // Exclude password hashes from response
    const res = await client.query('SELECT id, email, role, status, created_at FROM users ORDER BY created_at DESC');
    return NextResponse.json({ success: true, users: res.rows });
  } catch (error) {
    console.error("GET Users Error:", error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  } finally {
    await client.end();
  }
}

// PUT: Update user role or status
export async function PUT(req: Request) {
  const client = getClient();
  try {
    const { userId, role, status } = await req.json();
    await client.connect();

    if (role !== undefined) {
      await client.query('UPDATE users SET role = $1 WHERE id = $2', [role, userId]);
    }
    if (status !== undefined) {
      await client.query('UPDATE users SET status = $1 WHERE id = $2', [status, userId]);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("PUT Users Error:", error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  } finally {
    await client.end();
  }
}

// DELETE: Delete a user
export async function DELETE(req: Request) {
  const { searchParams } = new URL(req.url);
  const userId = searchParams.get('userId');
  if (!userId) return NextResponse.json({ success: false }, { status: 400 });
  
  const client = getClient();
  try {
    await client.connect();
    await client.query('DELETE FROM users WHERE id = $1', [userId]);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE Users Error:", error);
    return NextResponse.json({ success: false, error: 'Database error' }, { status: 500 });
  } finally {
    await client.end();
  }
}
