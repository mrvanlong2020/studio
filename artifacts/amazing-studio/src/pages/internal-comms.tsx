import { useState, useMemo, useRef, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  MessageSquare, Bell, AlertTriangle, Clock, CheckCircle2,
  Send, Plus, X, Users, Film, Calendar, User,
  AlertCircle, Check, RefreshCw, ChevronRight, Zap
} from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

type Notification = {
  id: number;
  recipientStaffId: number | null;
  senderStaffId: number | null;
  type: string;
  title: string;
  body: string;
  linkType: string | null;
  linkId: number | null;
  isRead: boolean;
  createdAt: string;
};

type Room = {
  id: number;
  name: string;
  type: string;
  linkType: string | null;
  linkId: number | null;
  createdByStaffId: number | null;
  isActive: boolean;
  createdAt: string;
};

type Message = {
  id: number;
  roomId: number;
  senderStaffId: number | null;
  senderName: string;
  content: string;
  isSystem: boolean;
  createdAt: string;
};

type DeadlineAlert = {
  id: number;
  jobCode: string;
  customerName: string;
  assignedStaffName: string;
  customerDeadline: string;
  internalDeadline: string;
  status: string;
  progressPercent: number;
  daysLeft: number;
  urgency: string;
};

const URGENCY_CONFIG = {
  overdue: { label: "Quá hạn",     cls: "bg-red-100 text-red-700 dark:bg-red-950/30 dark:text-red-400",     dot: "bg-red-500", border: "border-red-200 dark:border-red-800" },
  today:   { label: "Hôm nay!",    cls: "bg-orange-100 text-orange-700 dark:bg-orange-950/30 dark:text-orange-400", dot: "bg-orange-500", border: "border-orange-200 dark:border-orange-800" },
  urgent:  { label: "Sắp hết hạn", cls: "bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-400", dot: "bg-amber-500", border: "border-amber-200 dark:border-amber-800" },
  soon:    { label: "Cần chú ý",   cls: "bg-yellow-100 text-yellow-700 dark:bg-yellow-950/30 dark:text-yellow-400", dot: "bg-yellow-400", border: "border-yellow-200 dark:border-yellow-800" },
};

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "vừa xong";
  if (mins < 60) return `${mins} phút trước`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} giờ trước`;
  const days = Math.floor(hrs / 24);
  return `${days} ngày trước`;
}

type Tab = "alerts" | "notifications" | "chat";

export default function InternalCommsPage() {
  const qc = useQueryClient();
  const { viewer } = useStaffAuth();
  const [activeTab, setActiveTab] = useState<Tab>("alerts");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [newMessage, setNewMessage] = useState("");
  const [showNewRoom, setShowNewRoom] = useState(false);
  const [newRoomName, setNewRoomName] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const { data: notifications = [], isLoading: notifLoading } = useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: () => fetch(`${BASE}/api/notifications`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: alerts = [], isLoading: alertsLoading } = useQuery<DeadlineAlert[]>({
    queryKey: ["deadline-alerts"],
    queryFn: () => fetch(`${BASE}/api/deadline-alerts`).then(r => r.json()),
    refetchInterval: 60000,
  });

  const { data: rooms = [] } = useQuery<Room[]>({
    queryKey: ["message-rooms"],
    queryFn: () => fetch(`${BASE}/api/message-rooms`).then(r => r.json()),
    refetchInterval: 30000,
  });

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["messages", selectedRoom?.id],
    queryFn: () => selectedRoom ? fetch(`${BASE}/api/message-rooms/${selectedRoom.id}/messages`).then(r => r.json()) : Promise.resolve([]),
    enabled: !!selectedRoom,
    refetchInterval: 10000,
  });

  const markRead = useMutation({
    mutationFn: (id: number) => fetch(`${BASE}/api/notifications/${id}/read`, { method: "PUT" }).then(r => r.json()),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const markAllRead = useMutation({
    mutationFn: () => fetch(`${BASE}/api/notifications/read-all`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  });

  const sendMessage = useMutation({
    mutationFn: ({ roomId, content }: { roomId: number; content: string }) =>
      fetch(`${BASE}/api/message-rooms/${roomId}/messages`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          senderStaffId: viewer?.id ?? null,
          senderName: viewer?.name ?? "Quản trị viên",
          content,
        })
      }).then(r => r.json()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["messages", selectedRoom?.id] });
      setNewMessage("");
    },
  });

  const createRoom = useMutation({
    mutationFn: (name: string) => fetch(`${BASE}/api/message-rooms`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, type: "group", createdByStaffId: viewer?.id ?? null })
    }).then(r => r.json()),
    onSuccess: (room: Room) => {
      qc.invalidateQueries({ queryKey: ["message-rooms"] });
      setShowNewRoom(false);
      setNewRoomName("");
      setSelectedRoom(room);
      setActiveTab("chat");
    },
  });

  // Auto scroll to bottom on new messages
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  const unreadCount = notifications.filter(n => !n.isRead).length;
  const overdueCount = alerts.filter(a => a.urgency === "overdue").length;
  const urgentCount = alerts.filter(a => a.urgency === "today" || a.urgency === "urgent").length;

  const TABS = [
    { key: "alerts" as Tab, label: "Nhắc deadline", icon: AlertTriangle, badge: overdueCount + urgentCount },
    { key: "notifications" as Tab, label: "Thông báo", icon: Bell, badge: unreadCount },
    { key: "chat" as Tab, label: "Chat nội bộ", icon: MessageSquare, badge: 0 },
  ];

  function handleSendMessage(e: React.FormEvent) {
    e.preventDefault();
    if (!newMessage.trim() || !selectedRoom) return;
    sendMessage.mutate({ roomId: selectedRoom.id, content: newMessage.trim() });
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex-shrink-0 px-6 py-4 border-b border-border">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
              <MessageSquare className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold">Trao đổi & Nhắc việc nội bộ</h1>
              <p className="text-xs text-muted-foreground">
                {overdueCount > 0 && <span className="text-red-500 font-medium">{overdueCount} quá hạn · </span>}
                {urgentCount > 0 && <span className="text-amber-500 font-medium">{urgentCount} sắp hết hạn · </span>}
                {unreadCount > 0 && <span className="text-blue-500 font-medium">{unreadCount} thông báo chưa đọc</span>}
                {overdueCount === 0 && urgentCount === 0 && unreadCount === 0 && "Không có cảnh báo mới"}
              </p>
            </div>
          </div>
        </div>

        {/* Tab bar */}
        <div className="flex gap-1 mt-3">
          {TABS.map(tab => (
            <button key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-colors relative ${activeTab === tab.key ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted"}`}>
              <tab.icon className="w-4 h-4" />
              {tab.label}
              {tab.badge > 0 && (
                <span className={`ml-1 text-xs font-bold px-1.5 py-0.5 rounded-full ${activeTab === tab.key ? "bg-white/20 text-white" : "bg-red-500 text-white"}`}>
                  {tab.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-hidden flex">

        {/* ── Tab: Deadline Alerts ──────────────────────────────────────────── */}
        {activeTab === "alerts" && (
          <div className="flex-1 overflow-auto p-6">
            {alertsLoading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Đang tải...
              </div>
            ) : alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <CheckCircle2 className="w-12 h-12 mb-3 text-emerald-400 opacity-60" />
                <p className="font-medium">Không có deadline nào cần chú ý</p>
                <p className="text-sm mt-1">Tất cả job đang trong thời hạn</p>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-4">
                  {alerts.length} job cần chú ý
                </p>
                {alerts.map(alert => {
                  const cfg = URGENCY_CONFIG[alert.urgency as keyof typeof URGENCY_CONFIG] ?? URGENCY_CONFIG.soon;
                  return (
                    <div key={alert.id}
                      className={`rounded-2xl border p-4 bg-card ${cfg.border}`}>
                      <div className="flex items-start gap-3">
                        <div className={`w-2 h-2 rounded-full mt-2 flex-shrink-0 ${cfg.dot}`} />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${cfg.cls}`}>
                              {cfg.label}
                            </span>
                            <span className="font-semibold text-sm">{alert.jobCode}</span>
                            <span className="text-sm text-muted-foreground">· {alert.customerName}</span>
                          </div>
                          <div className="flex items-center gap-3 mt-1.5 text-xs text-muted-foreground flex-wrap">
                            {alert.assignedStaffName && (
                              <span className="flex items-center gap-1"><User className="w-3 h-3" />{alert.assignedStaffName}</span>
                            )}
                            <span className="flex items-center gap-1">
                              <Calendar className="w-3 h-3" />
                              Deadline khách: {new Date(alert.customerDeadline).toLocaleDateString("vi-VN")}
                            </span>
                            <span className={`font-semibold ${alert.daysLeft < 0 ? "text-red-600" : alert.daysLeft === 0 ? "text-orange-600" : "text-amber-600"}`}>
                              {alert.daysLeft < 0 ? `Trễ ${-alert.daysLeft} ngày` : alert.daysLeft === 0 ? "Hôm nay!" : `Còn ${alert.daysLeft} ngày`}
                            </span>
                          </div>
                          {/* Progress */}
                          <div className="mt-2">
                            <div className="h-1.5 bg-muted rounded-full overflow-hidden w-full max-w-48">
                              <div
                                className={`h-full rounded-full ${alert.progressPercent >= 100 ? "bg-emerald-500" : alert.progressPercent >= 60 ? "bg-blue-500" : "bg-red-400"}`}
                                style={{ width: `${Math.min(100, alert.progressPercent)}%` }}
                              />
                            </div>
                            <p className="text-xs text-muted-foreground mt-0.5">Tiến độ: {alert.progressPercent}%</p>
                          </div>
                        </div>
                        <a href={`${import.meta.env.BASE_URL}photoshop-jobs`}
                          className="flex-shrink-0 text-xs text-primary hover:underline flex items-center gap-1">
                          Xem <ChevronRight className="w-3 h-3" />
                        </a>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Notifications ───────────────────────────────────────────── */}
        {activeTab === "notifications" && (
          <div className="flex-1 overflow-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {notifications.length} thông báo · {unreadCount} chưa đọc
              </p>
              {unreadCount > 0 && (
                <button onClick={() => markAllRead.mutate()}
                  className="text-xs text-primary hover:underline font-medium">
                  Đánh dấu tất cả đã đọc
                </button>
              )}
            </div>

            {notifLoading ? (
              <div className="flex items-center justify-center h-32 text-muted-foreground">
                <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Đang tải...
              </div>
            ) : notifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
                <Bell className="w-12 h-12 mb-3 opacity-20" />
                <p className="font-medium">Chưa có thông báo</p>
              </div>
            ) : (
              <div className="space-y-2">
                {notifications.map(n => (
                  <div key={n.id}
                    className={`rounded-xl border p-3.5 bg-card cursor-pointer hover:bg-muted/30 transition-colors ${!n.isRead ? "border-primary/30 bg-primary/5" : "border-border"}`}
                    onClick={() => { if (!n.isRead) markRead.mutate(n.id); }}>
                    <div className="flex items-start gap-3">
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${n.type === "warning" ? "bg-amber-100 text-amber-600" : n.type === "error" ? "bg-red-100 text-red-600" : n.type === "success" ? "bg-emerald-100 text-emerald-600" : "bg-blue-100 text-blue-600"}`}>
                        {n.type === "warning" ? <AlertTriangle className="w-4 h-4" /> : n.type === "error" ? <AlertCircle className="w-4 h-4" /> : n.type === "success" ? <CheckCircle2 className="w-4 h-4" /> : <Bell className="w-4 h-4" />}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className={`text-sm font-medium ${!n.isRead ? "text-foreground" : "text-muted-foreground"}`}>{n.title}</p>
                          {!n.isRead && <span className="w-2 h-2 rounded-full bg-primary flex-shrink-0" />}
                        </div>
                        {n.body && <p className="text-xs text-muted-foreground mt-0.5">{n.body}</p>}
                        <p className="text-xs text-muted-foreground mt-1">{timeAgo(n.createdAt)}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Tab: Chat ────────────────────────────────────────────────────── */}
        {activeTab === "chat" && (
          <div className="flex-1 flex overflow-hidden">
            {/* Room list */}
            <div className="w-64 flex-shrink-0 border-r border-border flex flex-col bg-muted/10">
              <div className="p-3 border-b border-border flex items-center justify-between">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Phòng chat</p>
                <button onClick={() => setShowNewRoom(true)}
                  className="p-1 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary">
                  <Plus className="w-4 h-4" />
                </button>
              </div>

              {showNewRoom && (
                <div className="p-3 border-b border-border">
                  <input
                    value={newRoomName}
                    onChange={e => setNewRoomName(e.target.value)}
                    onKeyDown={e => { if (e.key === "Enter" && newRoomName.trim()) createRoom.mutate(newRoomName.trim()); }}
                    placeholder="Tên phòng..."
                    autoFocus
                    className="w-full text-sm border border-border rounded-lg px-2 py-1.5 bg-background focus:outline-none focus:ring-1 focus:ring-primary/30"
                  />
                  <div className="flex gap-1 mt-1.5">
                    <button onClick={() => newRoomName.trim() && createRoom.mutate(newRoomName.trim())}
                      className="flex-1 py-1 bg-primary text-primary-foreground rounded-lg text-xs">Tạo</button>
                    <button onClick={() => { setShowNewRoom(false); setNewRoomName(""); }}
                      className="py-1 px-2 border border-border rounded-lg text-xs">Hủy</button>
                  </div>
                </div>
              )}

              <div className="flex-1 overflow-auto">
                {rooms.length === 0 ? (
                  <div className="p-4 text-center text-xs text-muted-foreground">
                    Chưa có phòng chat.<br />Bấm + để tạo.
                  </div>
                ) : (
                  rooms.map(room => (
                    <button key={room.id}
                      onClick={() => setSelectedRoom(room)}
                      className={`w-full flex items-center gap-2.5 px-3 py-2.5 text-left hover:bg-muted transition-colors text-sm ${selectedRoom?.id === room.id ? "bg-primary/10 text-primary font-medium" : ""}`}>
                      <div className="w-7 h-7 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                        <Users className="w-3.5 h-3.5 text-primary" />
                      </div>
                      <span className="truncate">{room.name}</span>
                    </button>
                  ))
                )}
              </div>
            </div>

            {/* Chat panel */}
            {selectedRoom ? (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Room header */}
                <div className="px-4 py-3 border-b border-border flex items-center gap-2 bg-background">
                  <Users className="w-4 h-4 text-muted-foreground" />
                  <span className="font-medium text-sm">{selectedRoom.name}</span>
                </div>

                {/* Messages */}
                <div className="flex-1 overflow-auto p-4 space-y-3">
                  {messages.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
                      <MessageSquare className="w-10 h-10 mb-2 opacity-20" />
                      <p className="text-sm">Chưa có tin nhắn nào</p>
                    </div>
                  ) : (
                    messages.map(msg => {
                      const isMe = msg.senderStaffId === (viewer?.id ?? null);
                      return (
                        <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"}`}>
                          {!isMe && (
                            <div className="w-7 h-7 rounded-full bg-muted flex items-center justify-center flex-shrink-0 mr-2 mt-0.5">
                              <span className="text-xs font-bold">{msg.senderName.charAt(0)}</span>
                            </div>
                          )}
                          <div className={`max-w-xs lg:max-w-sm ${isMe ? "items-end" : "items-start"} flex flex-col`}>
                            {!isMe && (
                              <p className="text-[10px] text-muted-foreground mb-0.5 px-1">{msg.senderName}</p>
                            )}
                            <div className={`px-3 py-2 rounded-2xl text-sm ${isMe
                              ? "bg-primary text-primary-foreground rounded-tr-sm"
                              : msg.isSystem
                                ? "bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/20 dark:text-amber-300 dark:border-amber-800"
                                : "bg-muted rounded-tl-sm"
                            }`}>
                              {msg.isSystem && <Zap className="w-3 h-3 inline mr-1 text-amber-500" />}
                              {msg.content}
                            </div>
                            <p className="text-[10px] text-muted-foreground mt-0.5 px-1">{timeAgo(msg.createdAt)}</p>
                          </div>
                        </div>
                      );
                    })
                  )}
                  <div ref={messagesEndRef} />
                </div>

                {/* Message input */}
                <form onSubmit={handleSendMessage}
                  className="px-4 py-3 border-t border-border flex gap-2 bg-background">
                  <input
                    value={newMessage}
                    onChange={e => setNewMessage(e.target.value)}
                    placeholder="Nhập tin nhắn..."
                    className="flex-1 text-sm border border-border rounded-xl px-3 py-2 bg-background focus:outline-none focus:ring-2 focus:ring-primary/20"
                  />
                  <button type="submit" disabled={!newMessage.trim() || sendMessage.isPending}
                    className="p-2.5 bg-primary text-primary-foreground rounded-xl hover:bg-primary/90 disabled:opacity-50 transition-colors">
                    <Send className="w-4 h-4" />
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground">
                <MessageSquare className="w-12 h-12 mb-3 opacity-20" />
                <p className="font-medium">Chọn phòng để bắt đầu chat</p>
                <p className="text-sm mt-1">Hoặc tạo phòng mới bằng nút +</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
