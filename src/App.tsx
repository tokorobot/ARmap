// ============================================================
// アプリ本体: ハッシュベースの画面切り替えと現在地の管理
//   #/            ホーム（目的地選択）
//   #/scan        QRスキャン
//   #/qr/<id>     QR読み取り後の着地点（現在地を確定）
//   #/guide/<from>/<to>  道案内
//   #/print       QR印刷ページ（管理用）
// ============================================================

import { useEffect, useState } from "react";
import { NODES, type NavNode } from "./data/graph";
import HomeView from "./components/HomeView";
import ARView from "./components/ARView";
import GuideView from "./components/GuideView";
import QrPrintView from "./components/QrPrintView";
import DestinationList from "./components/DestinationList";

type Route =
  | { view: "home" }
  | { view: "scan" }
  | { view: "qr"; id: string }
  | { view: "guide"; from: string; to: string }
  | { view: "print" };

function parseHash(hash: string): Route {
  const parts = hash.replace(/^#\/?/, "").split("/").map(decodeURIComponent);
  switch (parts[0]) {
    case "scan":
      return { view: "scan" };
    case "qr":
      return parts[1] ? { view: "qr", id: parts[1] } : { view: "home" };
    case "guide":
      return parts[1] && parts[2]
        ? { view: "guide", from: parts[1], to: parts[2] }
        : { view: "home" };
    case "print":
      return { view: "print" };
    default:
      return { view: "home" };
  }
}

function go(hash: string) {
  location.hash = hash;
}

// 現在地・選択済み目的地はリロードしても消えないよう sessionStorage に持つ
const KEY_CURRENT = "nav.current";
const KEY_PENDING = "nav.pendingDest";

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));

  useEffect(() => {
    const onHash = () => setRoute(parseHash(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // QR着地: 現在地を保存し、目的地が決まっていれば即案内へ
  useEffect(() => {
    if (route.view !== "qr") return;
    if (!NODES.has(route.id)) return;
    sessionStorage.setItem(KEY_CURRENT, route.id);
    const pending = sessionStorage.getItem(KEY_PENDING);
    if (pending && NODES.has(pending)) {
      sessionStorage.removeItem(KEY_PENDING);
      go(`#/guide/${encodeURIComponent(route.id)}/${encodeURIComponent(pending)}`);
    }
  }, [route]);

  const currentId = sessionStorage.getItem(KEY_CURRENT);

  const selectDest = (n: NavNode) => {
    const cur = sessionStorage.getItem(KEY_CURRENT);
    if (cur && NODES.has(cur)) {
      go(`#/guide/${encodeURIComponent(cur)}/${encodeURIComponent(n.id)}`);
    } else {
      // 現在地未確定 → 目的地を覚えてスキャンへ
      sessionStorage.setItem(KEY_PENDING, n.id);
      go("#/scan");
    }
  };

  // AR中に別のQRを読んだ → 現在地を更新して同じ目的地へ案内し直す
  const relocate = (newFromId: string, destId: string) => {
    sessionStorage.setItem(KEY_CURRENT, newFromId);
    go(`#/guide/${encodeURIComponent(newFromId)}/${encodeURIComponent(destId)}`);
  };

  let body: React.ReactNode;
  switch (route.view) {
    case "scan": {
      const pending = sessionStorage.getItem(KEY_PENDING);
      body = (
        <ARView
          mode="locate"
          onQrDetected={(id) => go(`#/qr/${encodeURIComponent(id)}`)}
          onClose={() => go("#/")}
        >
          <div className="ar-card">
            {pending && NODES.has(pending) && (
              <p className="step-detail">
                目的地「{NODES.get(pending)!.label}」を選択中。QRを読むと案内を開始します
              </p>
            )}
            <p className="step-text">教室や階段のQRコードにかざしてください</p>
          </div>
        </ARView>
      );
      break;
    }
    case "qr": {
      const node = NODES.get(route.id);
      if (!node) {
        body = (
          <div className="card">
            <p>不明なQRコードです。もう一度読み取ってください。</p>
            <button className="btn btn-primary" onClick={() => go("#/scan")}>
              QRを読み取る
            </button>
          </div>
        );
      } else {
        body = (
          <>
            <div className="card">
              <p className="current-chip">
                📍 現在地: <strong>{node.label}</strong>（{node.buildingName} {node.floor}F）
              </p>
              <p className="home-lead">目的地を選んでください</p>
            </div>
            <DestinationList onSelect={selectDest} />
          </>
        );
      }
      break;
    }
    case "guide":
      body = (
        <GuideView
          fromId={route.from}
          toId={route.to}
          onRelocate={(id) => relocate(id, route.to)}
          onFinish={() => go("#/")}
        />
      );
      break;
    case "print":
      body = <QrPrintView />;
      break;
    default:
      body = (
        <HomeView
          currentId={currentId}
          onScan={() => go("#/scan")}
          onSelectDest={selectDest}
          onDemoStart={() => {
            sessionStorage.setItem(KEY_CURRENT, "b1-1f-事務室");
            go("#/qr/" + encodeURIComponent("b1-1f-事務室"));
          }}
        />
      );
  }

  return (
    <div className="app">
      <header className="app-header no-print">
        {route.view !== "home" ? (
          <button className="back-btn" onClick={() => go("#/")} aria-label="ホームへ戻る">
            ←
          </button>
        ) : (
          <span className="back-spacer" />
        )}
        <div className="app-title">
          <h1>校内ナビ</h1>
          <span>延岡工業高校</span>
        </div>
      </header>
      <main className="app-main">{body}</main>
    </div>
  );
}
