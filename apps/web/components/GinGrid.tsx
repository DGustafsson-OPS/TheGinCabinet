// A responsive list of gin cards.
import GinCard from "@/components/GinCard";
import type { PublicGinCard } from "@/lib/types";

import styles from "./GinCard.module.css";

export default function GinGrid({ gins }: { gins: PublicGinCard[] }) {
  return (
    <ul className={styles.grid}>
      {gins.map((gin) => (
        <li key={gin.slug}>
          <GinCard gin={gin} />
        </li>
      ))}
    </ul>
  );
}
