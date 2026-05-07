import { error } from '@sveltejs/kit';

export const ssr = false;
export const prerender = false;

export const load = () => {
  if (!import.meta.env.DEV) {
    throw error(404, 'Not Found');
  }
  return {};
};
