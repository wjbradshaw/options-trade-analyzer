export interface NeedsAttentionItem {
  id: string;
  severity: "blocking" | "urgent";
  message: string;
}

export interface NeedsAttentionProps {
  items: NeedsAttentionItem[];
}

export const NeedsAttention = ({ items }: NeedsAttentionProps) => (
  <section
    aria-label="Needs attention"
    style={{
      background: "#2a1820",
      border: "1px solid #c56a7a",
      borderRadius: "0.75rem",
      padding: "1rem",
    }}
  >
    <h2 style={{ marginTop: 0 }}>Needs attention</h2>
    <ul>
      {items.map((item) => (
        <li key={item.id}>{item.message}</li>
      ))}
    </ul>
  </section>
);
