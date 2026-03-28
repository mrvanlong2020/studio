import { Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type StaffAssignment = {
  id: string;
  staffId: number | null;
  staffName: string;
  role: string;
  castAmount: number;
};

type StaffRate = { staffId: number; role: string; taskKey: string; rate: number | null };

function genId() {
  return Math.random().toString(36).slice(2, 9);
}

export function newStaffAssignment(): StaffAssignment {
  return { id: genId(), staffId: null, staffName: "", role: "", castAmount: 0 };
}

function fmtVND(n: number) { return n.toLocaleString("vi-VN") + "đ"; }

function lookupStaffRate(staffId: number | null, role: string, baseJobType: string, rates: StaffRate[]): number {
  if (!staffId || !role) return 0;
  // Try exact match with baseJobType first
  const found = rates.find(r => r.staffId === staffId && r.role === role && r.taskKey === baseJobType && r.rate != null);
  if (found) return found.rate;
  // Fallback to "mac_dinh" (default) if exact job type not found
  const fallback = rates.find(r => r.staffId === staffId && r.role === role && r.taskKey === "mac_dinh" && r.rate != null);
  return fallback?.rate ?? 0;
}

interface StaffAssignmentEditorProps {
  value: StaffAssignment[];
  onChange: (items: StaffAssignment[]) => void;
  staffOptions: { id: number; name: string; roles: string[] }[];
  allStaffRates: StaffRate[];
  baseJobType: string; // Job type for rate lookup (e.g., "chup_cong")
  className?: string;
}

export function StaffAssignmentEditor({
  value,
  onChange,
  staffOptions,
  allStaffRates,
  baseJobType,
  className,
}: StaffAssignmentEditorProps) {
  const roleOptions = [
    { value: "photographer", label: "📷 Nhiếp ảnh" },
    { value: "makeup", label: "💄 Makeup" },
    { value: "assistant", label: "🤝 Trợ lý" },
    { value: "videographer", label: "🎬 Quay phim" },
    { value: "assistant_photo", label: "🔧 Thợ phụ" },
    { value: "marketing", label: "📢 Marketing" },
    { value: "sales", label: "💼 Sale" },
    { value: "other", label: "👤 Khác" },
  ];

  const update = (id: string, patch: Partial<StaffAssignment>) => {
    onChange(value.map(item => item.id === id ? { ...item, ...patch } : item));
  };

  const remove = (id: string) => {
    onChange(value.filter(item => item.id !== id));
  };

  const add = () => {
    onChange([...value, newStaffAssignment()]);
  };

  const handleStaffChange = (itemId: string, staffId: number, role: string) => {
    const castAmount = lookupStaffRate(staffId, role, baseJobType, allStaffRates);
    update(itemId, { staffId, staffName: staffOptions.find(s => s.id === staffId)?.name ?? "", castAmount });
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
        <div className="space-y-1.5">
          {value.map((item, idx) => (
            <div key={item.id} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-4 flex-shrink-0 text-center">{idx + 1}</span>
              
              {/* Role */}
              <select
                className="flex-1 px-2.5 py-2 border border-border rounded-lg text-sm bg-background focus:outline-none focus:ring-1 focus:ring-primary/40"
                value={item.role}
                onChange={e => {
                  const newRole = e.target.value;
                  update(item.id, { role: newRole });
                  if (item.staffId) {
                    const castAmount = lookupStaffRate(item.staffId, newRole, baseJobType, allStaffRates);
                    update(item.id, { castAmount });
                  }
                }}
              >
                <option value="">— Vai trò —</option>
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
                  const staffId = parseInt(e.target.value);
                  handleStaffChange(item.id, staffId, item.role);
                }}
              >
                <option value="">— Nhân sự —</option>
                {staffOptions.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>

              {/* Cost display */}
              <div className="flex-shrink-0 w-24 text-right">
                <span className="text-xs font-semibold text-amber-600">
                  {item.castAmount > 0 ? fmtVND(item.castAmount) : "—"}
                </span>
              </div>

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
