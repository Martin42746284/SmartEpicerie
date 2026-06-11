import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Separator } from "@/components/ui/separator";
import { fmtMoney, fmtDate } from "@/lib/format";
import { toast } from "sonner";
import { ShoppingCart, Plus, Minus, X, Search, Receipt, Printer } from "lucide-react";

export const Route = createFileRoute("/_authenticated/sales")({
  component: SalesPage,
});

type CartLine = {
  product_id: string;
  product_name: string;
  unit_price: number;
  purchase_price: number;
  quantity: number;
  stock: number;
};

function SalesPage() {
  return (
    <div className="space-y-4 w-full">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6">
        <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-2">
          <ShoppingCart className="w-7 h-7 text-primary" />
          Ventes
        </h1>
        <p className="text-muted-foreground text-sm">
          Encaissement et historique des transactions.
        </p>
      </div>
      <div className="px-4 sm:px-6">
        <Tabs defaultValue="new" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="new" className="text-sm sm:text-base">
              Nouvelle vente
            </TabsTrigger>
            <TabsTrigger value="history" className="text-sm sm:text-base">
              Historique
            </TabsTrigger>
          </TabsList>
          <TabsContent value="new" className="mt-4">
            <NewSale />
          </TabsContent>
          <TabsContent value="history" className="mt-4">
            <SalesHistory />
          </TabsContent>
        </Tabs>
      </div>
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
      const { data } = await supabase
        .from("products")
        .select("id, name, sale_price, purchase_price, stock")
        .order("name");
      return data ?? [];
    },
  });

  const filtered = (products ?? []).filter((p) =>
    p.name.toLowerCase().includes(search.toLowerCase()),
  );
  const total = useMemo(() => cart.reduce((s, l) => s + l.unit_price * l.quantity, 0), [cart]);
  const profit = useMemo(
    () => cart.reduce((s, l) => s + (l.unit_price - l.purchase_price) * l.quantity, 0),
    [cart],
  );

  function add(p: any) {
    setCart((c) => {
      const ex = c.find((x) => x.product_id === p.id);
      if (ex) {
        if (ex.quantity >= ex.stock) {
          toast.warning("Stock insuffisant");
          return c;
        }
        return c.map((x) => (x.product_id === p.id ? { ...x, quantity: x.quantity + 1 } : x));
      }
      return [
        ...c,
        {
          product_id: p.id,
          product_name: p.name,
          unit_price: Number(p.sale_price),
          purchase_price: Number(p.purchase_price),
          quantity: 1,
          stock: p.stock,
        },
      ];
    });
  }
  function updateQty(id: string, delta: number) {
    setCart((c) =>
      c.flatMap((l) => {
        if (l.product_id !== id) return [l];
        const q = l.quantity + delta;
        if (q <= 0) return [];
        if (q > l.stock) {
          toast.warning("Stock insuffisant");
          return [l];
        }
        return [{ ...l, quantity: q }];
      }),
    );
  }
  function remove(id: string) {
    setCart((c) => c.filter((l) => l.product_id !== id));
  }

  async function checkout() {
    if (cart.length === 0 || !user) return;
    setBusy(true);

    // Verify stock availability before checkout
    const { data: currentProducts, error: fetchError } = await supabase
      .from("products")
      .select("id, stock")
      .in(
        "id",
        cart.map((l) => l.product_id),
      );
    if (fetchError || !currentProducts) {
      setBusy(false);
      return toast.error("Erreur lors de la vérification du stock");
    }

    for (const item of cart) {
      const current = currentProducts.find((p) => p.id === item.product_id);
      if (!current || current.stock < item.quantity) {
        setBusy(false);
        setInsufficientStock(item);
        return;
      }
    }

    const { data: sale, error } = await supabase
      .from("sales")
      .insert({
        user_id: user.id,
        total,
        profit,
        customer_name: customer || null,
      })
      .select()
      .single();
    if (error || !sale) {
      setBusy(false);
      return toast.error(error?.message ?? "Erreur");
    }

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
    if (itemsRes.error) {
      setBusy(false);
      return toast.error(itemsRes.error.message);
    }

    // Update stocks + movements (sequential is fine for small carts)
    for (const l of cart) {
      await supabase
        .from("products")
        .update({ stock: l.stock - l.quantity })
        .eq("id", l.product_id);
      await supabase.from("stock_movements").insert({
        product_id: l.product_id,
        type: "out",
        quantity: l.quantity,
        reason: `Vente #${sale.id.slice(0, 8)}`,
        user_id: user.id,
      });
    }

    setBusy(false);
    toast.success("Vente enregistrée");
    setReceipt({ ...sale, items, customer_name: customer });
    setCart([]);
    setCustomer("");
    qc.invalidateQueries({ queryKey: ["products-for-sale"] });
    qc.invalidateQueries({ queryKey: ["products"] });
    qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    qc.invalidateQueries({ queryKey: ["sales-history"] });
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_380px] gap-4">
      <Card>
        <CardHeader className="pb-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder="Rechercher un produit…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9 text-sm"
            />
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-3 gap-2 max-h-[50vh] lg:max-h-[60vh] overflow-y-auto">
            {filtered.map((p) => (
              <button
                key={p.id}
                onClick={() => add(p)}
                disabled={p.stock === 0}
                className={`text-left p-2 sm:p-3 rounded-lg border transition-all ${
                  p.stock === 0
                    ? "bg-muted opacity-60 cursor-not-allowed border-destructive/30 hover:shadow-none"
                    : "bg-card hover:border-primary hover:shadow-md"
                }`}
              >
                <div className="font-medium text-xs sm:text-sm line-clamp-2">{p.name}</div>
                <div
                  className={`font-semibold text-xs sm:text-sm mt-1 ${p.stock === 0 ? "text-destructive" : "text-primary"}`}
                >
                  {fmtMoney(p.sale_price)}
                </div>
                <div className="flex items-center justify-between mt-1 gap-1">
                  <div className="text-[10px] sm:text-xs text-muted-foreground">
                    Stock: {p.stock}
                  </div>
                  {p.stock === 0 && (
                    <span className="text-[10px] sm:text-xs font-semibold text-destructive">
                      Rupture
                    </span>
                  )}
                </div>
              </button>
            ))}
            {filtered.length === 0 && (
              <p className="col-span-full text-center text-muted-foreground py-8 text-xs sm:text-sm">
                Aucun produit trouvé
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      <Card className="lg:sticky lg:top-20 h-fit">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="w-5 h-5" /> Panier
          </CardTitle>
          <CardDescription className="text-xs">{cart.length} article(s)</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="max-h-[30vh] lg:max-h-[40vh] overflow-y-auto space-y-2">
            {cart.length === 0 && (
              <p className="text-xs text-muted-foreground text-center py-6">
                Cliquez sur un produit pour l'ajouter
              </p>
            )}
            {cart.map((l) => (
              <div
                key={l.product_id}
                className="flex items-center gap-2 text-xs sm:text-sm p-2 bg-muted/50 rounded-md"
              >
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{l.product_name}</div>
                  <div className="text-xs text-muted-foreground">{fmtMoney(l.unit_price)}</div>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-6 w-6 sm:h-7 sm:w-7"
                    onClick={() => updateQty(l.product_id, -1)}
                  >
                    <Minus className="w-2 h-2 sm:w-3 sm:h-3" />
                  </Button>
                  <span className="w-4 sm:w-6 text-center text-xs sm:text-sm font-medium">
                    {l.quantity}
                  </span>
                  <Button
                    size="icon"
                    variant="outline"
                    className="h-6 w-6 sm:h-7 sm:w-7"
                    onClick={() => updateQty(l.product_id, 1)}
                  >
                    <Plus className="w-2 h-2 sm:w-3 sm:h-3" />
                  </Button>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 sm:h-7 sm:w-7"
                    onClick={() => remove(l.product_id)}
                  >
                    <X className="w-2 h-2 sm:w-3 sm:h-3" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <Separator />
          <Input
            placeholder="Nom client (optionnel)"
            value={customer}
            onChange={(e) => setCustomer(e.target.value)}
            className="text-sm"
          />
          <div className="space-y-1 text-xs sm:text-sm">
            <div className="flex justify-between text-muted-foreground">
              <span>Bénéfice estimé</span>
              <span>{fmtMoney(profit)}</span>
            </div>
            <div className="flex justify-between text-base sm:text-lg font-display font-bold">
              <span>Total</span>
              <span className="text-primary">{fmtMoney(total)}</span>
            </div>
          </div>
          <Button
            className="w-full"
            size="lg"
            disabled={cart.length === 0 || busy}
            onClick={checkout}
          >
            Valider la vente
          </Button>
        </CardContent>
      </Card>

      <Dialog open={!!receipt} onOpenChange={(o) => !o && setReceipt(null)}>
        <DialogContent className="w-[95vw] max-w-sm p-4 sm:p-6">
          <DialogHeader>
            <DialogTitle className="text-center text-base sm:text-lg">Reçu de vente</DialogTitle>
          </DialogHeader>
          {receipt && (
            <div className="font-mono text-xs space-y-2" id="receipt-print">
              <div className="text-center">
                <div className="font-bold text-base">ÉpiceriePro</div>
                <div className="text-muted-foreground text-xs">{fmtDate(receipt.created_at)}</div>
                <div className="text-muted-foreground text-xs">
                  N° {receipt.id.slice(0, 8).toUpperCase()}
                </div>
                {receipt.customer_name && (
                  <div className="mt-1 text-xs">Client : {receipt.customer_name}</div>
                )}
              </div>
              <Separator />
              <div className="max-h-[30vh] overflow-y-auto">
                {receipt.items.map((it: any, i: number) => (
                  <div key={i} className="flex justify-between py-1 text-xs">
                    <span className="flex-1">
                      {it.quantity} × {it.product_name}
                    </span>
                    <span className="shrink-0 ml-2">{fmtMoney(it.subtotal)}</span>
                  </div>
                ))}
              </div>
              <Separator />
              <div className="flex justify-between font-bold text-sm">
                <span>TOTAL</span>
                <span>{fmtMoney(receipt.total)}</span>
              </div>
              <div className="text-center text-muted-foreground pt-2 text-xs">
                Merci de votre visite !
              </div>
            </div>
          )}
          <Button onClick={() => window.print()} variant="outline" className="gap-2 w-full">
            <Printer className="w-4 h-4" /> Imprimer
          </Button>
        </DialogContent>
      </Dialog>

      <Dialog open={!!insufficientStock} onOpenChange={(o) => !o && setInsufficientStock(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="text-center text-destructive">Stock insuffisant</DialogTitle>
          </DialogHeader>
          {insufficientStock && (
            <div className="space-y-4">
              <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 space-y-2">
                <p className="font-medium">{insufficientStock.product_name}</p>
                <p className="text-sm text-muted-foreground">
                  Quantité demandée :{" "}
                  <span className="font-semibold text-foreground">
                    {insufficientStock.quantity}
                  </span>
                </p>
                <p className="text-sm text-muted-foreground">
                  Stock disponible :{" "}
                  <span className="font-semibold text-destructive">{insufficientStock.stock}</span>
                </p>
              </div>
              <p className="text-sm text-muted-foreground">
                Veuillez ajuster les quantités dans votre panier avant de continuer.
              </p>
            </div>
          )}
          <Button onClick={() => setInsufficientStock(null)} className="w-full">
            Fermer
          </Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SalesHistory() {
  const { data: sales } = useQuery({
    queryKey: ["sales-history"],
    queryFn: async () => {
      const { data } = await supabase
        .from("sales")
        .select("*, sale_items(*)")
        .order("created_at", { ascending: false })
        .limit(100);
      return data ?? [];
    },
  });

  return (
    <Card>
      <CardContent className="px-3 sm:px-6 pt-6 pb-6">
        {(sales ?? []).length === 0 ? (
          <div className="text-center text-muted-foreground py-12 text-sm">Aucune vente</div>
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-sm">N°</TableHead>
                    <TableHead className="text-sm">Date</TableHead>
                    <TableHead className="text-sm">Client</TableHead>
                    <TableHead className="text-right text-sm">Articles</TableHead>
                    <TableHead className="text-right text-sm">Bénéfice</TableHead>
                    <TableHead className="text-right text-sm">Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(sales ?? []).map((s: any) => (
                    <TableRow key={s.id}>
                      <TableCell className="font-mono text-xs">
                        {s.id.slice(0, 8).toUpperCase()}
                      </TableCell>
                      <TableCell className="text-sm">{fmtDate(s.created_at)}</TableCell>
                      <TableCell className="text-sm">
                        {s.customer_name ?? <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-right text-sm">
                        {s.sale_items?.length ?? 0}
                      </TableCell>
                      <TableCell className="text-right text-success text-sm">
                        {fmtMoney(s.profit)}
                      </TableCell>
                      <TableCell className="text-right font-medium text-sm">
                        {fmtMoney(s.total)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            <div className="md:hidden space-y-3">
              {(sales ?? []).map((s: any) => (
                <div key={s.id} className="border rounded-lg p-3 space-y-2 bg-card">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="font-mono text-xs text-muted-foreground">
                        {s.id.slice(0, 8).toUpperCase()}
                      </div>
                      <div className="text-sm font-medium">
                        {s.customer_name ?? (
                          <span className="text-muted-foreground italic">Anonyme</span>
                        )}
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="text-xs text-muted-foreground">{fmtDate(s.created_at)}</div>
                      <div className="text-sm font-medium text-primary">{fmtMoney(s.total)}</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <span className="text-muted-foreground">Articles: </span>
                      <span className="font-medium">{s.sale_items?.length ?? 0}</span>
                    </div>
                    <div className="text-right">
                      <span className="text-muted-foreground">Bénéfice: </span>
                      <span className="font-medium text-success">{fmtMoney(s.profit)}</span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
