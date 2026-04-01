import { useState, useRef, useEffect } from "react";
import { Card, CardContent, Input, Button, Badge } from "@/components/ui";
import { Bot, Send, User, Sparkles, Loader2 } from "lucide-react";
import { useStaffAuth } from "@/contexts/StaffAuthContext";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

interface Message {
  role: "ai" | "user";
  content: string;
}

export default function AiAssistantPage() {
  const { token } = useStaffAuth();
  const [messages, setMessages] = useState<Message[]>([
    { role: "ai", content: "Chào bạn, tôi là trợ lý AI của Amazing Studio. Tôi có thể giúp gì cho bạn hôm nay?" }
  ]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  const suggestions = [
    "Hôm nay có bao nhiêu lịch chụp?",
    "Khách hàng nào đang nợ tiền?",
    "Doanh thu tháng này bao nhiêu?",
    "Tuần này có những lịch chụp nào?",
  ];

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (text: string) => {
    if (!text.trim() || isStreaming) return;

    const userMsg: Message = { role: "user", content: text };
    setMessages(prev => [...prev, userMsg]);
    setInput("");
    setIsStreaming(true);

    // Build history for API (all messages including the new user message)
    const allMessages = [...messages, userMsg].map(m => ({
      role: m.role === "ai" ? "assistant" : "user",
      content: m.content,
    }));

    // Add placeholder AI message that we'll stream into
    setMessages(prev => [...prev, { role: "ai", content: "" }]);

    abortRef.current = new AbortController();

    try {
      const response = await fetch(`${BASE}/api/ai/chat`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ messages: allMessages }),
        signal: abortRef.current.signal,
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({})) as Record<string, unknown>;
        throw new Error((err.error as string) || `Lỗi ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error("Không nhận được stream từ AI");

      const decoder = new TextDecoder();
      let buffer = "";

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6).trim();
          if (!data) continue;
          try {
            const parsed = JSON.parse(data) as Record<string, unknown>;
            if (parsed.done) break;
            if (parsed.error) throw new Error(parsed.error as string);
            if (parsed.content) {
              const chunk = parsed.content as string;
              setMessages(prev => {
                const updated = [...prev];
                const last = updated[updated.length - 1];
                if (last.role === "ai") {
                  updated[updated.length - 1] = { ...last, content: last.content + chunk };
                }
                return updated;
              });
            }
          } catch { /* skip malformed chunk */ }
        }
      }
    } catch (err: unknown) {
      if ((err as Error).name === "AbortError") return;
      const errMsg = (err as Error).message || "Lỗi kết nối AI. Vui lòng thử lại.";
      setMessages(prev => {
        const updated = [...prev];
        const last = updated[updated.length - 1];
        if (last.role === "ai" && last.content === "") {
          updated[updated.length - 1] = { role: "ai", content: `❌ ${errMsg}` };
        }
        return updated;
      });
    } finally {
      setIsStreaming(false);
      abortRef.current = null;
    }
  };

  return (
    <div className="space-y-6 h-full flex flex-col max-h-[calc(100vh-120px)]">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Trợ lý AI</h1>
        <p className="text-muted-foreground mt-1">Phân tích dữ liệu và gợi ý thông minh cho studio của bạn</p>
      </div>

      <Card className="flex-1 flex flex-col overflow-hidden border-primary/20 shadow-lg shadow-primary/5">
        <div className="p-4 border-b bg-primary/5 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-md">
            <Bot className="w-6 h-6 text-primary-foreground" />
          </div>
          <div>
            <h3 className="font-bold text-primary">Amazing AI</h3>
            <p className="text-xs text-muted-foreground flex items-center gap-1">
              <span className={`w-2 h-2 rounded-full inline-block ${isStreaming ? "bg-yellow-500 animate-pulse" : "bg-green-500 animate-pulse"}`}></span>
              {isStreaming ? "Đang suy nghĩ..." : "Sẵn sàng hỗ trợ"}
            </p>
          </div>
        </div>

        <CardContent className="flex-1 p-0 flex flex-col overflow-hidden bg-gradient-to-b from-transparent to-muted/20">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-4 ${msg.role === "user" ? "justify-end" : "justify-start"}`}>
                {msg.role === "ai" && (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className={`px-4 py-3 rounded-2xl max-w-[80%] ${
                  msg.role === "user"
                    ? "bg-primary text-primary-foreground rounded-tr-sm shadow-md"
                    : "bg-white dark:bg-card border shadow-sm rounded-tl-sm text-foreground"
                }`}>
                  {msg.role === "ai" && msg.content === "" ? (
                    <span className="flex items-center gap-2 text-sm text-muted-foreground">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" /> AI đang gõ...
                    </span>
                  ) : (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                  )}
                </div>
                {msg.role === "user" && (
                  <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center flex-shrink-0 mt-1">
                    <User className="w-4 h-4 text-secondary-foreground" />
                  </div>
                )}
              </div>
            ))}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-4 bg-background border-t">
            <div className="flex gap-2 overflow-x-auto pb-3 no-scrollbar">
              {suggestions.map((sug, idx) => (
                <Badge
                  key={idx}
                  variant="outline"
                  className="cursor-pointer hover:bg-primary/10 hover:text-primary whitespace-nowrap px-3 py-1.5 transition-colors"
                  onClick={() => handleSend(sug)}
                >
                  <Sparkles className="w-3 h-3 mr-1 text-primary" /> {sug}
                </Badge>
              ))}
            </div>
            <form
              className="flex gap-2 relative"
              onSubmit={e => { e.preventDefault(); handleSend(input); }}
            >
              <Input
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Nhập câu hỏi của bạn cho AI..."
                className="pr-12 h-12 rounded-xl text-base shadow-sm"
                disabled={isStreaming}
              />
              <Button type="submit" size="icon" className="absolute right-1 top-1 h-10 w-10 rounded-lg" disabled={!input.trim() || isStreaming}>
                {isStreaming ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-5 h-5" />}
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
