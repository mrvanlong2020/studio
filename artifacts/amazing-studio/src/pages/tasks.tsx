import { useState } from "react";
import { useListTasks, useCreateTask, useUpdateTask, useListStaff, TaskStatus, TaskPriority, CreateTaskRequestPriority } from "@workspace/api-client-react";
import { Card, CardContent, Badge, Button, Input, Select, Textarea, Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui";
import { Plus, Clock, AlertCircle, CheckCircle2, User, Flag, Calendar } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";

export default function TasksPage() {
  const { data: tasks = [], isLoading } = useListTasks({});
  const { data: staff = [] } = useListStaff();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const queryClient = useQueryClient();

  const [isOpen, setIsOpen] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    assigneeId: "",
    priority: "medium" as CreateTaskRequestPriority,
    dueDate: "",
  });

  const columns = [
    { id: "todo" as TaskStatus, title: "Chờ xử lý", icon: Clock, color: "text-blue-500", bg: "bg-blue-50 dark:bg-blue-900/10" },
    { id: "in_progress" as TaskStatus, title: "Đang thực hiện", icon: AlertCircle, color: "text-orange-500", bg: "bg-orange-50 dark:bg-orange-900/10" },
    { id: "done" as TaskStatus, title: "Hoàn thành", icon: CheckCircle2, color: "text-emerald-500", bg: "bg-emerald-50 dark:bg-emerald-900/10" },
  ];

  const handleStatusChange = (taskId: number, newStatus: TaskStatus) => {
    updateTask.mutate({ id: taskId, data: { status: newStatus } }, {
      onSuccess: () => queryClient.invalidateQueries({ queryKey: ["/api/tasks"] })
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createTask.mutate({
      data: {
        ...formData,
        assigneeId: formData.assigneeId ? parseInt(formData.assigneeId) : null,
      }
    }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ["/api/tasks"] });
        setIsOpen(false);
        setFormData({ title: "", description: "", assigneeId: "", priority: "medium", dueDate: "" });
      }
    });
  };

  const getPriorityBadge = (p: string) => {
    switch(p) {
      case 'urgent': return <Badge variant="destructive" className="text-[10px]">Khẩn cấp</Badge>;
      case 'high': return <Badge variant="warning" className="text-[10px]">Cao</Badge>;
      case 'low': return <Badge variant="secondary" className="text-[10px]">Thấp</Badge>;
      default: return <Badge variant="outline" className="text-[10px]">Trung bình</Badge>;
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 flex-shrink-0">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Giao việc</h1>
          <p className="text-muted-foreground mt-1">Quản lý và theo dõi tiến độ công việc</p>
        </div>
        
        <Dialog open={isOpen} onOpenChange={setIsOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2"><Plus className="w-4 h-4"/> Thêm công việc</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Giao việc mới</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4 mt-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Tiêu đề *</label>
                <Input required value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} placeholder="Vd: Chuẩn bị váy cho khách A..." />
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Mô tả</label>
                <Textarea value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} placeholder="Chi tiết công việc..." />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Người phụ trách</label>
                  <Select value={formData.assigneeId} onChange={e => setFormData({...formData, assigneeId: e.target.value})}>
                    <option value="">-- Chưa giao --</option>
                    {staff.map(s => <option key={s.id} value={s.id}>{s.name} - {s.role}</option>)}
                  </Select>
                </div>
                <div>
                  <label className="text-sm font-medium mb-1.5 block">Độ ưu tiên</label>
                  <Select value={formData.priority} onChange={e => setFormData({...formData, priority: e.target.value as CreateTaskRequestPriority})}>
                    <option value="low">Thấp</option>
                    <option value="medium">Trung bình</option>
                    <option value="high">Cao</option>
                    <option value="urgent">Khẩn cấp</option>
                  </Select>
                </div>
              </div>
              <div>
                <label className="text-sm font-medium mb-1.5 block">Hạn chót</label>
                <Input type="date" value={formData.dueDate} onChange={e => setFormData({...formData, dueDate: e.target.value})} />
              </div>
              <Button type="submit" className="w-full" disabled={createTask.isPending}>
                {createTask.isPending ? "Đang tạo..." : "Giao việc"}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground">Đang tải công việc...</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1 min-h-[500px]">
          {columns.map(col => (
            <div key={col.id} className={`flex flex-col rounded-2xl border ${col.bg} p-4`}>
              <div className="flex items-center gap-2 mb-4">
                <col.icon className={`w-5 h-5 ${col.color}`} />
                <h3 className="font-bold">{col.title}</h3>
                <Badge variant="secondary" className="ml-auto">{tasks.filter(t => t.status === col.id).length}</Badge>
              </div>
              
              <div className="flex-1 space-y-3 overflow-y-auto pr-1 no-scrollbar">
                {tasks.filter(t => t.status === col.id).map(task => (
                  <Card key={task.id} className="cursor-grab hover:shadow-md transition-shadow border-l-4 border-l-primary cursor-pointer group">
                    <CardContent className="p-4 flex flex-col gap-3">
                      <div className="flex justify-between items-start gap-2">
                        <h4 className="font-semibold text-sm leading-tight group-hover:text-primary transition-colors">{task.title}</h4>
                        {getPriorityBadge(task.priority)}
                      </div>
                      
                      {task.description && (
                        <p className="text-xs text-muted-foreground line-clamp-2">{task.description}</p>
                      )}
                      
                      <div className="flex items-center justify-between mt-1 text-xs font-medium text-muted-foreground">
                        <div className="flex items-center gap-1.5 bg-background border px-2 py-1 rounded-md">
                          <User className="w-3 h-3" />
                          <span>{task.assigneeName || "Chưa giao"}</span>
                        </div>
                        {task.dueDate && (
                          <div className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            <span>{new Date(task.dueDate).toLocaleDateString('vi-VN')}</span>
                          </div>
                        )}
                      </div>
                      
                      <div className="pt-2 mt-2 border-t flex justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                        {columns.filter(c => c.id !== task.status).map(c => (
                          <button 
                            key={c.id} 
                            onClick={() => handleStatusChange(task.id, c.id)}
                            className="text-[10px] px-2 py-1 rounded bg-secondary hover:bg-primary hover:text-primary-foreground transition-colors font-medium"
                          >
                            Chuyển "{c.title}"
                          </button>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {tasks.filter(t => t.status === col.id).length === 0 && (
                  <div className="h-24 border-2 border-dashed border-muted-foreground/20 rounded-xl flex items-center justify-center text-sm text-muted-foreground/50">
                    Kéo thả vào đây
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
