import { useState } from "react";
import { Search, MapPin, Phone, Download, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

interface Contact {
  name: string;
  phone: string;
  address: string;
  category: string;
}

export default function ProspectingPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [city, setCity] = useState("");
  const [maxResults, setMaxResults] = useState(50);
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [totalRaw, setTotalRaw] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async () => {
    if (!searchQuery.trim() || !city.trim()) {
      toast.error("Preencha o nicho e a cidade");
      return;
    }

    setLoading(true);
    setSearched(true);
    setContacts([]);

    try {
      const { data, error } = await supabase.functions.invoke("apify-google-maps", {
        body: { searchQuery: searchQuery.trim(), city: city.trim(), maxResults },
      });

      if (error) throw error;
      if (data?.error) throw new Error(data.error);

      setContacts(data.contacts || []);
      setTotalRaw(data.totalRaw || 0);
      toast.success(`${data.contacts?.length || 0} contatos com telefone encontrados`);
    } catch (err: any) {
      console.error(err);
      toast.error(err.message || "Erro ao buscar no Google Maps");
    } finally {
      setLoading(false);
    }
  };

  const handleExportCSV = () => {
    if (contacts.length === 0) return;
    const header = "Nome,Telefone,Endereço,Categoria\n";
    const rows = contacts.map(c =>
      `"${c.name}","${c.phone}","${c.address}","${c.category}"`
    ).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prospeccao_${searchQuery}_${city}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("CSV exportado!");
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Prospecção Google Maps</h1>
        <p className="text-muted-foreground">Busque negócios por nicho e cidade para extrair contatos</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <MapPin className="h-5 w-5" />
            Buscar Negócios
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-1">
              <label className="text-sm font-medium mb-1 block">Nicho / Segmento</label>
              <Input
                placeholder="Ex: Clínicas odontológicas"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                disabled={loading}
              />
            </div>
            <div className="md:col-span-1">
              <label className="text-sm font-medium mb-1 block">Cidade</label>
              <Input
                placeholder="Ex: Goiânia, GO"
                value={city}
                onChange={e => setCity(e.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <label className="text-sm font-medium mb-1 block">Máx. resultados</label>
              <Input
                type="number"
                min={5}
                max={200}
                value={maxResults}
                onChange={e => setMaxResults(Number(e.target.value))}
                disabled={loading}
              />
            </div>
            <div className="flex items-end">
              <Button onClick={handleSearch} disabled={loading} className="w-full">
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    Buscando...
                  </>
                ) : (
                  <>
                    <Search className="h-4 w-4 mr-2" />
                    Buscar
                  </>
                )}
              </Button>
            </div>
          </div>
          {loading && (
            <p className="text-sm text-muted-foreground mt-3">
              ⏳ A busca pode levar até 2 minutos dependendo da quantidade de resultados...
            </p>
          )}
        </CardContent>
      </Card>

      {searched && !loading && (
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-lg">Resultados</CardTitle>
              <p className="text-sm text-muted-foreground">
                {totalRaw} encontrados no Google Maps · {contacts.length} com telefone
              </p>
            </div>
            {contacts.length > 0 && (
              <Button variant="outline" size="sm" onClick={handleExportCSV}>
                <Download className="h-4 w-4 mr-2" />
                Exportar CSV
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {contacts.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">
                Nenhum contato com telefone encontrado. Tente outro nicho ou cidade.
              </p>
            ) : (
              <div className="rounded-md border overflow-auto max-h-[500px]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Nome</TableHead>
                      <TableHead>Telefone</TableHead>
                      <TableHead className="hidden md:table-cell">Endereço</TableHead>
                      <TableHead className="hidden md:table-cell">Categoria</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {contacts.map((c, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{c.name}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="gap-1">
                            <Phone className="h-3 w-3" />
                            {c.phone}
                          </Badge>
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {c.address}
                        </TableCell>
                        <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                          {c.category}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
