"use client";

import { useRouter } from "next/navigation";
import { api } from "../lib/client";
import { Icon } from "./icons";
import { Stamp } from "./ui";

export function UserMenu({ name, role }: { name: string; role: string }) {
  const router = useRouter();
  return (
    <div className="flex items-center gap-3">
      <div className="hidden text-right sm:block">
        <div className="text-sm font-medium leading-tight">{name}</div>
        <Stamp value={role} />
      </div>
      <button
        onClick={async () => {
          await api("/api/auth/logout", { body: {} });
          router.push("/login");
          router.refresh();
        }}
        className="flex cursor-pointer items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 text-xs text-ink-soft hover:border-red/40 hover:text-red"
      >
        <Icon name="logout" className="size-3.5" />
        Sign out
      </button>
    </div>
  );
}
