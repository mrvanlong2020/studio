import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bot, MessageSquare, Send, Sparkles } from "lucide-react";
import { Link } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function authFetch(url: string, opts: RequestInit = {}): Promise<Response> {
  const token = localStorage.getItem("amazingStudioToken_v2");
  const headers = {
    ...(opts.headers as Record<string, string> ?? {}),
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  return fetch(url, { ...opts, headers });
}

type Thread = {
  psid: string;
  lastAt: string;
  lastMessage: string;
  lastDirection: "incoming" | "outgoing";
  lastAiDecision: string | null;
  lead: { name: string; phone: string | null; status: string | null } | null;
};

type Message = {
  id: number;
  direction: "incoming" | "outgoing";
  message: string;
  sent_status: string;
  ai_decision: string | null;
  created_at: string;
};

type SuggestResponse = {
  inScope: boolean;
  reply: string;
  reason: string;
};

export default function FacebookInboxAiPage() {
  const qc = useQueryClient();
  const [selectedPsid, setSelectedPsid] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [localHint, setLocalHint] = useState("");

  const { data: threads = [] } = useQuery<Thread[]>({
    queryKey: ["fb-inbox-threads"],
    queryFn: async () => {
      const r = await authFetch(`${BASE}/api/fb-inbox/threads`);
      if (!r.ok) throw new Error("Không tải được danh sách hội thoại");
      return r.json();
    },
    refetchInterval: 5000,
  });

  const selectedThread = useMemo(() => threads.find((t) => t.psid === selectedPsid) ?? null, [threads, selectedPsid]);

  const { data: messages = [] } = useQuery<Message[]>({
    queryKey: ["fb-thread-messages", selectedPsid],
    enabled: !!selectedPsid,
    queryFn: async () => {
      const r = await authFetch(`${BASE}/api/fb-inbox/threads/${selectedPsid}/messages`);
      if (!r.ok) throw new Error("Không tải được tin nhắn");
      return r.json();
    },
    refetchInterval: 4000,
  });


  const suggestMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPsid) throw new Error("Chưa chọn hội thoại");
      const r = await authFetch(`${BASE}/api/fb-inbox/threads/${selectedPsid}/suggest`, { method: "POST" });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Không gợi ý được");
      return d as SuggestResponse;
    },
    onSuccess: (d) => {
      if (!d.inScope) {
        setLocalHint(`Ngoài phạm vi: ${d.reason || "AI đề xuất để nhân viên xử lý."}`);
        return;
      }
      setDraft(d.reply);
      setLocalHint("Đã tạo gợi ý AI, bạn có thể sửa trước khi gửi.");
    },
    onError: (e: Error) => setLocalHint(e.message),
  });

  const sendMutation = useMutation({
    mutationFn: async () => {
      if (!selectedPsid) throw new Error("Chưa chọn hội thoại");
      const text = draft.trim();
      if (!text) throw new Error("Chưa có nội dung gửi");
      const r = await authFetch(`${BASE}/api/fb-inbox/threads/${selectedPsid}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || "Gửi thất bại");
      return d;
    },
    onSuccess: () => {
      setDraft("");
      setLocalHint("Đã gửi tin nhắn (có delay 3-4 giây).");
      qc.invalidateQueries({ queryKey: ["fb-inbox-threads"] });
      qc.invalidateQueries({ queryKey: ["fb-thread-messages", selectedPsid] });
    },
    onError: (e: Error) => setLocalHint(e.message),
  });

  return (
    <div className="space-y-4">
      <div className="bg-card border border-border rounded-2xl p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-semibold">Vận hành Inbox Facebook AI</h2>
            <p className="text-sm text-muted-foreground">
              Phần cấu hình token/key đã chuyển sang trang Cài đặt để dễ bàn giao cho khách tự thiết lập.
            </p>
          </div>
          <Link href="/settings" className="inline-flex items-center rounded-xl border px-3 py-2 text-sm font-medium hover:bg-muted">
            Mở Cài đặt
          </Link>
        </div>
      </div>

      <div className="grid lg:grid-cols-[320px_1fr] gap-4">
        <div className="bg-card border border-border rounded-2xl p-3 h-[70vh] overflow-y-auto">
          <h3 className="font-semibold mb-2">Hội thoại Fanpage</h3>
          <div className="space-y-2">
            {threads.map((t) => (
              <button
                key={t.psid}
                onClick={() => setSelectedPsid(t.psid)}
                className={`w-full text-left border rounded-xl px-3 py-2 ${selectedPsid === t.psid ? "border-primary bg-primary/5" : "border-border"}`}
              >
                <p className="font-medium text-sm">{t.lead?.name ?? `Khách ${t.psid.slice(-4)}`}</p>
                <p className="text-xs text-muted-foreground truncate">{t.lastMessage}</p>
                <p className="text-[11px] text-muted-foreground mt-1">{new Date(t.lastAt).toLocaleString("vi-VN")}</p>
              </button>
            ))}
            {threads.length === 0 && <p className="text-sm text-muted-foreground">Chưa có hội thoại Facebook.</p>}
          </div>
        </div>

        <div className="bg-card border border-border rounded-2xl p-3 h-[70vh] flex flex-col">
          <div className="flex items-center justify-between pb-2 border-b border-border">
            <div className="flex items-center gap-2">
              <MessageSquare className="w-4 h-4" />
              <h3 className="font-semibold">{selectedThread ? (selectedThread.lead?.name ?? `Khách ${selectedThread.psid.slice(-4)}`) : "Chọn hội thoại"}</h3>
            </div>
            <button
              onClick={() => suggestMutation.mutate()}
              disabled={!selectedPsid || suggestMutation.isPending}
              className="inline-flex items-center gap-2 border rounded-xl px-3 py-1.5 text-sm"
            >
              <Sparkles className="w-4 h-4" />
              {suggestMutation.isPending ? "Đang gợi ý..." : "AI gợi ý"}
            </button>
          </div>

          <div className="flex-1 overflow-y-auto py-3 space-y-2">
            {messages.map((m) => (
              <div key={m.id} className={`max-w-[80%] px-3 py-2 rounded-xl text-sm ${m.direction === "incoming" ? "bg-muted" : "bg-primary/10 ml-auto"}`}>
                <p>{m.message}</p>
                <p className="text-[11px] text-muted-foreground mt-1">
                  {new Date(m.created_at).toLocaleTimeString("vi-VN")} • {m.direction === "incoming" ? "Khách" : "Studio"} • {m.sent_status}
                </p>
              </div>
            ))}
            {selectedPsid && messages.length === 0 && <p className="text-sm text-muted-foreground">Chưa có tin nhắn trong hội thoại này.</p>}
          </div>

          <div className="border-t border-border pt-3 space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Bot className="w-3.5 h-3.5" />
              AI chỉ tự trả lời trong phạm vi; ngoài phạm vi để nhân viên xử lý.
            </div>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={4}
              className="w-full border rounded-xl px-3 py-2 text-sm"
              placeholder="AI gợi ý sẽ hiện ở đây. Bạn có thể sửa trước khi gửi."
            />
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">{localHint}</p>
              <button
                onClick={() => sendMutation.mutate()}
                disabled={!selectedPsid || sendMutation.isPending}
                className="inline-flex items-center gap-2 bg-primary text-primary-foreground px-4 py-2 rounded-xl text-sm font-medium"
              >
                <Send className="w-4 h-4" />
                {sendMutation.isPending ? "Đang gửi..." : "Gửi Facebook"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
