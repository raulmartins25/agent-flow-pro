import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

type Appointment = {
  id: string;
  contact_name: string | null;
  contact_number: string;
  start_time: string;
  clinic_name: string | null;
  specialty_name: string | null;
  status: string;
  reminder_24h_status: string;
  reminder_2h_status: string;
  confirmed_at: string | null;
};

const statusVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "confirmed") return "default";
  if (s === "cancelled") return "destructive";
  if (s === "completed") return "secondary";
  return "outline";
};

const reminderVariant = (s: string): "default" | "secondary" | "destructive" | "outline" => {
  if (s === "confirmed") return "default";
  if (s === "sent") return "secondary";
  if (s === "skipped") return "destructive";
  return "outline";
};

const reminderLabel = (s: string) =>
  ({ pending: "Pendente", sent: "Enviado", confirmed: "Confirmado", skipped: "Pulado" } as Record<string, string>)[s] || s;

const statusLabel = (s: string) =>
  ({ scheduled: "Agendado", confirmed: "Confirmado", cancelled: "Cancelado", completed: "Concluído" } as Record<string, string>)[s] || s;

export default function AppointmentsPage() {
  const [items, setItems] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("appointments")
        .select("id, contact_name, contact_number, start_time, clinic_name, specialty_name, status, reminder_24h_status, reminder_2h_status, confirmed_at")
        .order("start_time", { ascending: true });
      setItems((data as Appointment[]) || []);
      setLoading(false);
    })();
  }, []);

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Agendamentos</h1>
        <p className="text-muted-foreground">Acompanhe lembretes e confirmações dos pacientes.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Próximos e recentes</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-muted-foreground">Carregando…</p>
          ) : items.length === 0 ? (
            <p className="text-muted-foreground">Nenhum agendamento ainda.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Paciente</TableHead>
                  <TableHead>Quando</TableHead>
                  <TableHead>Clínica</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Lembrete 24h</TableHead>
                  <TableHead>Lembrete 2h</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <div className="font-medium">{a.contact_name || "—"}</div>
                      <div className="text-xs text-muted-foreground">{a.contact_number}</div>
                    </TableCell>
                    <TableCell>
                      {new Date(a.start_time).toLocaleString("pt-BR", {
                        timeZone: "America/Sao_Paulo",
                        day: "2-digit", month: "2-digit", year: "2-digit",
                        hour: "2-digit", minute: "2-digit",
                      })}
                    </TableCell>
                    <TableCell>
                      <div>{a.clinic_name || "—"}</div>
                      {a.specialty_name && <div className="text-xs text-muted-foreground">{a.specialty_name}</div>}
                    </TableCell>
                    <TableCell><Badge variant={statusVariant(a.status)}>{statusLabel(a.status)}</Badge></TableCell>
                    <TableCell><Badge variant={reminderVariant(a.reminder_24h_status)}>{reminderLabel(a.reminder_24h_status)}</Badge></TableCell>
                    <TableCell><Badge variant={reminderVariant(a.reminder_2h_status)}>{reminderLabel(a.reminder_2h_status)}</Badge></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
