// Shared Ecuro API helper
export function getEcuroBase(env: 'dev' | 'prod' = 'dev'): string {
  if (env === 'prod') {
    return Deno.env.get('ECURO_PROD_BASE_URL') || 'https://clinics.api.ecuro.com.br/api/v1/ecuro-light';
  }
  return Deno.env.get('ECURO_DEV_BASE_URL') || 'https://clinics.api.dev.ecuro.com.br/api/v1/ecuro-light';
}

export async function ecuroFetch(
  env: 'dev' | 'prod',
  path: string,
  init: RequestInit = {}
): Promise<Response> {
  const token = Deno.env.get('ECURO_API_TOKEN');
  if (!token) throw new Error('ECURO_API_TOKEN not configured');
  const base = getEcuroBase(env);
  const url = `${base}${path.startsWith('/') ? path : '/' + path}`;
  const headers = {
    'app-access-token': token,
    'Content-Type': 'application/json',
    ...(init.headers || {}),
  };
  return fetch(url, { ...init, headers });
}
