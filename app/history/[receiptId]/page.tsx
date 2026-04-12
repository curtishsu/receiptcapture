import type { ReactElement } from "react";
import { requireUser } from "@/lib/auth";
import { getReceiptDetail } from "@/lib/firestore-db";
import { ReceiptDetailEditor } from "@/components/receipt-detail-editor";

export default async function ReceiptDetailPage({
  params
}: {
  params: Promise<{ receiptId: string }>;
}): Promise<ReactElement> {
  const user = await requireUser();
  const { receiptId } = await params;

  if (!user) {
    return (
      <main className="page-shell">
        <div className="app-card">
          <div className="content">
            <div className="empty-state">Sign in on the home page to view receipt details.</div>
          </div>
        </div>
      </main>
    );
  }

  const detail = await getReceiptDetail(user.id, receiptId);
  if (!detail) {
    return (
      <main className="page-shell">
        <div className="app-card">
          <div className="content stack">
            <div className="empty-state">Receipt not found.</div>
          </div>
        </div>
      </main>
    );
  }

  return <ReceiptDetailEditor initialReceipt={detail.receipt} initialItems={detail.items} />;
}
