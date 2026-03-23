import { Link } from "wouter";
import { Layout } from "@/components/layout";
import { Button } from "@/components/ui-elements";
import { Home } from "lucide-react";

export default function NotFound() {
  return (
    <Layout>
      <div className="flex flex-col items-center justify-center min-h-[70vh] text-center">
        <h1 className="text-9xl font-serif font-bold text-primary/20">404</h1>
        <h2 className="text-2xl font-bold mt-4">Không tìm thấy trang</h2>
        <p className="text-muted-foreground mt-2 mb-8 max-w-md">
          Xin lỗi, trang bạn đang tìm kiếm không tồn tại hoặc đã bị di chuyển.
        </p>
        <Link href="/">
          <Button className="gap-2">
            <Home className="w-4 h-4" /> Về trang chủ
          </Button>
        </Link>
      </div>
    </Layout>
  );
}
