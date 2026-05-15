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
  attendances: number;     // conversas iniciadas (deduplicado por contact_number)
  ai_paused: number;       // pausadas pela IA
  human_paused: number;    // pausadas pelo Inbox (humano)
  ai_transfers: number;    // transferidas para humano pela IA
  appointments: number;    // agendamentos no período
  resolution_pct: number;  // (appointments + ai_transfers) / attendances
}

export interface ReportTotals {
  attendances: number;
  ai_paused: number;
  human_paused: number;
  ai_transfers: number;
  appointments: number;
  resolution_pct: number;
}

export interface DailyPoint {
  date: string;
  attendances: number;
  appointments: number;
}

export function getPeriodRange(f: ReportFilters): { from: Date; to: Date } {
  const to = new Date();
  const from = new Date();
  from.setHours(0, 0, 0, 0);
  if (f.period === 'today') return { from, to };
  if (f.period === '7d') { from.setDate(from.getDate() - 6); return { from, to }; }
  if (f.period === '30d') { from.setDate(from.getDate() - 29); return { from, to }; }
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

      const filteredAgents = agentList.filter((a) => {
        if (filters.agentId && filters.agentId !== 'all' && a.id !== filters.agentId) return false;
        if (filters.deviceId && filters.deviceId !== 'all' && a.device_id !== filters.deviceId) return false;
        return true;
      });

      const agentIds = filteredAgents.map((a) => a.id);
      const safeIds = agentIds.length ? agentIds : ['00000000-0000-0000-0000-000000000000'];

      const { data: convsRaw } = await supabase
        .from('conversations')
        .select('id, agent_id, contact_number, status, agent_paused, paused_by, created_at, last_message_at')
        .in('agent_id', safeIds)
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
        .in('agent_id', safeIds)
        .gte('created_at', fromIso)
        .lte('created_at', toIso)
        .limit(10000);

      const map = new Map<string, ReportRow>();
      const seenContacts = new Map<string, Set<string>>(); // agent_id -> set(contact_number)
      for (const a of filteredAgents) {
        map.set(a.id, {
          agent_id: a.id,
          agent_name: a.name,
          device_id: a.device_id,
          device_name: a.device_name,
          attendances: 0,
          ai_paused: 0,
          human_paused: 0,
          ai_transfers: 0,
          appointments: 0,
          resolution_pct: 0,
        });
        seenContacts.set(a.id, new Set());
      }

      for (const c of convs as any[]) {
        const r = map.get(c.agent_id);
        if (!r) continue;
        const seen = seenContacts.get(c.agent_id)!;
        const key = c.contact_number ?? c.id;
        if (!seen.has(key)) {
          seen.add(key);
          r.attendances++;
        }
        if (c.status === 'transferred') r.ai_transfers++;
        if (c.agent_paused) {
          if (c.paused_by === 'human') r.human_paused++;
          else r.ai_paused++;
        }
      }
      for (const ap of (appts ?? []) as any[]) {
        const r = map.get(ap.agent_id);
        if (r) r.appointments++;
      }

      for (const r of map.values()) {
        r.resolution_pct = r.attendances > 0
          ? Math.round(((r.appointments + r.ai_transfers) / r.attendances) * 100)
          : 0;
      }

      const rowsArr = Array.from(map.values()).sort((a, b) => b.attendances - a.attendances);

      const t: ReportTotals = {
        attendances: 0,
        ai_paused: 0,
        human_paused: 0,
        appointments: 0,
        resolution_pct: 0,
      };
      for (const r of rowsArr) {
        t.attendances += r.attendances;
        t.ai_paused += r.ai_paused;
        t.human_paused += r.human_paused;
        t.appointments += r.appointments;
      }
      t.resolution_pct = t.attendances > 0 ? Math.round((t.appointments / t.attendances) * 100) : 0;

      // Série diária — conversas iniciadas (deduplicado por contato dentro do dia) vs agendamentos
      const dayMap = new Map<string, DailyPoint>();
      const cursor = new Date(from);
      while (cursor <= to) {
        const k = cursor.toISOString().slice(0, 10);
        dayMap.set(k, { date: k, attendances: 0, appointments: 0 });
        cursor.setDate(cursor.getDate() + 1);
      }
      const dayContacts = new Map<string, Set<string>>();
      for (const c of convs as any[]) {
        const ref = (c.last_message_at ?? c.created_at).slice(0, 10);
        const p = dayMap.get(ref);
        if (!p) continue;
        if (!dayContacts.has(ref)) dayContacts.set(ref, new Set());
        const set = dayContacts.get(ref)!;
        const key = `${c.agent_id}:${c.contact_number ?? c.id}`;
        if (!set.has(key)) {
          set.add(key);
          p.attendances++;
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
    return () => { cancelled = true; };
  }, [filters.period, filters.from?.getTime(), filters.to?.getTime(), filters.agentId, filters.deviceId]);

  return { rows, totals, daily, agents, devices, loading };
}
