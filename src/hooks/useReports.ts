import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

export type Period = 'today' | '7d' | '30d' | 'custom';

export interface ReportFilters {
  period: Period;
  from?: Date;
  to?: Date;
  agentId?: string; // 'all' or id
  deviceId?: string; // 'all' or id
}

export interface ReportRow {
  agent_id: string;
  agent_name: string;
  device_id: string | null;
  device_name: string | null;
  attendances: number;
  ai_transfers: number;
  ai_paused: number;
  human_paused: number;
  appointments: number;
  resolution_pct: number;
  // Status do inbox (cores)
  active_count: number;       // verde (status=active && !paused)
  replied_count: number;      // verde com resposta do usuário
  paused_count: number;       // amarelo (agent_paused)
  transferred_count: number;  // azul (status=transferred)
}

export interface ReportTotals {
  attendances: number;
  ai_transfers: number;
  ai_paused: number;
  human_paused: number;
  appointments: number;
  resolution_pct: number;
  active_count: number;
  replied_count: number;
  paused_count: number;
  transferred_count: number;
}

export interface DailyPoint {
  date: string; // YYYY-MM-DD
  attendances: number;
  ai_transfers: number;
  appointments: number;
}

export function getPeriodRange(f: ReportFilters): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (f.period === 'today') {
    return { from, to };
  }
  if (f.period === '7d') {
    from.setDate(from.getDate() - 6);
    return { from, to };
  }
  if (f.period === '30d') {
    from.setDate(from.getDate() - 29);
    return { from, to };
  }
  return { from: f.from ?? from, to: f.to ?? to };
}

interface AgentMeta {
  id: string;
  name: string;
  device_id: string | null;
  device_name: string | null;
}

export function useReports(filters: ReportFilters) {
  const [rows, setRows] = useState<ReportRow[]>([]);
  const [totals, setTotals] = useState<ReportTotals | null>(null);
  const [daily, setDaily] = useState<DailyPoint[]>([]);
  const [agents, setAgents] = useState<AgentMeta[]>([]);
  const [devices, setDevices] = useState<{ id: string; name: string }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { from, to } = getPeriodRange(filters);
      const fromIso = from.toISOString();
      const toIso = to.toISOString();

      // Carrega agentes + dispositivos
      const [{ data: ag }, { data: dv }] = await Promise.all([
        supabase.from('agents').select('id, name, device_id, devices:device_id(name)'),
        supabase.from('devices').select('id, name'),
      ]);

      const agentList: AgentMeta[] = (ag ?? []).map((a: any) => ({
        id: a.id,
        name: a.name,
        device_id: a.device_id ?? null,
        device_name: a.devices?.name ?? null,
      }));
      const deviceList = (dv ?? []).map((d: any) => ({ id: d.id, name: d.name }));

      // Filtra por agente/dispositivo
      const filteredAgents = agentList.filter((a) => {
        if (filters.agentId && filters.agentId !== 'all' && a.id !== filters.agentId) return false;
        if (filters.deviceId && filters.deviceId !== 'all' && a.device_id !== filters.deviceId) return false;
        return true;
      });

      const agentIds = filteredAgents.map((a) => a.id);

      // Conversas do período (com pelo menos uma mensagem nesse período = atendimento).
      // Aproximação: usar created_at OR last_message_at no intervalo.
      const { data: convsRaw } = await supabase
        .from('conversations')
        .select('id, agent_id, status, agent_paused, paused_by, created_at, last_message_at')
        .in('agent_id', agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000'])
        .or(`last_message_at.gte.${fromIso},created_at.gte.${fromIso}`)
        .lte('created_at', toIso)
        .limit(10000);

      const convs = (convsRaw ?? []).filter((c: any) => {
        const ref = c.last_message_at ?? c.created_at;
        return ref >= fromIso && ref <= toIso;
      });

      const { data: appts } = await supabase
        .from('appointments')
        .select('id, agent_id, created_at')
        .in('agent_id', agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000'])
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .limit(10000);

      // Agrega por agente
      const map = new Map<string, ReportRow>();
      for (const a of filteredAgents) {
        map.set(a.id, {
          agent_id: a.id,
          agent_name: a.name,
          device_id: a.device_id,
          device_name: a.device_name,
          attendances: 0,
          ai_transfers: 0,
          ai_paused: 0,
          human_paused: 0,
          appointments: 0,
          resolution_pct: 0,
          active_count: 0,
          replied_count: 0,
          paused_count: 0,
          transferred_count: 0,
        });
      }

      // Buscar quais conversas têm resposta do usuário (para "em conversa" verde)
      const convIds = (convs as any[]).map((c) => c.id);
      let repliedSet = new Set<string>();
      if (convIds.length) {
        const { data: replied } = await supabase
          .from('messages')
          .select('conversation_id')
          .in('conversation_id', convIds)
          .eq('role', 'user');
        repliedSet = new Set((replied ?? []).map((m: any) => m.conversation_id));
      }

      for (const c of convs as any[]) {
        const r = map.get(c.agent_id);
        if (!r) continue;
        r.attendances++;
        if (c.status === 'transferred') {
          r.ai_transfers++;
          r.transferred_count++;
        } else if (c.agent_paused) {
          r.paused_count++;
        } else if (c.status === 'active') {
          r.active_count++;
          if (repliedSet.has(c.id)) r.replied_count++;
        }
        if (c.agent_paused) {
          if (c.paused_by === 'human') r.human_paused++;
          else r.ai_paused++;
        }
      }
      for (const ap of (appts ?? []) as any[]) {
        const r = map.get(ap.agent_id);
        if (r) r.appointments++;
      }

      // % qualidade resolução
      for (const r of map.values()) {
        const denom = r.attendances - r.human_paused;
        r.resolution_pct = denom > 0 ? Math.round(((r.ai_transfers + r.appointments) / denom) * 100) : 0;
      }

      const rowsArr = Array.from(map.values()).sort((a, b) => b.attendances - a.attendances);

      // Totais
      const t: ReportTotals = {
        attendances: 0,
        ai_transfers: 0,
        ai_paused: 0,
        human_paused: 0,
        appointments: 0,
        resolution_pct: 0,
      };
      for (const r of rowsArr) {
        t.attendances += r.attendances;
        t.ai_transfers += r.ai_transfers;
        t.ai_paused += r.ai_paused;
        t.human_paused += r.human_paused;
        t.appointments += r.appointments;
      }
      const denom = t.attendances - t.human_paused;
      t.resolution_pct = denom > 0 ? Math.round(((t.ai_transfers + t.appointments) / denom) * 100) : 0;

      // Série diária
      const dayMap = new Map<string, DailyPoint>();
      const cursor = new Date(from);
      while (cursor <= to) {
        const k = cursor.toISOString().slice(0, 10);
        dayMap.set(k, { date: k, attendances: 0, ai_transfers: 0, appointments: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      for (const c of convs as any[]) {
        const ref = (c.last_message_at ?? c.created_at).slice(0, 10);
        const p = dayMap.get(ref);
        if (p) {
          p.attendances++;
          if (c.status === 'transferred') p.ai_transfers++;
        }
      }
      for (const ap of (appts ?? []) as any[]) {
        const ref = ap.created_at.slice(0, 10);
        const p = dayMap.get(ref);
        if (p) p.appointments++;
      }

      if (cancelled) return;
      setRows(rowsArr);
      setTotals(t);
      setDaily(Array.from(dayMap.values()));
      setAgents(agentList);
      setDevices(deviceList);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [filters.period, filters.from?.getTime(), filters.to?.getTime(), filters.agentId, filters.deviceId]);

  return { rows, totals, daily, agents, devices, loading };
}
