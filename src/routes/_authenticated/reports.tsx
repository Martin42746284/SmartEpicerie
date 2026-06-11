import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { fmtMoney, fmtDateOnly } from "@/lib/format";
import { FileBarChart, Download, FileSpreadsheet, FileText } from "lucide-react";
import jsPDF from "jspdf";
import autoTable from "jspdf-autotable";

export const Route = createFileRoute("/_authenticated/reports")({
  component: ReportsPage,
});

function ReportsPage() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const monthAgo = new Date(today);
  monthAgo.setDate(monthAgo.getDate() - 30);
  const [from, setFrom] = useState(monthAgo.toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const { data: sales } = useQuery({
    queryKey: ["report-sales", from, to],
    queryFn: async () => {
      const start = new Date(from + "T00:00:00").toISOString();
      const end = new Date(to + "T23:59:59").toISOString();
      const { data } = await supabase
        .from("sales")
        .select("*, sale_items(*)")
        .gte("created_at", start)
        .lte("created_at", end)
        .order("created_at", { ascending: false });
      return data ?? [];
    },
  });

  const { data: products } = useQuery({
    queryKey: ["report-products"],
    queryFn: async () => {
      const { data } = await supabase.from("products").select("*, categories(name)").order("name");
      return data ?? [];
    },
  });

  const summary = useMemo(() => {
    const revenue = (sales ?? []).reduce((s, x: any) => s + Number(x.total), 0);
    const profit = (sales ?? []).reduce((s, x: any) => s + Number(x.profit), 0);
    const items = (sales ?? []).reduce((s, x: any) => s + (x.sale_items?.length ?? 0), 0);
    return { revenue, profit, count: (sales ?? []).length, items };
  }, [sales]);

  const topProducts = useMemo(() => {
    const m = new Map<string, { name: string; qty: number; revenue: number }>();
    (sales ?? []).forEach((s: any) =>
      s.sale_items?.forEach((it: any) => {
        const e = m.get(it.product_name) ?? { name: it.product_name, qty: 0, revenue: 0 };
        e.qty += it.quantity;
        e.revenue += Number(it.subtotal);
        m.set(it.product_name, e);
      }),
    );
    return Array.from(m.values()).sort((a, b) => b.revenue - a.revenue);
  }, [sales]);

  function exportCSV(rows: any[], headers: string[], filename: string) {
    const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const csv = [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
    const blob = new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportSalesPDF() {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Rapport de ventes", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Période : ${fmtDateOnly(from)} → ${fmtDateOnly(to)}`, 14, 26);
    doc.text(
      `CA : ${fmtMoney(summary.revenue)}  ·  Bénéfice : ${fmtMoney(summary.profit)}  ·  Ventes : ${summary.count}`,
      14,
      32,
    );
    autoTable(doc, {
      startY: 40,
      head: [["N°", "Date", "Client", "Articles", "Bénéfice", "Total"]],
      body: (sales ?? []).map((s: any) => [
        s.id.slice(0, 8).toUpperCase(),
        fmtDateOnly(s.created_at),
        s.customer_name ?? "—",
        s.sale_items?.length ?? 0,
        fmtMoney(s.profit),
        fmtMoney(s.total),
      ]),
      headStyles: { fillColor: [30, 50, 90] },
      styles: { fontSize: 9 },
    });
    doc.save(`rapport-ventes-${from}-${to}.pdf`);
  }

  function exportStockPDF() {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text("Rapport de stock", 14, 18);
    doc.setFontSize(10);
    doc.setTextColor(120);
    doc.text(`Date : ${fmtDateOnly(new Date())}`, 14, 26);
    autoTable(doc, {
      startY: 32,
      head: [["Produit", "Catégorie", "Stock", "Seuil", "Valeur stock"]],
      body: (products ?? []).map((p: any) => [
        p.name,
        p.categories?.name ?? "—",
        p.stock,
        p.low_stock_threshold,
        fmtMoney(p.stock * Number(p.purchase_price)),
      ]),
      headStyles: { fillColor: [30, 50, 90] },
      styles: { fontSize: 9 },
    });
    doc.save(`rapport-stock-${new Date().toISOString().slice(0, 10)}.pdf`);
  }

  return (
    <div className="space-y-4 w-full">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6">
        <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-2">
          <FileBarChart className="w-7 h-7 text-primary" />
          Rapports
        </h1>
        <p className="text-muted-foreground text-sm">Analyses, exports PDF et Excel.</p>
      </div>

      <div className="px-4 sm:px-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Période</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col sm:flex-row items-start sm:items-end gap-2 sm:gap-3">
              <div className="space-y-1 flex-1">
                <Label className="text-sm">Du</Label>
                <Input
                  type="date"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-1 flex-1">
                <Label className="text-sm">Au</Label>
                <Input
                  type="date"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  className="text-sm"
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 sm:gap-3">
          <SummaryStat label="Ventes" value={String(summary.count)} />
          <SummaryStat label="Articles vendus" value={String(summary.items)} />
          <SummaryStat label="Chiffre d'affaires" value={fmtMoney(summary.revenue)} highlight />
          <SummaryStat label="Bénéfice" value={fmtMoney(summary.profit)} highlight />
        </div>

        <Tabs defaultValue="sales">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="sales" className="text-xs sm:text-sm">
              Ventes
            </TabsTrigger>
            <TabsTrigger value="products" className="text-xs sm:text-sm">
              Produits
            </TabsTrigger>
            <TabsTrigger value="stock" className="text-xs sm:text-sm">
              Stock
            </TabsTrigger>
          </TabsList>

          <TabsContent value="sales" className="mt-4">
            <Card>
              <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between flex-wrap gap-2">
                <div>
                  <CardTitle className="text-base sm:text-lg">Détail des ventes</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    {(sales ?? []).length} transaction(s)
                  </CardDescription>
                </div>
                <div className="flex gap-2 flex-wrap">
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 text-xs sm:text-sm"
                    onClick={() =>
                      exportCSV(
                        (sales ?? []).map((s: any) => [
                          s.id,
                          s.created_at,
                          s.customer_name,
                          s.sale_items?.length ?? 0,
                          s.profit,
                          s.total,
                        ]),
                        ["ID", "Date", "Client", "Articles", "Bénéfice", "Total"],
                        `ventes-${from}-${to}.csv`,
                      )
                    }
                  >
                    <FileSpreadsheet className="w-3 h-3 sm:w-4 sm:h-4" /> Excel/CSV
                  </Button>
                  <Button size="sm" className="gap-2 text-xs sm:text-sm" onClick={exportSalesPDF}>
                    <FileText className="w-3 h-3 sm:w-4 sm:h-4" /> PDF
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-6">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs sm:text-sm">Date</TableHead>
                        <TableHead className="text-xs sm:text-sm">Client</TableHead>
                        <TableHead className="text-right text-xs sm:text-sm">Articles</TableHead>
                        <TableHead className="text-right text-xs sm:text-sm">Bénéfice</TableHead>
                        <TableHead className="text-right text-xs sm:text-sm">Total</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(sales ?? []).map((s: any) => (
                        <TableRow key={s.id}>
                          <TableCell className="text-xs sm:text-sm">
                            {fmtDateOnly(s.created_at)}
                          </TableCell>
                          <TableCell className="text-xs sm:text-sm">
                            {s.customer_name ?? "—"}
                          </TableCell>
                          <TableCell className="text-right text-xs sm:text-sm">
                            {s.sale_items?.length ?? 0}
                          </TableCell>
                          <TableCell className="text-right text-success text-xs sm:text-sm">
                            {fmtMoney(s.profit)}
                          </TableCell>
                          <TableCell className="text-right font-medium text-xs sm:text-sm">
                            {fmtMoney(s.total)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="products" className="mt-4">
            <Card>
              <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base sm:text-lg">Produits les plus vendus</CardTitle>
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-2 text-xs sm:text-sm"
                  onClick={() =>
                    exportCSV(
                      topProducts.map((p) => [p.name, p.qty, p.revenue]),
                      ["Produit", "Quantité", "CA"],
                      `top-produits-${from}-${to}.csv`,
                    )
                  }
                >
                  <Download className="w-3 h-3 sm:w-4 sm:h-4" /> CSV
                </Button>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs sm:text-sm">Produit</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm">Quantité</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm">CA</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {topProducts.length === 0 && (
                      <TableRow>
                        <TableCell
                          colSpan={3}
                          className="text-center text-muted-foreground py-8 text-sm"
                        >
                          Aucune donnée
                        </TableCell>
                      </TableRow>
                    )}
                    {topProducts.map((p) => (
                      <TableRow key={p.name}>
                        <TableCell className="font-medium text-xs sm:text-sm">{p.name}</TableCell>
                        <TableCell className="text-right text-xs sm:text-sm">{p.qty}</TableCell>
                        <TableCell className="text-right font-medium text-xs sm:text-sm">
                          {fmtMoney(p.revenue)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="stock" className="mt-4">
            <Card>
              <CardHeader className="flex-col sm:flex-row items-start sm:items-center justify-between flex-wrap gap-2">
                <CardTitle className="text-base sm:text-lg">État du stock</CardTitle>
                <Button size="sm" className="gap-2 text-xs sm:text-sm" onClick={exportStockPDF}>
                  <FileText className="w-3 h-3 sm:w-4 sm:h-4" /> PDF
                </Button>
              </CardHeader>
              <CardContent className="px-3 sm:px-6 pb-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs sm:text-sm">Produit</TableHead>
                      <TableHead className="text-xs sm:text-sm">Catégorie</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm">Stock</TableHead>
                      <TableHead className="text-right text-xs sm:text-sm">Valeur</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(products ?? []).map((p: any) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium text-xs sm:text-sm">{p.name}</TableCell>
                        <TableCell className="text-muted-foreground text-xs sm:text-sm">
                          {p.categories?.name ?? "—"}
                        </TableCell>
                        <TableCell className="text-right text-xs sm:text-sm">{p.stock}</TableCell>
                        <TableCell className="text-right font-medium text-xs sm:text-sm">
                          {fmtMoney(p.stock * Number(p.purchase_price))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function SummaryStat({
  label,
  value,
  highlight,
}: {
  label: string;
  value: string;
  highlight?: boolean;
}) {
  return (
    <Card className={highlight ? "border-primary/30" : ""}>
      <CardContent className="p-2 sm:p-4">
        <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground">
          {label}
        </div>
        <div
          className={`text-base sm:text-xl font-display font-bold mt-1 ${highlight ? "text-primary" : ""}`}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
