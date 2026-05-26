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

// ------- Business hours -------
export type Interval = { open: string; close: string }; // "HH:MM"
export type BusinessHours = Record<string, Interval[] | null>; // key "0".."6", 0=Sun

const WEEKDAY_MAP: Record<string, number> = {
  Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
};

export function brParts(iso: string): { weekday: number; minutes: number; date: string } {
  const d = new Date(iso);
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  });
  const parts = fmt.formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value || '';
  const weekday = WEEKDAY_MAP[get('weekday')] ?? 0;
  let hh = parseInt(get('hour') || '0', 10);
  if (hh === 24) hh = 0; // some runtimes return "24" at midnight
  const mm = parseInt(get('minute') || '0', 10);
  const date = `${get('year')}-${get('month')}-${get('day')}`;
  return { weekday, minutes: hh * 60 + mm, date };
}

function parseHHMM(s: string): number {
  const m = String(s || '').match(/(\d{1,2}):(\d{2})/);
  if (!m) return -1;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function normalizeBusinessHours(input: any): BusinessHours | null {
  if (!input || typeof input !== 'object') return null;
  const out: BusinessHours = {};
  let any = false;
  for (let i = 0; i < 7; i++) {
    const k = String(i);
    const v = (input as any)[k];
    if (v === null || v === undefined) { out[k] = null; continue; }
    if (Array.isArray(v)) {
      const ivs: Interval[] = [];
      for (const iv of v) {
        if (iv && typeof iv.open === 'string' && typeof iv.close === 'string'
            && parseHHMM(iv.open) >= 0 && parseHHMM(iv.close) > parseHHMM(iv.open)) {
          ivs.push({ open: iv.open, close: iv.close });
        }
      }
      out[k] = ivs.length ? ivs : null;
      if (ivs.length) any = true;
    } else {
      out[k] = null;
    }
  }
  return any ? out : null;
}

export function isWithinBusinessHours(iso: string, bh?: BusinessHours | null): boolean {
  if (!bh) return true; // no policy → allow
  const { weekday, minutes } = brParts(iso);
  const ivs = bh[String(weekday)];
  if (!ivs || ivs.length === 0) return false;
  return ivs.some((iv) => {
    const o = parseHHMM(iv.open);
    const c = parseHHMM(iv.close);
    return minutes >= o && minutes < c;
  });
}
