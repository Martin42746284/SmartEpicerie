import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export type OfflineOperation = {
  id: string;
  type: "create" | "update" | "delete";
  table: string;
  data: any;
  timestamp: number;
  synced?: boolean;
};

const OFFLINE_QUEUE_KEY = "epicerie_offline_queue";
const OFFLINE_DATA_KEY = "epicerie_offline_data";

export function useOfflineSync() {
  const [isOnline, setIsOnline] = useState(typeof window !== "undefined" ? navigator.onLine : true);
  const syncInProgressRef = useRef(false);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      toast.success("Connexion rétablie - Synchronisation en cours...");
      syncQueuedOperations();
    };

    const handleOffline = () => {
      setIsOnline(false);
      toast.info("Mode hors ligne - Les modifications seront synchronisées");
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  const addToQueue = (type: "create" | "update" | "delete", table: string, data: any) => {
    const queue = getQueue();
    const operation: OfflineOperation = {
      id: `${table}-${Date.now()}-${Math.random()}`,
      type,
      table,
      data,
      timestamp: Date.now(),
    };

    queue.push(operation);
    localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(queue));
    return operation.id;
  };

  const getQueue = (): OfflineOperation[] => {
    if (typeof window === "undefined") return [];
    const queue = localStorage.getItem(OFFLINE_QUEUE_KEY);
    return queue ? JSON.parse(queue) : [];
  };

  const syncQueuedOperations = async () => {
    if (syncInProgressRef.current) return;
    syncInProgressRef.current = true;

    try {
      const queue = getQueue();

      for (const operation of queue) {
        try {
          if (operation.type === "create") {
            await supabase.from(operation.table).insert([operation.data]);
          } else if (operation.type === "update") {
            const { id, ...updateData } = operation.data;
            await supabase.from(operation.table).update(updateData).eq("id", id);
          } else if (operation.type === "delete") {
            await supabase.from(operation.table).delete().eq("id", operation.data.id);
          }

          operation.synced = true;
        } catch (error) {
          console.error(`Erreur lors de la synchronisation de ${operation.table}:`, error);
          toast.error(`Erreur de synchronisation: ${operation.table} - ${(error as any)?.message}`);
          break;
        }
      }

      const remainingQueue = queue.filter((op) => !op.synced);

      if (remainingQueue.length === 0) {
        localStorage.removeItem(OFFLINE_QUEUE_KEY);
        toast.success("Toutes les modifications ont été synchronisées!");
      } else {
        localStorage.setItem(OFFLINE_QUEUE_KEY, JSON.stringify(remainingQueue));
      }
    } finally {
      syncInProgressRef.current = false;
    }
  };

  const saveLocalData = (table: string, data: any) => {
    const localData = localStorage.getItem(OFFLINE_DATA_KEY)
      ? JSON.parse(localStorage.getItem(OFFLINE_DATA_KEY)!)
      : {};
    localData[table] = data;
    localStorage.setItem(OFFLINE_DATA_KEY, JSON.stringify(localData));
  };

  const getLocalData = (table: string) => {
    const data = localStorage.getItem(OFFLINE_DATA_KEY)
      ? JSON.parse(localStorage.getItem(OFFLINE_DATA_KEY)!)
      : {};
    return data[table] || null;
  };

  return {
    isOnline,
    addToQueue,
    getQueue,
    syncQueuedOperations,
    saveLocalData,
    getLocalData,
  };
}
