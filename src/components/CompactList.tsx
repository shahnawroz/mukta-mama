import { Card } from "antd";

export type CompactItem = {
  key: string;
  title: React.ReactNode;
  sub?: React.ReactNode;
  amount: React.ReactNode;
  actions?: React.ReactNode;
};

// A phone-sized list: one slim row per entry, all inside a single card.
export default function CompactList({ items }: { items: CompactItem[] }) {
  return (
    <Card className="soft-card" styles={{ body: { padding: 0 } }}>
      {items.map((it, i) => (
        <div
          key={it.key}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 8,
            padding: "12px 16px",
            borderTop: i === 0 ? "none" : "1px solid #f1f5f9",
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
              {it.title}
            </div>
            {it.sub && <div style={{ color: "#64748b", fontSize: 14, marginTop: 2 }}>{it.sub}</div>}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 2, flexShrink: 0 }}>
            <b style={{ fontSize: 18, marginRight: 4 }}>{it.amount}</b>
            {it.actions}
          </div>
        </div>
      ))}
    </Card>
  );
}
