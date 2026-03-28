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

type Status = "loading" | "ready" | "sending" | "success" | "error";

export default function AttendanceCheckinPage() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState("");
  const [checkedIn, setCheckedIn] = useState(false);
  const [lat, setLat] = useState<number | null>(null);
  const [lng, setLng] = useState<number | null>(null);

  // Page ready on mount
  useEffect(() => {
    setStatus("ready");
  }, []);

  const getGpsAndSubmit = async (type: "check_in" | "check_out") => {
    setStatus("sending");
    const endpoint = type === "check_in" ? "/api/attendance/check-in" : "/api/attendance/check-out";

    if (!navigator.geolocation) {
      setStatus("error");
      setMessage("Trình duyệt không hỗ trợ GPS");
      setDetail("Vui lòng dùng trình duyệt hỗ trợ định vị để chấm công.");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const gpsLat = pos.coords.latitude;
        const gpsLng = pos.coords.longitude;
        setLat(gpsLat);
        setLng(gpsLng);

        try {
          const res = await fetchAuth(endpoint, {
            method: "POST",
            body: JSON.stringify({ lat: gpsLat, lng: gpsLng }),
          });
          const json = await res.json();

          if (!res.ok) {
            // Check if already checked in
            if (type === "check_in" && json.error?.includes("Bạn đã check-in")) {
              setStatus("ready");
              setCheckedIn(true);
              setMessage("Bạn đã chấm vào rồi");
              setDetail("Có thể chấm ra bây giờ");
              return;
            }
            setStatus("error");
            setMessage(json.error ?? `${type === "check_in" ? "Chấm vào" : "Chấm ra"} thất bại`);
            setDetail(`(Lỗi ${res.status})`);
          } else {
            setStatus("success");
            setMessage(json.message ?? `${type === "check_in" ? "Chấm vào" : "Chấm ra"} thành công!`);
            setDetail(`Thời gian: ${json.time ?? new Date().toLocaleTimeString("vi-VN")}`);
            if (type === "check_in") setCheckedIn(true);
            else setCheckedIn(false);
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
          setDetail("Hãy cho phép trình duyệt truy cập vị trị và thử lại.");
        } else if (err.code === 3) {
          setMessage("Hết thời gian chờ GPS");
          setDetail("Hãy đảm bảo bạn đang bật GPS và thử lại.");
        } else {
          setMessage("Không lấy được vị trị GPS");
          setDetail(err.message ?? "");
        }
      },
      { timeout: 15000, enableHighAccuracy: true }
    );
  };

  return (
    <div className="flex items-center justify-center py-16 px-4 min-h-screen">
      <div className="w-full max-w-sm">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-br from-rose-400 to-purple-600 rounded-2xl shadow-xl mb-4">
            <span className="text-2xl">📸</span>
          </div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-rose-600 to-purple-600 bg-clip-text text-transparent">
            Amazing Studio
          </h1>
          <p className="text-sm text-muted-foreground mt-1">Chấm công</p>
        </div>

        {status === "loading" ? (
          <div className="rounded-2xl shadow-lg border p-8 text-center bg-muted/30">
            <div className="text-4xl mb-4 animate-pulse">⏳</div>
            <p className="text-lg font-semibold text-muted-foreground">Đang tải...</p>
          </div>
        ) : status === "ready" ? (
          <>
            <div className="rounded-2xl shadow-lg border p-8 text-center mb-6 bg-blue-50">
              <div className="text-4xl mb-3">
                {checkedIn ? "✅" : "👤"}
              </div>
              <p className="text-lg font-semibold text-blue-700">
                {checkedIn ? "Đã chấm vào hôm nay" : "Chưa chấm vào hôm nay"}
              </p>
              <p className="text-sm text-blue-600 mt-2">
                GPS: {lat && lng ? `${lat.toFixed(4)}, ${lng.toFixed(4)}` : "Chưa lấy"}
              </p>
            </div>

            <button
              onClick={() => getGpsAndSubmit(checkedIn ? "check_out" : "check_in")}
              className="w-full py-3 px-4 mb-3 bg-gradient-to-r from-rose-500 to-purple-600 text-white rounded-xl font-semibold shadow-md hover:shadow-lg transition-all"
            >
              {checkedIn ? "Chấm ra" : "Chấm vào"}
            </button>

            <button
              onClick={() => setLocation("/attendance")}
              className="w-full py-2.5 px-4 border border-border rounded-xl text-sm font-medium text-muted-foreground hover:bg-muted/50 transition-all"
            >
              Về trang chấm công
            </button>
          </>
        ) : (
          <>
            <div
              className={`rounded-2xl shadow-lg border p-8 text-center ${
                status === "success"
                  ? "bg-green-50"
                  : status === "sending"
                    ? "bg-purple-50"
                    : "bg-red-50"
              }`}
            >
              <div className="text-5xl mb-4">
                {status === "sending" ? (
                  <span className="inline-block animate-pulse">📤</span>
                ) : status === "success" ? (
                  "✅"
                ) : (
                  "❌"
                )}
              </div>
              <p
                className={`text-lg font-semibold ${
                  status === "success"
                    ? "text-green-700"
                    : status === "sending"
                      ? "text-purple-700"
                      : "text-red-700"
                }`}
              >
                {message || "Đang xử lý..."}
              </p>
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
                  onClick={() => {
                    setStatus("ready");
                    setMessage("");
                    setDetail("");
                  }}
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
          </>
        )}
      </div>
    </div>
  );
}
