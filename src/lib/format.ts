export const fmtMoney = (n: number | string | null | undefined) => {
  const v = Number(n ?? 0);
  return (
    new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(
      v,
    ) + " Ar"
  );
};

export const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "short", timeStyle: "short" }).format(new Date(d));

export const fmtDateOnly = (d: string | Date) =>
  new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(d));
