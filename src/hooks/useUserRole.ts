import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuthStore } from '@/stores/authStore';

export type AppRole = 'admin' | 'user' | 'client';

export function useUserRole() {
  const user = useAuthStore((s) => s.user);
  const [role, setRole] = useState<AppRole | null>(null);
  const [allowedDeviceIds, setAllowedDeviceIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) {
      setRole(null);
      setAllowedDeviceIds([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: roles } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', user.id);

      const r: AppRole = (roles?.find((x: any) => x.role === 'admin')?.role
        ?? roles?.find((x: any) => x.role === 'client')?.role
        ?? 'user') as AppRole;

      let devices: string[] = [];
      if (r === 'client') {
        const { data: access } = await supabase
          .from('client_device_access' as any)
          .select('device_id')
          .eq('user_id', user.id);
        devices = (access ?? []).map((a: any) => a.device_id);
      }

      if (!cancelled) {
        setRole(r);
        setAllowedDeviceIds(devices);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user?.id]);

  return { role, allowedDeviceIds, loading, isClient: role === 'client' };
}
