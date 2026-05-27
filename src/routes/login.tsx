import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Store, Loader2 } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const { user, loading } = useAuth();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && user) navigate({ to: "/dashboard", replace: true });
  }, [user, loading, navigate]);

  const [loginEmail, setLoginEmail] = useState("");
  const [loginPwd, setLoginPwd] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPwd, setSignupPwd] = useState("");
  const [signupName, setSignupName] = useState("");

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email: loginEmail, password: loginPwd });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Connecté !"); navigate({ to: "/dashboard", replace: true }); }
  }

  async function handleSignup(e: React.FormEvent) {
    e.preventDefault();
    if (signupPwd.length < 6) return toast.error("Mot de passe trop court (min. 6 caractères)");
    setBusy(true);
    const { error } = await supabase.auth.signUp({
      email: signupEmail,
      password: signupPwd,
      options: {
        emailRedirectTo: `${window.location.origin}/dashboard`,
        data: { full_name: signupName },
      },
    });
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success("Compte créé !"); }
  }

  return (
    <div className="min-h-screen grid lg:grid-cols-2">
      {/* Left visual */}
      <div className="hidden lg:flex flex-col justify-between p-12 text-sidebar-foreground relative overflow-hidden"
        style={{ background: "var(--gradient-hero)" }}>
        <div className="flex items-center gap-3 z-10">
          <div className="w-11 h-11 rounded-xl bg-sidebar-primary/20 backdrop-blur grid place-items-center">
            <Store className="w-6 h-6 text-sidebar-primary" />
          </div>
          <span className="font-display text-2xl font-bold tracking-tight">ÉpiceriePro</span>
        </div>
        <div className="z-10 space-y-6">
          <h1 className="text-5xl font-display font-bold leading-tight">
            Gérez votre épicerie<br />
            <span className="text-sidebar-primary">en toute simplicité.</span>
          </h1>
          <p className="text-lg opacity-90 max-w-md">
            Ventes, stocks, bénéfices et statistiques — tout en un seul tableau de bord moderne et intuitif.
          </p>
          <div className="flex gap-8 pt-4">
            {[
              ["100%", "Automatisé"],
              ["24/7", "Disponible"],
              ["Temps réel", "Statistiques"],
            ].map(([n, l]) => (
              <div key={l}>
                <div className="text-2xl font-display font-bold text-sidebar-primary">{n}</div>
                <div className="text-sm opacity-80">{l}</div>
              </div>
            ))}
          </div>
        </div>
        <div className="z-10 text-xs opacity-60">© {new Date().getFullYear()} ÉpiceriePro - Developpé par Martin Manampisoa</div>
        {/* Decorative blobs */}
        <div className="absolute -top-32 -right-32 w-96 h-96 rounded-full bg-sidebar-primary/20 blur-3xl" />
        <div className="absolute -bottom-32 -left-20 w-96 h-96 rounded-full bg-primary-glow/30 blur-3xl" />
      </div>

      {/* Right form */}
      <div className="flex items-center justify-center p-6 sm:p-12 bg-background">
        <Card className="w-full max-w-md border-border/60" style={{ boxShadow: "var(--shadow-elegant)" }}>
          <CardHeader>
            <div className="lg:hidden flex items-center gap-2 mb-2">
              <div className="w-9 h-9 rounded-lg bg-primary grid place-items-center">
                <Store className="w-5 h-5 text-primary-foreground" />
              </div>
              <span className="font-display text-xl font-bold">ÉpiceriePro</span>
            </div>
            <CardTitle className="text-2xl">Bienvenue</CardTitle>
            <CardDescription>Connectez-vous ou créez le premier compte (administrateur).</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login">
              <TabsList className="grid grid-cols-2 w-full">
                <TabsTrigger value="login">Connexion</TabsTrigger>
                <TabsTrigger value="signup">Inscription</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="pt-4">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="le">Email</Label>
                    <Input id="le" type="email" required value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="vous@epicerie.com" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="lp">Mot de passe</Label>
                    <Input id="lp" type="password" required value={loginPwd} onChange={(e) => setLoginPwd(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Se connecter
                  </Button>
                </form>
              </TabsContent>
              <TabsContent value="signup" className="pt-4">
                <form onSubmit={handleSignup} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="sn">Nom complet</Label>
                    <Input id="sn" required value={signupName} onChange={(e) => setSignupName(e.target.value)} placeholder="Aïcha Diallo" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="se">Email</Label>
                    <Input id="se" type="email" required value={signupEmail} onChange={(e) => setSignupEmail(e.target.value)} />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="sp">Mot de passe</Label>
                    <Input id="sp" type="password" required minLength={6} value={signupPwd} onChange={(e) => setSignupPwd(e.target.value)} />
                  </div>
                  <Button type="submit" disabled={busy} className="w-full">
                    {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Créer le compte
                  </Button>
                </form>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
