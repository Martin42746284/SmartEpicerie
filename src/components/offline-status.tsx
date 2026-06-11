import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";

export function OfflineStatus() {
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  if (isOnline) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:w-auto z-50 animate-in slide-in-from-bottom-5">
      <div className="bg-warning/90 backdrop-blur-sm border border-warning rounded-lg px-4 py-3 flex items-center gap-2 text-warning-foreground shadow-lg">
        <WifiOff className="w-4 h-4 shrink-0" />
        <span className="text-sm font-medium">Mode hors ligne</span>
      </div>
    </div>
  );
}
