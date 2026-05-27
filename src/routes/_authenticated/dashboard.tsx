import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtMoney } from "@/lib/format";
import { Package, TrendingUp, AlertTriangle, ShoppingCart, Coins, Wallet } from "lucide-react";
import { ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, BarChart, Bar, Legend } from "recharts";
import { ChartContainer } from "@/components/ui/chart";

export const Route = createFileRoute("/_authenticated/dashboard")({
  component: DashboardPage,
});

function DashboardPage() {
  const { fullName } = useAuth();

  const { data: stats, isLoading } = useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: async () => {
      const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
      const last30 = new Date(); last30.setDate(last30.getDate() - 30);

      const [productsRes, lowStockRes, salesTodayRes, sales30Res, topProductsRes] = await Promise.all([
        supabase.from("products").select("id", { count: "exact", head: true }),
        supabase.from("products").select("id, name, stock, low_stock_threshold").lte("stock", 5).order("stock", { ascending: true }).limit(5),
        supabase.from("sales").select("total, profit").gte("created_at", todayStart.toISOString()),
        supabase.from("sales").select("total, profit, created_at").gte("created_at", last30.toISOString()).order("created_at"),
        supabase.from("sale_items").select("product_name, quantity, subtotal").gte("created_at" as any, last30.toISOString() as any).limit(1000),
      ]);

      const todayRevenue = (salesTodayRes.data ?? []).reduce((s, x) => s + Number(x.total), 0);
      const todayProfit = (salesTodayRes.data ?? []).reduce((s, x) => s + Number(x.profit), 0);
      const monthRevenue = (sales30Res.data ?? []).reduce((s, x) => s + Number(x.total), 0);
      const monthProfit = (sales30Res.data ?? []).reduce((s, x) => s + Number(x.profit), 0);

      // Build daily series
      const dailyMap = new Map<string, { date: string; revenue: number; profit: number }>();
      for (let i = 29; i >= 0; i--) {
        const d = new Date(); d.setDate(d.getDate() - i); d.setHours(0, 0, 0, 0);
        const key = d.toISOString().slice(0, 10);
        dailyMap.set(key, { date: d.toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }), revenue: 0, profit: 0 });
      }
      (sales30Res.data ?? []).forEach((s) => {
        const key = new Date(s.created_at).toISOString().slice(0, 10);
        const e = dailyMap.get(key);
        if (e) { e.revenue += Number(s.total); e.profit += Number(s.profit); }
      });

      // Top products
      const topMap = new Map<string, { name: string; qty: number; revenue: number }>();
      ((topProductsRes.data ?? []) as any[]).forEach((it) => {
        const e = topMap.get(it.product_name) ?? { name: it.product_name, qty: 0, revenue: 0 };
        e.qty += it.quantity; e.revenue += Number(it.subtotal);
        topMap.set(it.product_name, e);
      });
      const top = Array.from(topMap.values()).sort((a, b) => b.qty - a.qty).slice(0, 5);

      return {
        productCount: productsRes.count ?? 0,
        lowStock: lowStockRes.data ?? [],
        todayRevenue, todayProfit, monthRevenue, monthProfit,
        salesTodayCount: (salesTodayRes.data ?? []).length,
        daily: Array.from(dailyMap.values()),
        top,
      };
    },
    refetchInterval: 30000,
  });

  return (
    <div className="p-4 sm:p-6 space-y-6 max-w-[1600px] mx-auto">
      <div>
        <h1 className="text-2xl sm:text-3xl font-display font-bold">Bonjour {fullName?.split(" ")[0] ?? ""} 👋</h1>
        <p className="text-muted-foreground">Aperçu en temps réel de votre épicerie</p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <KpiCard icon={ShoppingCart} label="Ventes aujourd'hui" value={String(stats?.salesTodayCount ?? 0)} accent="primary" loading={isLoading} />
        <KpiCard icon={Coins} label="CA du jour" value={fmtMoney(stats?.todayRevenue ?? 0)} accent="accent" loading={isLoading} />
        <KpiCard icon={Wallet} label="Bénéfice du jour" value={fmtMoney(stats?.todayProfit ?? 0)} accent="success" loading={isLoading} />
        <KpiCard icon={Package} label="Produits actifs" value={String(stats?.productCount ?? 0)} accent="primary" loading={isLoading} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <CardTitle>Évolution sur 30 jours</CardTitle>
                <CardDescription>CA mensuel : <span className="font-medium text-foreground">{fmtMoney(stats?.monthRevenue ?? 0)}</span> · Bénéfice : <span className="font-medium text-foreground">{fmtMoney(stats?.monthProfit ?? 0)}</span></CardDescription>
              </div>
              <Badge variant="secondary" className="gap-1"><TrendingUp className="w-3 h-3" /> 30j</Badge>
            </div>
          </CardHeader>
          <CardContent>
            <ChartContainer config={{}} className="h-[280px] w-full">
              <ResponsiveContainer>
                <AreaChart data={stats?.daily ?? []}>
                  <defs>
                    <linearGradient id="gRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.45} />
                      <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="gProf" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-accent)" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="var(--color-accent)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" tickFormatter={(v) => v >= 1000 ? `${(v/1000).toFixed(0)}k` : v} />
                  <Tooltip
                    contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }}
                    formatter={(v: number) => fmtMoney(v)}
                  />
                  <Area type="monotone" dataKey="revenue" name="CA" stroke="var(--color-primary)" fill="url(#gRev)" strokeWidth={2} />
                  <Area type="monotone" dataKey="profit" name="Bénéfice" stroke="var(--color-accent)" fill="url(#gProf)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </ChartContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><AlertTriangle className="w-4 h-4 text-warning" /> Stocks faibles</CardTitle>
            <CardDescription>Produits à réapprovisionner</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {(stats?.lowStock ?? []).length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">Tous les stocks sont au vert 🎉</p>}
            {(stats?.lowStock ?? []).map((p: any) => (
              <div key={p.id} className="flex items-center justify-between text-sm border-b last:border-0 py-2">
                <span className="font-medium truncate pr-2">{p.name}</span>
                <Badge variant={p.stock === 0 ? "destructive" : "secondary"}>{p.stock} restants</Badge>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top 5 produits (30j)</CardTitle>
          <CardDescription>Les meilleures ventes par quantité</CardDescription>
        </CardHeader>
        <CardContent>
          {(stats?.top ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">Aucune vente sur la période</p>
          ) : (
            <ChartContainer config={{}} className="h-[260px] w-full">
              <ResponsiveContainer>
                <BarChart data={stats?.top ?? []} layout="vertical" margin={{ left: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
                  <XAxis type="number" tick={{ fontSize: 11 }} stroke="var(--color-muted-foreground)" />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} stroke="var(--color-muted-foreground)" />
                  <Tooltip contentStyle={{ background: "var(--color-card)", border: "1px solid var(--color-border)", borderRadius: 8 }} />
                  <Legend />
                  <Bar dataKey="qty" name="Quantité" fill="var(--color-primary)" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </ChartContainer>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KpiCard({ icon: Icon, label, value, accent, loading }: { icon: any; label: string; value: string; accent: "primary" | "accent" | "success"; loading?: boolean; }) {
  const bg = accent === "success" ? "bg-success/10 text-success" : accent === "accent" ? "bg-accent/15 text-accent" : "bg-primary/10 text-primary";
  return (
    <Card className="overflow-hidden">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={`w-11 h-11 rounded-xl grid place-items-center ${bg} shrink-0`}>
          <Icon className="w-5 h-5" />
        </div>
        <div className="min-w-0">
          <div className="text-xs text-muted-foreground uppercase tracking-wider">{label}</div>
          <div className="text-lg sm:text-xl font-display font-bold truncate">
            {loading ? "…" : value}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
