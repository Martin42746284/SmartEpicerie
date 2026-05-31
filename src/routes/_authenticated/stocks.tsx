import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { Boxes, AlertTriangle, ArrowDownToLine, ArrowUpFromLine, Plus, Search } from "lucide-react";

export const Route = createFileRoute("/_authenticated/stocks")({
  component: StocksPage,
});

function StocksPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [form, setForm] = useState({ product_id: "", type: "in" as "in" | "out" | "adjustment", quantity: 0, reason: "" });

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*").order("name");
      return data ?? [];
    },
    refetchInterval: 5000,
  });
  const { data: movements } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const { data } = await supabase.from("stock_movements").select("*, products(name)").order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  const lowStock = (products ?? []).filter((p) => p.stock <= p.low_stock_threshold);
  const filteredProducts = (products ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const filteredMovements = (movements ?? []).filter((m) => m.products?.name?.toLowerCase().includes(search.toLowerCase()));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !form.product_id || form.quantity <= 0) return;
    const product = products?.find((p) => p.id === form.product_id);
    if (!product) return;

    const delta = form.type === "in" ? form.quantity : form.type === "out" ? -form.quantity : form.quantity - product.stock;
    const newStock = form.type === "adjustment" ? form.quantity : product.stock + delta;
    if (newStock < 0) return toast.error("Stock insuffisant");

    const { error: e1 } = await supabase.from("products").update({ stock: newStock }).eq("id", form.product_id);
    if (e1) return toast.error(e1.message);

    await supabase.from("stock_movements").insert({
      product_id: form.product_id, type: form.type,
      quantity: form.type === "adjustment" ? Math.abs(delta) : form.quantity,
      reason: form.reason || null, user_id: user.id,
    });

    toast.success("Mouvement enregistré");
    setOpen(false);
    setForm({ product_id: "", type: "in", quantity: 0, reason: "" });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["movements"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-2"><Boxes className="w-7 h-7 text-primary" />Stocks</h1>
          <p className="text-muted-foreground text-sm">Suivi en temps réel et historique des mouvements.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild><Button className="gap-2"><Plus className="w-4 h-4" /> Mouvement de stock</Button></DialogTrigger>
          <DialogContent>
            <DialogHeader><DialogTitle>Nouveau mouvement</DialogTitle></DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label>Produit *</Label>
                <Select value={form.product_id} onValueChange={(v) => setForm({ ...form, product_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Choisir un produit" /></SelectTrigger>
                  <SelectContent>{(products ?? []).map((p) => <SelectItem key={p.id} value={p.id}>{p.name} (stock: {p.stock})</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Type *</Label>
                <Select value={form.type} onValueChange={(v: any) => setForm({ ...form, type: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="in">Entrée (réapprovisionnement)</SelectItem>
                    <SelectItem value="out">Sortie (perte, casse…)</SelectItem>
                    <SelectItem value="adjustment">Ajustement (inventaire)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>{form.type === "adjustment" ? "Nouveau stock *" : "Quantité *"}</Label>
                <Input type="number" required min={0} value={form.quantity} onChange={(e) => setForm({ ...form, quantity: e.target.valueAsNumber || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>Motif</Label>
                <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} placeholder="Ex: Livraison fournisseur" />
              </div>
              <DialogFooter><Button type="submit">Enregistrer</Button></DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {lowStock.length > 0 && (
        <Card className="border-warning/50 bg-warning/5">
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2 text-warning"><AlertTriangle className="w-5 h-5" /> {lowStock.length} produit(s) en stock faible</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-2">
              {lowStock.map((p) => (
                <Badge key={p.id} variant={p.stock === 0 ? "destructive" : "secondary"}>{p.name} · {p.stock}</Badge>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="inventory">
        <TabsList>
          <TabsTrigger value="inventory">Inventaire</TabsTrigger>
          <TabsTrigger value="movements">Mouvements</TabsTrigger>
        </TabsList>
        <TabsContent value="inventory" className="mt-4">
          <Card>
            <CardContent className="px-0 sm:px-6 pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Produit</TableHead>
                      <TableHead>Code</TableHead>
                      <TableHead className="text-right">Stock</TableHead>
                      <TableHead className="text-right">Seuil</TableHead>
                      <TableHead className="text-right">Statut</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(products ?? []).map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{p.code ?? "—"}</TableCell>
                        <TableCell className="text-right font-semibold">{p.stock}</TableCell>
                        <TableCell className="text-right text-muted-foreground">{p.low_stock_threshold}</TableCell>
                        <TableCell className="text-right">
                          {p.stock === 0 ? <Badge variant="destructive">Rupture</Badge>
                            : p.stock <= p.low_stock_threshold ? <Badge variant="secondary" className="bg-warning/20 text-warning-foreground">Faible</Badge>
                            : <Badge variant="outline" className="text-success border-success/30">OK</Badge>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="movements" className="mt-4">
          <Card>
            <CardContent className="px-0 sm:px-6 pt-6">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Produit</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-right">Quantité</TableHead>
                      <TableHead>Motif</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(movements ?? []).length === 0 && <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-12">Aucun mouvement</TableCell></TableRow>}
                    {(movements ?? []).map((m: any) => (
                      <TableRow key={m.id}>
                        <TableCell className="text-sm">{fmtDate(m.created_at)}</TableCell>
                        <TableCell className="font-medium">{m.products?.name ?? "—"}</TableCell>
                        <TableCell>
                          {m.type === "in" && <Badge variant="outline" className="text-success border-success/30 gap-1"><ArrowDownToLine className="w-3 h-3" />Entrée</Badge>}
                          {m.type === "out" && <Badge variant="outline" className="text-destructive border-destructive/30 gap-1"><ArrowUpFromLine className="w-3 h-3" />Sortie</Badge>}
                          {m.type === "adjustment" && <Badge variant="secondary">Ajustement</Badge>}
                        </TableCell>
                        <TableCell className="text-right font-medium">{m.quantity}</TableCell>
                        <TableCell className="text-sm text-muted-foreground">{m.reason ?? "—"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
