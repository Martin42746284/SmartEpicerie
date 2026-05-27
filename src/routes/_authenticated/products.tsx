import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { fmtMoney } from "@/lib/format";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Search, Package } from "lucide-react";

export const Route = createFileRoute("/_authenticated/products")({
  component: ProductsPage,
});

type Product = {
  id: string; name: string; category_id: string | null;
  purchase_price: number; sale_price: number; stock: number; low_stock_threshold: number;
  unit: string; description: string | null; supplier: string | null;
};

function ProductsPage() {
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const { data: products } = useQuery({
    queryKey: ["products"],
    queryFn: async () => {
      const { data, error } = await supabase.from("products").select("*,categories(*)").order("created_at", { ascending: false });
      if (error) throw error;
      return data as any[];
    },
    refetchInterval: 5000,
  });

  const { data: categories } = useQuery({
    queryKey: ["categories"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("id, name").order("name");
      return data ?? [];
    },
  });

  const filtered = (products ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase())
  );

  async function handleDelete(id: string) {
    if (!confirm("Supprimer ce produit ?")) return;
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) toast.error(error.message);
    else { toast.success("Produit supprimé"); qc.invalidateQueries({ queryKey: ["products"] }); }
  }

  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-2"><Package className="w-7 h-7 text-primary" />Produits</h1>
          <p className="text-muted-foreground text-sm">Gérez le catalogue et les prix.</p>
        </div>
        <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (!o) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4" /> Nouveau produit</Button>
          </DialogTrigger>
          <ProductDialog
            key={editing?.id ?? "new"}
            editing={editing}
            categories={categories ?? []}
            onSaved={() => { setOpen(false); setEditing(null); qc.invalidateQueries({ queryKey: ["products"] }); }}
          />
        </Dialog>
      </div>

      <Card>
        <CardHeader className="pb-3">
          <div className="relative max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Rechercher par nom ou code…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent className="px-0 sm:px-6">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Produit</TableHead>
                  <TableHead>Catégorie</TableHead>
                  <TableHead className="text-right">Prix achat</TableHead>
                  <TableHead className="text-right">Prix vente</TableHead>
                  <TableHead className="text-right">Stock</TableHead>
                  <TableHead className="text-center">Unité</TableHead>
                  <TableHead className="w-[100px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filtered.length === 0 && (
                  <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">Aucun produit</TableCell></TableRow>
                )}
                {filtered.map((p) => (
                  <TableRow key={p.id}>
                    <TableCell>
                      <div className="font-medium">{p.name}</div>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">{p.categories?.name ?? "—"}</TableCell>
                    <TableCell className="text-right text-sm">{fmtMoney(p.purchase_price)}</TableCell>
                    <TableCell className="text-right font-medium">{fmtMoney(p.sale_price)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant={p.stock === 0 ? "destructive" : p.stock <= p.low_stock_threshold ? "secondary" : "outline"}>
                        {p.stock}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center text-sm">{p.unit}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="icon" variant="ghost" onClick={() => { setEditing(p); setOpen(true); }}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        {isAdmin && (
                          <Button size="icon" variant="ghost" onClick={() => handleDelete(p.id)}>
                            <Trash2 className="w-4 h-4 text-destructive" />
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function ProductDialog({ editing, categories, onSaved }: { editing: Product | null; categories: any[]; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: editing?.name ?? "",
    category_id: editing?.category_id ?? "",
    purchase_price: editing?.purchase_price ?? 0,
    sale_price: editing?.sale_price ?? 0,
    stock: editing?.stock ?? 0,
    low_stock_threshold: editing?.low_stock_threshold ?? 5,
    unit: editing?.unit ?? "pcs",
    description: editing?.description ?? "",
    supplier: editing?.supplier ?? "",
  });
  const [busy, setBusy] = useState(false);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const payload = {
      ...form,
      category_id: form.category_id || null,
      description: form.description || null,
      supplier: form.supplier || null,
      purchase_price: Number(form.purchase_price),
      sale_price: Number(form.sale_price),
      stock: Number(form.stock),
      low_stock_threshold: Number(form.low_stock_threshold),
    };
    const res = editing
      ? await supabase.from("products").update(payload).eq("id", editing.id)
      : await supabase.from("products").insert(payload);
    setBusy(false);
    if (res.error) toast.error(res.error.message);
    else { toast.success(editing ? "Produit modifié" : "Produit ajouté"); onSaved(); }
  }

  return (
    <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>{editing ? "Modifier le produit" : "Nouveau produit"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={save} className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2 sm:col-span-2">
            <Label>Nom *</Label>
            <Input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div className="space-y-2">
            <Label>Catégorie</Label>
            <Select value={form.category_id || undefined} onValueChange={(v) => setForm({ ...form, category_id: v })}>
              <SelectTrigger><SelectValue placeholder="Choisir…" /></SelectTrigger>
              <SelectContent>
                {categories.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Unité</Label>
            <Input value={form.unit} onChange={(e) => setForm({ ...form, unit: e.target.value })} placeholder="ex: pcs, kg, L" />
          </div>
          <div className="space-y-2">
            <Label>Prix d'achat (Ar)</Label>
            <Input type="number" min={0} value={form.purchase_price} onChange={(e) => setForm({ ...form, purchase_price: e.target.valueAsNumber || 0 })} />
          </div>
          <div className="space-y-2">
            <Label>Prix de vente (Ar) *</Label>
            <Input type="number" required min={0} value={form.sale_price} onChange={(e) => setForm({ ...form, sale_price: e.target.valueAsNumber || 0 })} />
          </div>
          <div className="space-y-2">
            <Label>Stock initial</Label>
            <Input type="number" min={0} value={form.stock} onChange={(e) => setForm({ ...form, stock: e.target.valueAsNumber || 0 })} />
          </div>
          <div className="space-y-2">
            <Label>Seuil stock faible</Label>
            <Input type="number" min={0} value={form.low_stock_threshold} onChange={(e) => setForm({ ...form, low_stock_threshold: e.target.valueAsNumber || 0 })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Fournisseur</Label>
            <Input value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} />
          </div>
          <div className="space-y-2 sm:col-span-2">
            <Label>Description</Label>
            <Textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </div>
        </div>
        <DialogFooter>
          <Button type="submit" disabled={busy}>{editing ? "Enregistrer" : "Créer"}</Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}
