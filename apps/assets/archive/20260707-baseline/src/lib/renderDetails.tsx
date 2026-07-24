import React from "react";

/**
 * แสดงข้อความหลายบรรทัด: บรรทัดที่มี "หมายเหตุ:" จะถูกเรนเดอร์เป็นตัวหนาสีแดง
 */
export function renderDetails(text: any): React.ReactNode {
  if (text === null || text === undefined) return null;
  const s = String(text);
  if (!s) return null;
  const lines = s.split(/\r?\n/);
  return (
    <span className="whitespace-pre-wrap break-words">
      {lines.map((line, i) => {
        const isNote = /หมายเหตุ\s*:/.test(line);
        return (
          <React.Fragment key={i}>
            {isNote ? (
              <span className="font-bold text-red-600">{line}</span>
            ) : (
              line
            )}
            {i < lines.length - 1 ? "\n" : null}
          </React.Fragment>
        );
      })}
    </span>
  );
}
