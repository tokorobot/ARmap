// ============================================================
// QRコード印刷ページ（管理用）
// 貼る場所ごとのQRカードを一覧表示し、ブラウザの印刷機能で出力する
// ============================================================

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { QR_NODES } from "../data/graph";

/** ノードIDから、本番で読まれるURL（このアプリ自身のURL + #/qr/…）を作る */
function qrUrl(nodeId: string): string {
  return `${location.origin}${location.pathname}${location.search}#/qr/${encodeURIComponent(nodeId)}`;
}

export default function QrPrintView() {
  const [images, setImages] = useState<Record<string, string>>({});

  useEffect(() => {
    let alive = true;
    (async () => {
      const result: Record<string, string> = {};
      for (const n of QR_NODES) {
        result[n.id] = await QRCode.toDataURL(qrUrl(n.id), { width: 240, margin: 1 });
      }
      if (alive) setImages(result);
    })();
    return () => {
      alive = false;
    };
  }, []);

  return (
    <div className="print-view">
      <div className="card no-print">
        <p>
          全QRポイント（{QR_NODES.length}ヶ所）のカードです。印刷して各場所に掲示してください。
          QRのURLは表示中のアドレスを元に生成されるため、<strong>本番公開先のURLで開いてから印刷</strong>
          してください。
        </p>
        <button className="btn btn-primary" onClick={() => window.print()}>
          🖨 印刷する
        </button>
      </div>

      <div className="qr-grid">
        {QR_NODES.map((n) => (
          <div key={n.id} className="qr-card">
            <h3>校内ナビ</h3>
            <p className="qr-place">{n.qr!.place}</p>
            {images[n.id] ? (
              <img src={images[n.id]} alt={`${n.label}のQRコード`} />
            ) : (
              <div className="qr-loading">生成中…</div>
            )}
            <p className="qr-caption">スマホのカメラで読み取ると道案内が始まります</p>
            <p className="qr-id">{n.id}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
