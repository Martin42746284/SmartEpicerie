import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { fmtMoney, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { ShoppingCart, Plus, Minus, X, Search, Receipt, Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

type CartLine = { product_id: string; product_name: string; unit_price: number; purchase_price: number; quantity: number; stock: number };

function SalesPage() {
  return (
    <div className="p-4 sm:p-6 space-y-4 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-2"><ShoppingCart className="w-7 h-7 text-primary" />Ventes</h1>
        <p className="text-muted-foreground text-sm">Encaissement et historique des transactions.</p>
      </div>
      <Tabs defaultValue="new">
        <TabsList>
          <TabsTrigger value="new">Nouvelle vente</TabsTrigger>
          <TabsTrigger value="history">Historique</TabsTrigger>
        </TabsList>
        <TabsContent value="new" className="mt-4"><NewSale /></TabsContent>
        <TabsContent value="history" className="mt-4"><SalesHistory /></TabsContent>
      </Tabs>
    </div>
  );
}

function NewSale() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customer, setCustomer] = useState("");
  const [receipt, setReceipt] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [insufficientStock, setInsufficientStock] = useState<CartLine | null>(null);

  const { data: products } = useQuery({
    queryKey: ["products-for-sale"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("id, name, sale_price, purchase_price, stock").gt("stock", 0).order("name");
      return data ?? [];
    },
  });

  const filtered = (products ?? []).filter((p) => p.name.toLowerCase().includes(search.toLowerCase()));
  const total = useMemo(() => cart.reduce((s, l) => s + l.unit_price * l.quantity, 0), [cart]);
  const profit = useMemo(() => cart.reduce((s, l) => s + (l.unit_price - l.purchase_price) * l.quantity, 0), [cart]);

  function add(p: any) {
    setCart((c) => {
      const ex = c.find((x) => x.product_id === p.id);
      if (ex) {
        if (ex.quantity >= ex.stock) { toast.warning("Stock insuffisant"); return c; }
        return c.map((x) => x.product_id === p.id ? { ...x, quantity: x.quantity + 1 } : x);
      }
      return [...c, { product_id: p.id, product_name: p.name, unit_price: Number(p.sale_price), purchase_price: Number(p.purchase_price), quantity: 1, stock: p.stock }];
    });
  }
  function updateQty(id: string, delta: number) {
    setCart((c) => c.flatMap((l) => {
      if (l.product_id !== id) return [l];
      const q = l.quantity + delta;
      if (q <= 0) return [];
      if (q > l.stock) { toast.warning("Stock insuffisant"); return [l]; }
      return [{ ...l, quantity: q }];
    }));
  }
  function remove(id: string) { setCart((c) => c.filter((l) => l.product_id !== id)); }

  async function checkout() {
    if (cart.length === 0 || !user) return;
    setBusy(true);

    // Verify stock availability before checkout
    const { data: currentProducts, error: fetchError } = await supabase.from("products").select("id, stock").in("id", cart.map(l => l.product_id));
    if (fetchError || !currentProducts) { setBusy(false); return toast.error("Erreur lors de la vérification du stock"); }

    for (const item of cart) {
      const current = currentProducts.find(p => p.id === item.product_id);
      if (!current || current.stock < item.quantity) {
        setBusy(false);
        setInsufficientStock(item);
        return;
      }
    }

    const { data: sale, error } = await supabase.from("sales").insert({
      user_id: user.id, total, profit, customer_name: customer || null,
    }).select().single();
    if (error || !sale) { setBusy(false); return toast.error(error?.message ?? "Erreur"); }

    const items = cart.map((l) => ({
      sale_id: sale.id,
      product_id: l.product_id,
      product_name: l.product_name,
      quantity: l.quantity,
      unit_price: l.unit_price,
      purchase_price: l.purchase_price,
      subtotal: l.unit_price * l.quantity,
    }));
    const itemsRes = await supabase.from("sale_items").insert(items);
    if (itemsRes.error) { setBusy(false); return toast.error(itemsRes.error.message); }

    // Update stocks + movements (sequential is fine for small carts)
    for (const l of cart) {
      await supabase.from("products").update({ stock: l.stock - l.quantity }).eq("id", l.product_id);
      await supabase.from("stock_movements").insert({
        product_id: l.product_id, type: "out", quantity: l.quantity, reason: `Vente #${sale.id.slice(0, 8)}`, user_id: user.id,
      });
    }

    setBusy(false);
    toast.success("Vente enregistrée");
    setReceipt({ ...sale, items, customer_name: customer });
    setCart([]); setCustomer("");
    qc.invalidateQueries({ queryKey: ["products-for-sale"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["sales-history"] });
  }

  return (
    <div className="grid lg:grid-cols-[1fr_400px] gap-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input placeholder="Rechercher un produit…" value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 max-h-[60vh] overflow-y-auto">
            {filtered.map((p) => (
              <button key={p.id} onClick={() => add(p)} className="text-left p-3 rounded-lg border bg-card hover:border-primary hover:shadow-md transition-all">
                <div className="font-medium text-sm line-clamp-2">{p.name}</div>
                <div className="text-primary font-semibold text-sm mt-1">{fmtMoney(p.sale_price)}</div>
                <div className="text-xs text-muted-foreground">Stock: {p.stock}</div>
              </button>
            ))}
            {filtered.length === 0 && <p className="col-span-full text-center text-muted-foreground py-8 text-sm">Aucun produit disponible</p>}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-20 h-fit">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Receipt className="w-5 h-5" /> Panier</CardTitle>
          <CardDescription>{cart.length} article(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[40vh] overflow-y-auto space-y-2">
            {cart.length === 0 && <p className="text-sm text-muted-foreground text-center py-6">Cliquez sur un produit pour l'ajouter</p>}
            {cart.map((l) => (
              <div key={l.product_id} className="flex items-center gap-2 text-sm">
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.product_name}</div>
                  <div className="text-xs text-muted-foreground">{fmtMoney(l.unit_price)}</div>
                </div>
                <div className="flex items-center gap-1">
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.product_id, -1)}><Minus className="w-3 h-3" /></Button>
                  <span className="w-6 text-center font-medium">{l.quantity}</span>
                  <Button size="icon" variant="outline" className="h-7 w-7" onClick={() => updateQty(l.product_id, 1)}><Plus className="w-3 h-3" /></Button>
                  <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(l.product_id)}><X className="w-3 h-3" /></Button>
                </div>
              </div>
            ))}
          </div>
          <Separator />
          <Input placeholder="Nom client (optionnel)" value={customer} onChange={(e) => setCustomer(e.target.value)} />
          <div className="space-y-1 text-sm">
            <div className="flex justify-between text-muted-foreground"><span>Bénéfice estimé</span><span>{fmtMoney(profit)}</span></div>
            <div className="flex justify-between text-lg font-display font-bold"><span>Total</span><span className="text-primary">{fmtMoney(total)}</span></div>
          </div>
          <Button className="w-full" size="lg" disabled={cart.length === 0 || busy} onClick={checkout}>
            Valider la vente
          </Button>
        </CardContent>
      </Card>

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-center">Reçu de vente</DialogTitle></DialogHeader>
          {receipt && (
            <div className="font-mono text-xs space-y-2" id="receipt-print">
              <div className="text-center">
                <div className="font-bold text-base">ÉpiceriePro</div>
                <div className="text-muted-foreground">{fmtDate(receipt.created_at)}</div>
                <div className="text-muted-foreground">N° {receipt.id.slice(0, 8).toUpperCase()}</div>
                {receipt.customer_name && <div className="mt-1">Client : {receipt.customer_name}</div>}
              </div>
              <Separator />
              {receipt.items.map((it: any, i: number) => (
                <div key={i} className="flex justify-between">
                  <span>{it.quantity} × {it.product_name}</span>
                  <span>{fmtMoney(it.subtotal)}</span>
                </div>
              ))}
              <Separator />
              <div className="flex justify-between font-bold text-sm"><span>TOTAL</span><span>{fmtMoney(receipt.total)}</span></div>
              <div className="text-center text-muted-foreground pt-2">Merci de votre visite !</div>
            </div>
          )}
          <Button onClick={() => window.print()} variant="outline" className="gap-2"><Printer className="w-4 h-4" /> Imprimer</Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!insufficientStock} onOpenChange={(o) => !o && setInsufficientStock(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle className="text-center text-destructive">Stock insuffisant</DialogTitle></DialogHeader>
          {insufficientStock && (
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
                <p className="font-medium">{insufficientStock.product_name}</p>
                <p className="text-sm text-muted-foreground">
                  Quantité demandée : <span className="font-semibold text-foreground">{insufficientStock.quantity}</span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Stock disponible : <span className="font-semibold text-destructive">{insufficientStock.stock}</span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">Veuillez ajuster les quantités dans votre panier avant de continuer.</p>
            </div>
          )}
          <Button onClick={() => setInsufficientStock(null)} className="w-full">Fermer</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SalesHistory() {
  const { data: sales } = useQuery({
    queryKey: ["sales-history"],
    queryFn: async () => {
      const { data } = await supabase.from("sales").select("*, sale_items(*)").order("created_at", { ascending: false }).limit(100);
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardContent className="px-0 sm:px-6 pt-6">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>N°</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Client</TableHead>
                <TableHead className="text-right">Articles</TableHead>
                <TableHead className="text-right">Bénéfice</TableHead>
                <TableHead className="text-right">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(sales ?? []).length === 0 && <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-12">Aucune vente</TableCell></TableRow>}
              {(sales ?? []).map((s: any) => (
                <TableRow key={s.id}>
                  <TableCell className="font-mono text-xs">{s.id.slice(0, 8).toUpperCase()}</TableCell>
                  <TableCell className="text-sm">{fmtDate(s.created_at)}</TableCell>
                  <TableCell>{s.customer_name ?? <span className="text-muted-foreground">—</span>}</TableCell>
                  <TableCell className="text-right">{s.sale_items?.length ?? 0}</TableCell>
                  <TableCell className="text-right text-success">{fmtMoney(s.profit)}</TableCell>
                  <TableCell className="text-right font-medium">{fmtMoney(s.total)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
