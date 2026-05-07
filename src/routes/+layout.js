import { redirect } from '@sveltejs/kit';
import { getCurrentUser } from '$lib/api/supabase.js';

export const ssr = false;
export const prerender = false;

const PUBLIC_ROUTES = new Set(['/login']);

export async function load({ url }) {
  const pathname = url.pathname;

  if (PUBLIC_ROUTES.has(pathname)) {
    return {};
  }

  const user = await getCurrentUser();

  if (!user) {
    const qs = pathname === '/' ? '' : `?redirect=${encodeURIComponent(pathname)}`;
    throw redirect(307, `/login${qs}`);
  }

  return { user };
}
