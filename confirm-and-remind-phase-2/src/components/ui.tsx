import type { ReactNode } from "react";

export const btn =
  "min-h-11 rounded-xl border border-calm-100 bg-white px-4 text-base font-medium text-calm-700 active:bg-calm-50 disabled:opacity-60";
export const btnPrimary = "min-h-12 rounded-xl bg-calm-600 px-5 text-lg font-medium text-white active:bg-calm-700 disabled:opacity-60";
export const btnDanger = "min-h-11 rounded-xl border border-red-200 bg-white px-4 text-base font-medium text-red-700 disabled:opacity-60";
export const field = "w-full min-h-12 rounded-xl border border-calm-100 bg-white px-4 text-base";

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-calm-100 bg-white p-6 text-center">
      <p className="text-lg font-medium text-calm-700">{title}</p>
      {children && <p className="mt-1 text-calm-600">{children}</p>}
    </div>
  );
}

export function ErrorLine({ message }: { message: string | null }) {
  return message ? (
    <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-800">
      {message}
    </p>
  ) : null;
}

export function PageTitle({ children }: { children: ReactNode }) {
  return <h1 className="mb-4 text-2xl font-semibold text-calm-700">{children}</h1>;
}
