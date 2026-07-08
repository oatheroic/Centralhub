import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

const MAX_NOTES = 10;

interface Props {
  notes: string[];
  onChange: (next: string[]) => void;
  labelClassName: string;
  inputClassName: string;
}

/**
 * Optional multi-row "หมายเหตุ" input with "+ เพิ่ม" up to 10 rows.
 * Used in Steps 4/5/6. Style mirrors Step 1 fields.
 */
export default function NotesInput({ notes, onChange, labelClassName, inputClassName }: Props) {
  const hasRows = notes.length > 0;
  return (
    <div className="space-y-2">
      {hasRows && <Label className={labelClassName}>หมายเหตุ (ไม่บังคับ)</Label>}
      {notes.map((v, i) => (
        <div key={i} className="flex gap-2 items-start">
          <Textarea
            rows={2}
            className={inputClassName + " flex-1"}
            value={v}
            onChange={(e) => {
              const next = [...notes];
              next[i] = e.target.value;
              onChange(next);
            }}
            placeholder={`หมายเหตุที่ ${i + 1}`}
          />
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onChange(notes.filter((_, j) => j !== i))}
          >
            ลบ
          </Button>
        </div>
      ))}
      {notes.length < MAX_NOTES && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => onChange([...notes, ""])}
        >
          + เพิ่มหมายเหตุ
        </Button>
      )}
    </div>
  );
}
