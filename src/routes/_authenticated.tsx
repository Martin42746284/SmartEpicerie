import {
  createFileRoute,
  Outlet,
  Link,
  useRouter,
  useRouterState,
  useNavigate,
  redirect,
} from "@tanstack/react-router";
import { useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarProvider,
  SidebarTrigger,
  SidebarHeader,
  SidebarFooter,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard,
  Package,
  Tags,
  ShoppingCart,
  Boxes,
  FileBarChart,
  LogOut,
  Store,
  User as UserIcon,
  Loader2,
} from "lucide-react";
import { OfflineStatus } from "@/components/offline-status";

export const Route = createFileRoute("/_authenticated")({
  beforeLoad: async () => {
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/login" });
  },
  component: AuthLayout,
});

const navItems = [
  { to: "/dashboard", label: "Tableau de bord", icon: LayoutDashboard },
  { to: "/sales", label: "Ventes", icon: ShoppingCart },
  { to: "/products", label: "Produits", icon: Package },
  { to: "/categories", label: "Catégories", icon: Tags },
  { to: "/stocks", label: "Stocks", icon: Boxes },
  { to: "/reports", label: "Rapports", icon: FileBarChart },
] as const;

function AppSidebar() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { state, toggleSidebar } = useSidebar();
  const collapsed = state === "collapsed";

  useEffect(() => {
    if (window.innerWidth < 768 && state === "open") {
      toggleSidebar();
    }
  }, [path, state, toggleSidebar]);

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b border-sidebar-border">
        <div className="flex items-center gap-2 px-2 py-3">
          <div className="w-9 h-9 rounded-lg bg-sidebar-primary grid place-items-center shrink-0">
            <Store className="w-5 h-5 text-sidebar-primary-foreground" />
          </div>
          {!collapsed && (
            <div className="flex flex-col">
              <span className="font-display text-lg font-bold leading-tight text-sidebar-foreground">
                ÉpiceriePro
              </span>
              <span className="text-xs uppercase tracking-wider text-sidebar-foreground/60">
                Gestion d'épicerie
              </span>
            </div>
          )}
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const active = path.startsWith(item.to);
                return (
                  <SidebarMenuItem key={item.to}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className="text-lg"
                    >
                      <Link to={item.to}>
                        <item.icon className="w-4 h-4" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="text-sm text-sidebar-foreground/50 px-3 py-2 border-t border-sidebar-border">
        {!collapsed && <span>v1.0 · MVP</span>}
      </SidebarFooter>
    </Sidebar>
  );
}

function UserMenu() {
  const { user, fullName, roles, signOut } = useAuth();
  const navigate = useNavigate();
  const initials = (fullName ?? user?.email ?? "?").slice(0, 2).toUpperCase();
  const roleLabel = roles.includes("admin")
    ? "Admin"
    : roles.includes("manager")
      ? "Gestionnaire"
      : "Caissier";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" className="gap-2 h-9">
          <Avatar className="h-7 w-7">
            <AvatarFallback className="bg-primary text-primary-foreground text-xs">
              {initials}
            </AvatarFallback>
          </Avatar>
          <div className="hidden md:flex flex-col items-start leading-tight">
            <span className="text-sm font-medium">{fullName ?? user?.email}</span>
            <span className="text-[10px] text-muted-foreground">{roleLabel}</span>
          </div>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>
          <div className="flex flex-col">
            <span className="font-medium truncate">{fullName ?? "Utilisateur"}</span>
            <span className="text-xs text-muted-foreground truncate">{user?.email}</span>
            <Badge variant="secondary" className="mt-1 w-fit">
              {roleLabel}
            </Badge>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onClick={async () => {
            await signOut();
            navigate({ to: "/login", replace: true });
          }}
        >
          <LogOut className="w-4 h-4 mr-2" /> Déconnexion
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function AuthLayout() {
  const { user, loading } = useAuth();
  const router = useRouter();
  useEffect(() => {
    if (!loading && !user) router.navigate({ to: "/login", replace: true });
  }, [user, loading, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen grid place-items-center bg-background">
        <Loader2 className="w-6 h-6 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full bg-background">
        <AppSidebar />
        <div className="flex-1 flex flex-col min-w-0">
          <header className="h-14 border-b bg-card/80 backdrop-blur flex items-center px-3 sm:px-6 gap-2 sticky top-0 z-30">
            <SidebarTrigger />
            <div className="flex-1" />
            <UserMenu />
          </header>
          <main className="flex-1 overflow-x-hidden">
            <Outlet />
          </main>
        </div>
        <OfflineStatus />
      </div>
    </SidebarProvider>
  );
}
