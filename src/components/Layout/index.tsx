import type { PropsWithChildren } from "react";

import Header from "@/components/Sidebar";
import styles from "./layout.module.scss";

interface LayoutProps extends PropsWithChildren {
  activeNav?: "current" | "live" | "top" | "match";
  searchValue?: string;
  onSearchChange?: (value: string) => void;
}

export default function Layout({
  children,
  activeNav = "live",
  searchValue,
  onSearchChange,
}: LayoutProps) {
  return (
    <div className={styles.layout}>
      <Header
        activeNav={activeNav}
        searchValue={searchValue}
        onSearchChange={onSearchChange}
        className={styles.header}
      />
      <main className={styles.content}>{children}</main>
    </div>
  );
}
