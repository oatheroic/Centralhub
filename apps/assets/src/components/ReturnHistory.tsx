type Props = {
  doc: {
    return_count?: number | null;
    return_reason_1?: string | null;
    return_reason_2?: string | null;
    return_reason_3?: string | null;
  };
};

export default function ReturnHistory({ doc }: Props) {
  const items = [
    ["ตีกลับครั้งที่ 1", doc.return_reason_1],
    ["ตีกลับครั้งที่ 2", doc.return_reason_2],
    ["ตีกลับครั้งที่ 3", doc.return_reason_3],
  ].filter(([, v]) => !!v) as [string, string][];

  if (items.length === 0) return null;

  return (
    <div
      className="border rounded-lg p-4"
      style={{
        borderColor: "#b91c1c",
        backgroundColor: "color-mix(in oklab, #b91c1c 6%, transparent)",
      }}
    >
      <div className="font-bold mb-2" style={{ color: "#b91c1c" }}>
        📝 ประวัติการตีกลับแก้ไข ({doc.return_count ?? items.length} ครั้ง)
      </div>
      <div className="space-y-1 pl-2 text-sm">
        {items.map(([k, v]) => (
          <div key={k} className="flex gap-2">
            <span className="font-bold text-[color:var(--label-brown)]">{k}:</span>
            <span className="text-[color:var(--input-blue)] font-medium break-all">{v}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
