import { useState, useRef, useEffect } from "react";
import { Card, CardContent, Input, Button, Badge } from "@/components/ui";
import { Bot, Send, User, Sparkles } from "lucide-react";

export default function AiAssistantPage() {
  const [messages, setMessages] = useState([
    { role: 'ai', content: "Chào bạn, tôi là trợ lý AI của Amazing Studio. Tôi có thể giúp gì cho bạn hôm nay?" }
  ]);
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const suggestions = [
    "Doanh thu tháng này bao nhiêu?",
    "Hôm nay có bao nhiêu lịch chụp?",
    "Khách hàng nào đang nợ tiền?",
    "Váy VC001 đang ở đâu?"
  ];

  const handleSend = (text: string) => {
    if (!text.trim()) return;
    
    setMessages(prev => [...prev, { role: 'user', content: text }]);
    setInput("");
    
    // Mock AI response
    setTimeout(() => {
      let reply = "Tôi đang phân tích dữ liệu, vui lòng đợi một chút...";
      if (text.includes("Doanh thu")) reply = "Doanh thu tháng này hiện đạt 15.000.000 VNĐ. Nếu cần xem chi tiết, bạn có thể chuyển qua tab Kế toán.";
      if (text.includes("lịch chụp")) reply = "Hôm nay có 2 lịch chụp. Bạn có thể xem chi tiết trong mục Lịch.";
      if (text.includes("nợ")) reply = "Hiện tại hệ thống ghi nhận khách hàng Nguyễn Thị Lan còn nợ 10.000.000 đ từ gói VIP.";
      
      setMessages(prev => [...prev, { role: 'ai', content: reply }]);
    }, 1000);
  };

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

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
              <span className="w-2 h-2 rounded-full bg-green-500 inline-block animate-pulse"></span> Sẵn sàng hỗ trợ
            </p>
          </div>
        </div>

        <CardContent className="flex-1 p-0 flex flex-col overflow-hidden bg-gradient-to-b from-transparent to-muted/20">
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            {messages.map((msg, idx) => (
              <div key={idx} className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'ai' && (
                  <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0 mt-1">
                    <Bot className="w-4 h-4 text-primary" />
                  </div>
                )}
                <div className={`px-4 py-3 rounded-2xl max-w-[80%] ${
                  msg.role === 'user' 
                    ? 'bg-primary text-primary-foreground rounded-tr-sm shadow-md' 
                    : 'bg-white dark:bg-card border shadow-sm rounded-tl-sm text-foreground'
                }`}>
                  <p className="text-sm leading-relaxed">{msg.content}</p>
                </div>
                {msg.role === 'user' && (
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
              />
              <Button type="submit" size="icon" className="absolute right-1 top-1 h-10 w-10 rounded-lg" disabled={!input.trim()}>
                <Send className="w-5 h-5" />
              </Button>
            </form>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
