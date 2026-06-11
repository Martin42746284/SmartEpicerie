import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Tags } from "lucide-react";

export const Route = createFileRoute("/_authenticated/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  const qc = useQueryClient();
  const isAdmin = useIsAdmin();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<any>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  const { data: categories } = useQuery({
    queryKey: ["categories-full"],
    queryFn: async () => {
      const { data } = await supabase.from("categories").select("*, products(count)").order("name");
      return data ?? [];
    },
  });

  function openCreate() {
    setEditing(null);
    setName("");
    setDescription("");
    setOpen(true);
  }
  function openEdit(c: any) {
    setEditing(c);
    setName(c.name);
    setDescription(c.description ?? "");
    setOpen(true);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name, description: description || null };
    const res = editing
      ? await supabase.from("categories").update(payload).eq("id", editing.id)
      : await supabase.from("categories").insert(payload);
    if (res.error) toast.error(res.error.message);
    else {
      toast.success(editing ? "Catégorie modifiée" : "Catégorie créée");
      setOpen(false);
      qc.invalidateQueries({ queryKey: ["categories-full"] });
      qc.invalidateQueries({ queryKey: ["categories"] });
    }
  }

  async function del(id: string) {
    if (!confirm("Supprimer cette catégorie ?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Supprimée");
      qc.invalidateQueries({ queryKey: ["categories-full"] });
    }
  }

  return (
    <div className="space-y-4 w-full">
      <div className="px-4 sm:px-6 pt-4 sm:pt-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-display font-bold flex items-center gap-2">
            <Tags className="w-7 h-7 text-primary" />
            Catégories
          </h1>
          <p className="text-muted-foreground text-sm">Organisez votre catalogue.</p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button onClick={openCreate} className="gap-2 w-full sm:w-auto">
              <Plus className="w-4 h-4" /> Nouvelle catégorie
            </Button>
          </DialogTrigger>
          <DialogContent className="w-[95vw] max-w-md p-4 sm:p-6">
            <DialogHeader>
              <DialogTitle>{editing ? "Modifier" : "Nouvelle catégorie"}</DialogTitle>
            </DialogHeader>
            <form onSubmit={save} className="space-y-4">
              <div className="space-y-2">
                <Label className="text-sm">Nom *</Label>
                <Input
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="text-sm"
                />
              </div>
              <div className="space-y-2">
                <Label className="text-sm">Description</Label>
                <Textarea
                  rows={3}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-sm resize-none"
                />
              </div>
              <DialogFooter className="gap-2 sm:gap-0 pt-2">
                <Button type="submit" className="w-full sm:w-auto">
                  {editing ? "Enregistrer" : "Créer"}
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <div className="px-4 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
          {(categories ?? []).map((c: any) => (
            <Card key={c.id} className="group hover:shadow-lg transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <CardTitle className="text-base sm:text-lg">{c.name}</CardTitle>
                    <CardDescription className="line-clamp-2 mt-1 text-xs sm:text-sm">
                      {c.description ?? "Aucune description"}
                    </CardDescription>
                  </div>
                  <div className="flex gap-1 shrink-0">
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-8 w-8"
                      onClick={() => openEdit(c)}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    {isAdmin && (
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => del(c.id)}
                      >
                        <Trash2 className="w-4 h-4 text-destructive" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="text-xs text-muted-foreground">
                  {c.products?.[0]?.count ?? 0} produit(s)
                </div>
              </CardContent>
            </Card>
          ))}
          {(categories ?? []).length === 0 && (
            <p className="col-span-full text-center text-muted-foreground py-12 text-sm">
              Aucune catégorie
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
