import type { ChangeEvent } from "react";

import Button from "@/components/Button";
import styles from "./sidebar.module.scss";

interface SidebarProps {
  activeNav: "current" | "live" | "top" | "match";
  searchValue?: string;
  onSearchChange?: (value: string) => void;
  className?: string;
}

export default function Sidebar({
  searchValue,
  onSearchChange,
  className,
}: SidebarProps) {
  const handleSearchChange = (event: ChangeEvent<HTMLInputElement>) => {
    onSearchChange?.(event.target.value);
  };

  return (
    <header className={`${styles.header} ${className ?? ""}`}>
      <div className={styles.brand}>GreenScore</div>
      {onSearchChange && (
        <div className={styles.searchWrap}>
          <input
            className={styles.search}
            type="search"
            placeholder="Takım, lig, skor ara"
            value={searchValue ?? ""}
            onChange={handleSearchChange}
          />
        </div>
      )}
      <div className={styles.actions}>
        <Button type="button" variant="ghost" className={styles.actionGhost}>
          Üye Ol
        </Button>
        <Button type="button" className={styles.actionPrimary}>
          Giriş Yap
        </Button>
      </div>
    </header>
  );
}
