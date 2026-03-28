import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StaffAssignment = {
  id: string;
  staffId: number | null;
  staffName: string;
  role: string;
  task: string;
};

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

export function newStaffAssignment(): StaffAssignment {
  return { id: genId(), staffId: null, staffName: "", role: "", task: "" };
}

interface StaffAssignmentEditorProps {
  value: StaffAssignment[];
  onChange: (items: StaffAssignment[]) => void;
  staffOptions: { id: number; name: string; roles: string[] }[];
  roleOptions: { value: string; label: string }[];
  className?: string;
}

export function StaffAssignmentEditor({
  value,
  onChange,
  staffOptions,
  roleOptions,
  className,
}: StaffAssignmentEditorProps) {
  const update = (id: string, patch: Partial<StaffAssignment>) => {
    onChange(value.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const remove = (id: string) => {
    onChange(value.filter(item => item.id !== id));
  };

  const add = () => {
    onChange([...value, newStaffAssignment()]);
  };

  return (
    <div className={cn("space-y-2", className)}>
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
          👥 Nhân sự
        </span>
        <button
          type="button"
          onClick={add}
          className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 font-semibold transition-colors"
        >
          <Plus className="w-3.5 h-3.5" /> Thêm nhân sự
        </button>
      </div>

      {/* Lines */}
      {value.length === 0 ? (
        <button
          type="button"
          onClick={add}
          className="w-full border-2 border-dashed border-border/60 rounded-xl py-3 text-xs text-muted-foreground hover:border-primary/40 hover:bg-muted/20 transition-all flex items-center justify-center gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          Thêm nhân sự cho công việc
        </button>
      ) : (
        <div className="space-y-2">
          {value.map((item, idx) => (
            <div key={item.id} className="flex items-end gap-2">
              <span className="text-[10px] text-muted-foreground w-4 flex-shrink-0 text-center">{idx + 1}</span>
              
              {/* Role */}
              <select
                className="flex-1 px-2.5 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={item.role}
                onChange={e => update(item.id, { role: e.target.value })}
              >
                <option value="">— Chọn vai trò —</option>
                {roleOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>

              {/* Staff */}
              <select
                className="flex-1 px-2.5 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={item.staffId ?? ""}
                onChange={e => {
                  const staff = staffOptions.find(s => s.id === parseInt(e.target.value));
                  update(item.id, {
                    staffId: staff?.id ?? null,
                    staffName: staff?.name ?? "",
                    task: "",
                  });
                }}
              >
                <option value="">— Chọn nhân sự —</option>
                {staffOptions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {/* Task (optional, shows if staff selected) */}
              {item.staffId && (
                <select
                  className="flex-1 px-2.5 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                  value={item.task}
                  onChange={e => update(item.id, { task: e.target.value })}
                >
                  <option value="">— Loại công việc —</option>
                  <option value="chinh">Chính</option>
                  <option value="phu">Phụ</option>
                  <option value="ho_tro">Hỗ trợ</option>
                  <option value="mac_dinh">Mặc định</option>
                </select>
              )}

              {/* Delete */}
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="p-1.5 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors flex-shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
