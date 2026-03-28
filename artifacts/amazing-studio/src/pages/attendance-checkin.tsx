import { useEffect, useState } from "react";
import { useLocation } from "wouter";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

function fetchAuth(path: string, opts: RequestInit = {}) {
  const token = localStorage.getItem("amazingStudioToken_v2");
  return fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...((opts.headers as Record<string, string>) ?? {}),
    },
  });
}

type Status = "idle" | "gps" | "sending" | "success" | "error";

export default function AttendanceCheckinPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState("");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");

    if (!code) {
      setStatus("error");
      setMessage("Mã QR không hợp lệ");
      setDetail("Không tìm thấy mã chấm công trong URL. Hãy quét lại QR code.");
      return;
    }

    setStatus("gps");
    setMessage("Đang lấy vị trí GPS...");

    if (!navigator.geolocation) {
      setStatus("error");
      setMessage("Trình duyệt không hỗ trợ GPS");
      setDetail("Vui lòng dùng trình duyệt hỗ trợ định vị để chấm công.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        setStatus("sending");
        setMessage("Đang gửi chấm công...");
        try {
          const res = await fetchAuth("/api/attendance/check-in", {
            method: "POST",
            body: JSON.stringify({ lat, lng, qrPayload: code }),
          });
          const json = await res.json();
          if (!res.ok) {
            setStatus("error");
            setMessage(json.error ?? "Chấm công thất bại");
            setDetail(`Mã lỗi: ${res.status}`);
          } else {
            setStatus("success");
            setMessage(json.message ?? "Chấm công thành công!");
            setDetail(`Thời gian: ${json.time ?? new Date().toLocaleTimeString("vi-VN")}`);
          }
        } catch (e: unknown) {
          setStatus("error");
          setMessage("Lỗi kết nối máy chủ");
          setDetail((e as Error)?.message ?? "");
        }
      },
      (err) => {
        setStatus("error");
        if (err.code === 1) {
          setMessage("Bị từ chối quyền GPS");
          setDetail("Hãy cho phép trình duyệt truy cập vị trí và thử lại.");
        } else if (err.code === 3) {
          setMessage("Hết thời gian chờ GPS");
          setDetail("Hãy đảm bảo bạn đang bật GPS và thử lại.");
        } else {
          setMessage("Không lấy được vị trí GPS");
          setDetail(err.message ?? "");
        }
      },
      { timeout: 15000, enableHighAccuracy: true }
    );
  }, []);

  const iconMap: Record<Status, string> = {
    idle: "⏳",
    gps: "📡",
    sending: "📤",
    success: "✅",
    error: "❌",
  };

  const colorMap: Record<Status, string> = {
    idle: "text-muted-foreground",
    gps: "text-blue-600",
    sending: "text-purple-600",
    success: "text-green-600",
    error: "text-red-600",
  };

  const bgMap: Record<Status, string> = {
    idle: "bg-muted/30",
    gps: "bg-blue-50",
    sending: "bg-purple-50",
    success: "bg-green-50",
    error: "bg-red-50",
  };

  return (
    <div className="flex items-center justify-center py-16 px-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-rose-400 to-purple-600 rounded-2xl shadow-xl mb-4">
            <span className="text-2xl">📸</span>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-purple-600 bg-clip-text text-transparent">
            Amazing Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Chấm công bằng QR Code</p>
        </div>

        <div className={`rounded-2xl shadow-lg border p-8 text-center ${bgMap[status]}`}>
          <div className="text-5xl mb-4">
            {status === "gps" || status === "sending" ? (
              <span className="inline-block animate-pulse">{iconMap[status]}</span>
            ) : (
              iconMap[status]
            )}
          </div>
          <p className={`text-lg font-semibold ${colorMap[status]}`}>{message || "Đang xử lý..."}</p>
          {detail && <p className="text-sm text-muted-foreground mt-2">{detail}</p>}
        </div>

        <div className="mt-6 flex flex-col gap-3">
          {status === "success" && (
            <button
              onClick={() => setLocation("/attendance")}
              className="w-full py-3 px-4 bg-gradient-to-r from-rose-500 to-purple-600 text-white rounded-xl font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Xem lịch sử chấm công
            </button>
          )}
          {status === "error" && (
            <button
              onClick={() => window.location.reload()}
              className="w-full py-3 px-4 bg-gradient-to-r from-rose-500 to-purple-600 text-white rounded-xl font-semibold shadow-md hover:shadow-lg transition-all"
            >
              Thử lại
            </button>
          )}
          <button
            onClick={() => setLocation("/attendance")}
            className="w-full py-2.5 px-4 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-all"
          >
            Về trang chấm công
          </button>
        </div>
      </div>
    </div>
  );
}
