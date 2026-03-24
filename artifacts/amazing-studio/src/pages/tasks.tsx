import { useState } from "react";
import { useListTasks, useCreateTask, useUpdateTask, useListStaff, TaskStatus, TaskPriority, CreateTaskRequestPriority } from "@workspace/api-client-react";
import { Button, Input, Select, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, Badge } from "@/components/ui";
import { Plus, Clock, AlertCircle, CheckCircle2, User, Flag, Calendar, Filter, List, LayoutGrid, Trash2, ChevronDown } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { formatDate } from "@/lib/utils";

const CATEGORY_LABELS: Record<string, string> = {
  photo: "Chụp ảnh", editing: "Chỉnh sửa", delivery: "Bàn giao", admin: "Hành chính",
  design: "Thiết kế", meeting: "Họp", other: "Khác",
};

const PRIO_CONFIG = {
  high: { label: "Cao", color: "text-red-700", bg: "bg-red-100 border-red-200" },
  medium: { label: "Trung bình", color: "text-yellow-700", bg: "bg-yellow-100 border-yellow-200" },
  low: { label: "Thấp", color: "text-green-700", bg: "bg-green-100 border-green-200" },
};

const columns = [
  { id: "todo" as TaskStatus, title: "Chờ xử lý", icon: Clock, iconColor: "text-slate-500", bg: "bg-slate-50 dark:bg-slate-900/20", border: "border-slate-200" },
  { id: "in_progress" as TaskStatus, title: "Đang thực hiện", icon: AlertCircle, iconColor: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/20", border: "border-blue-200" },
  { id: "done" as TaskStatus, title: "Hoàn thành", icon: CheckCircle2, iconColor: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/20", border: "border-emerald-200" },
];

export default function TasksPage() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useListTasks({});
  const { data: staff = [] } = useListStaff();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();

  const [viewMode, setViewMode] = useState<"kanban" | "list">("kanban");
  const [isOpen, setIsOpen] = useState(false);
  const [dragId, setDragId] = useState<number | null>(null);
  const [filterAssignee, setFilterAssignee] = useState("");
  const [filterPrio, setFilterPrio] = useState("");
  const [form, setForm] = useState({
    title: "", description: "", assigneeId: "", priority: "medium" as CreateTaskRequestPriority,
    dueDate: "", category: "other",
  });

  const handleStatusChange = (taskId: number, newStatus: TaskStatus) => {
    updateTask.mutate({ id: taskId, data: { status: newStatus } }, { onSuccess: () => qc.invalidateQueries({ queryKey: ["/api/tasks"] }) });
  };

  const handleCreate = () => {
    if (!form.title) return;
    createTask.mutate({
      data: {
        title: form.title, description: form.description,
        assigneeId: form.assigneeId ? parseInt(form.assigneeId) : undefined,
        priority: form.priority, dueDate: form.dueDate || undefined,
        category: form.category,
      }
    }, { onSuccess: () => { qc.invalidateQueries({ queryKey: ["/api/tasks"] }); setIsOpen(false); setForm({ title: "", description: "", assigneeId: "", priority: "medium", dueDate: "", category: "other" }); } });
  };

  const filteredTasks = tasks.filter(t => {
    const matchAssignee = !filterAssignee || String(t.assigneeId) === filterAssignee;
    const matchPrio = !filterPrio || t.priority === filterPrio;
    return matchAssignee && matchPrio;
  });

  const tasksByStatus = {
    todo: filteredTasks.filter(t => t.status === "todo"),
    in_progress: filteredTasks.filter(t => t.status === "in_progress"),
    done: filteredTasks.filter(t => t.status === "done"),
  };

  const counts = { todo: tasksByStatus.todo.length, in_progress: tasksByStatus.in_progress.length, done: tasksByStatus.done.length };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 mb-4">
        <div>
          <h1 className="text-2xl font-bold">Giao việc</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {counts.todo} chờ · {counts.in_progress} đang làm · {counts.done} hoàn thành
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border overflow-hidden">
            <button onClick={() => setViewMode("kanban")} className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${viewMode === "kanban" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              <LayoutGrid className="w-3.5 h-3.5" /> Kanban
            </button>
            <button onClick={() => setViewMode("list")} className={`px-3 py-1.5 text-sm flex items-center gap-1.5 ${viewMode === "list" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted"}`}>
              <List className="w-3.5 h-3.5" /> Danh sách
            </button>
          </div>
          <Button onClick={() => setIsOpen(true)} className="gap-1.5"><Plus className="w-4 h-4" />Thêm việc</Button>
        </div>
      </div>

      {/* Filters */}
      <div className="flex gap-2 mb-4">
        <Select value={filterAssignee} onChange={e => setFilterAssignee(e.target.value)} className="text-sm">
          <option value="">Tất cả nhân viên</option>
          {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
        </Select>
        <Select value={filterPrio} onChange={e => setFilterPrio(e.target.value)} className="text-sm">
          <option value="">Tất cả độ ưu tiên</option>
          <option value="high">🔴 Cao</option>
          <option value="medium">🟡 Trung bình</option>
          <option value="low">🟢 Thấp</option>
        </Select>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">Đang tải...</div>
      ) : viewMode === "kanban" ? (
        /* KANBAN VIEW */
        <div className="flex gap-4 overflow-x-auto pb-4 flex-1">
          {columns.map(col => {
            const ColTasks = tasksByStatus[col.id];
            return (
              <div
                key={col.id}
                className={`flex-1 min-w-72 rounded-2xl border ${col.border} ${col.bg} flex flex-col`}
                onDragOver={e => e.preventDefault()}
                onDrop={() => { if (dragId !== null) handleStatusChange(dragId, col.id); setDragId(null); }}
              >
                <div className={`px-4 py-3 flex items-center justify-between border-b ${col.border}`}>
                  <div className="flex items-center gap-2">
                    <col.icon className={`w-4 h-4 ${col.iconColor}`} />
                    <span className="font-semibold text-sm">{col.title}</span>
                  </div>
                  <span className="text-xs font-bold bg-background border rounded-full px-2 py-0.5">{ColTasks.length}</span>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                  {ColTasks.map(task => {
                    const prio = PRIO_CONFIG[task.priority as keyof typeof PRIO_CONFIG] ?? PRIO_CONFIG.medium;
                    const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
                    return (
                      <div
                        key={task.id}
                        draggable
                        onDragStart={() => setDragId(task.id)}
                        className="bg-background rounded-xl border shadow-sm p-3 cursor-grab active:cursor-grabbing hover:shadow-md transition-all group"
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <p className="font-medium text-sm leading-snug flex-1">{task.title}</p>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border font-medium flex-shrink-0 ${prio.bg} ${prio.color}`}>{prio.label}</span>
                        </div>
                        {task.description && <p className="text-xs text-muted-foreground mb-2 line-clamp-2">{task.description}</p>}
                        <div className="flex items-center justify-between text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            {task.assigneeName && <span className="flex items-center gap-1"><User className="w-3 h-3" />{task.assigneeName}</span>}
                            {task.category && task.category !== "other" && <span className="bg-muted px-1.5 py-0.5 rounded text-[10px]">{CATEGORY_LABELS[task.category] ?? task.category}</span>}
                          </div>
                          {task.dueDate && (
                            <span className={`flex items-center gap-1 ${isOverdue ? "text-red-600 font-medium" : ""}`}>
                              <Calendar className="w-3 h-3" />
                              {formatDate(task.dueDate)}
                            </span>
                          )}
                        </div>
                        {/* Status move buttons */}
                        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          {columns.filter(c => c.id !== col.id).map(c => (
                            <button key={c.id} onClick={() => handleStatusChange(task.id, c.id)} className={`text-[10px] px-2 py-1 rounded border ${c.bg} ${c.iconColor} font-medium hover:opacity-80 transition`}>
                              → {c.title}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                  {ColTasks.length === 0 && <div className="text-center py-8 text-xs text-muted-foreground">Kéo thẻ vào đây</div>}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* LIST VIEW */
        <div className="rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-muted-foreground text-xs font-semibold uppercase">
              <tr>
                <th className="px-4 py-3 text-left">Công việc</th>
                <th className="px-4 py-3 text-left">Nhân viên</th>
                <th className="px-4 py-3 text-center">Ưu tiên</th>
                <th className="px-4 py-3 text-center">Trạng thái</th>
                <th className="px-4 py-3 text-left">Hạn</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredTasks.length === 0 && <tr><td colSpan={6} className="py-10 text-center text-muted-foreground">Không có công việc</td></tr>}
              {filteredTasks.map(task => {
                const prio = PRIO_CONFIG[task.priority as keyof typeof PRIO_CONFIG] ?? PRIO_CONFIG.medium;
                const isOverdue = task.dueDate && new Date(task.dueDate) < new Date() && task.status !== "done";
                return (
                  <tr key={task.id} className="hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <p className="font-medium">{task.title}</p>
                      {task.description && <p className="text-xs text-muted-foreground truncate max-w-xs">{task.description}</p>}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{task.assigneeName || "—"}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${prio.bg} ${prio.color}`}>{prio.label}</span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      <Select value={task.status} onChange={e => handleStatusChange(task.id, e.target.value as TaskStatus)} className="text-xs h-7 py-0 w-36 mx-auto">
                        {columns.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}
                      </Select>
                    </td>
                    <td className={`px-4 py-3 text-sm ${isOverdue ? "text-red-600 font-medium" : "text-muted-foreground"}`}>
                      {task.dueDate ? formatDate(task.dueDate) : "—"}
                    </td>
                    <td className="px-4 py-3"></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Task Modal */}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Tạo công việc mới</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><label className="text-xs font-medium text-muted-foreground">Tiêu đề *</label><Input placeholder="Tên công việc..." value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} /></div>
            <div><label className="text-xs font-medium text-muted-foreground">Mô tả</label><Textarea rows={2} placeholder="Chi tiết..." value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} /></div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Giao cho</label>
                <Select value={form.assigneeId} onChange={e => setForm(f => ({ ...f, assigneeId: e.target.value }))}>
                  <option value="">-- Chọn nhân viên --</option>
                  {staff.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Độ ưu tiên</label>
                <Select value={form.priority} onChange={e => setForm(f => ({ ...f, priority: e.target.value as CreateTaskRequestPriority }))}>
                  <option value="high">🔴 Cao</option>
                  <option value="medium">🟡 Trung bình</option>
                  <option value="low">🟢 Thấp</option>
                </Select>
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground">Danh mục</label>
                <Select value={form.category} onChange={e => setForm(f => ({ ...f, category: e.target.value }))}>
                  {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </Select>
              </div>
              <div><label className="text-xs font-medium text-muted-foreground">Hạn hoàn thành</label><Input type="date" value={form.dueDate} onChange={e => setForm(f => ({ ...f, dueDate: e.target.value }))} /></div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={handleCreate} disabled={createTask.isPending} className="flex-1">{createTask.isPending ? "Đang tạo..." : "Tạo công việc"}</Button>
              <Button variant="outline" onClick={() => setIsOpen(false)}>Hủy</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
