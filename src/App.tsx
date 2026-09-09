// ============================================================
// アプリ本体：ハッシュベースの画面切り替えと現在地の管理
//   #/                    ホーム（目的地選択）
//   #/scan                QRスキャン
//   #/at/<nodeId>         QR読み取り後の着地点（現在地を確定）
//   #/go/<from>/<to>      道案内（ARカメラ／手順リスト）
//   #/plan                平面図プレビュー（管理・検証用）
//
// 現在地と「選択中の目的地」は sessionStorage に持つ。
// リロードやQR読み取りによる画面遷移をまたいでも消えないようにするため。
// ============================================================

import { useEffect, useState } from "react";
import { NODES } from "./data/campus";
import HomeView from "./views/HomeView";
import ScanView from "./views/ScanView";
import GuideView from "./views/GuideView";
import PlanView from "./views/PlanView";

type Route =
  | { view: "home" }
  | { view: "scan" }
  | { view: "at"; id: string }
  | { view: "go"; from: string; to: string }
  | { view: "plan" };

const KEY_CURRENT = "arnav.current";
const KEY_PENDING = "arnav.pendingDest";

function parseHash(hash: string): Route {
  const parts = hash
    .replace(/^#\/?/, "")
    .split("/")
    .map(decodeURIComponent);
  switch (parts[0]) {
    case "scan":
      return { view: "scan" };
    case "at":
      return parts[1] ? { view: "at", id: parts[1] } : { view: "home" };
    case "go":
      return parts[1] && parts[2]
        ? { view: "go", from: parts[1], to: parts[2] }
        : { view: "home" };
    case "plan":
      return { view: "plan" };
    default:
      return { view: "home" };
  }
}

function go(hash: string) {
  location.hash = hash;
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseHash(location.hash));
  const [currentId, setCurrentId] = useState<string | null>(() =>
    sessionStorage.getItem(KEY_CURRENT),
  );
  const [pendingId, setPendingId] = useState<string | null>(() =>
    sessionStorage.getItem(KEY_PENDING),
  );

  useEffect(() => {
    const onHash = () => setRoute(parseHash(location.hash));
    window.addEventListener("hashchange", onHash);
    return () => window.removeEventListener("hashchange", onHash);
  }, []);

  // QR着地：現在地を確定し、行き先が決まっていればそのまま案内へ
  useEffect(() => {
    if (route.view !== "at") return;
    if (!NODES.has(route.id)) return;
    sessionStorage.setItem(KEY_CURRENT, route.id);
    setCurrentId(route.id);

    const pending = sessionStorage.getItem(KEY_PENDING);
    if (pending && NODES.has(pending) && pending !== route.id) {
      sessionStorage.removeItem(KEY_PENDING);
      setPendingId(null);
      go(`#/go/${encodeURIComponent(route.id)}/${encodeURIComponent(pending)}`);
    }
  }, [route]);

  /** 行き先を選んだ。現在地が未確定ならQRスキャンへ回す */
  const selectDest = (nodeId: string) => {
    if (currentId && NODES.has(currentId)) {
      go(`#/go/${encodeURIComponent(currentId)}/${encodeURIComponent(nodeId)}`);
      return;
    }
    sessionStorage.setItem(KEY_PENDING, nodeId);
    setPendingId(nodeId);
    go("#/scan");
  };

  const setCurrent = (nodeId: string) => {
    go(`#/at/${encodeURIComponent(nodeId)}`);
  };

  const clearCurrent = () => {
    sessionStorage.removeItem(KEY_CURRENT);
    setCurrentId(null);
  };

  const clearPending = () => {
    sessionStorage.removeItem(KEY_PENDING);
    setPendingId(null);
  };

  let body: React.ReactNode;

  switch (route.view) {
    case "scan":
      body = (
        <ScanView
          onDetected={(id) => go(`#/at/${encodeURIComponent(id)}`)}
          onClose={() => {
            clearPending();
            go("#/");
          }}
          pendingLabel={pendingId ? NODES.get(pendingId)?.label ?? null : null}
        />
      );
      break;

    case "at": {
      const node = NODES.get(route.id);
      body = node ? (
        <HomeView
          currentId={node.id}
          onSelectDest={selectDest}
          onScan={() => go("#/scan")}
          onSetCurrent={setCurrent}
          onClearCurrent={clearCurrent}
        />
      ) : (
        <div className="card">
          <p className="lead">
            読み取ったQRコードに対応する地点が見つかりませんでした。
            掲示されているQRコードをもう一度読み取ってください。
          </p>
          <button className="btn btn-primary" onClick={() => go("#/scan")}>
            QRを読み取る
          </button>
        </div>
      );
      break;
    }

    case "go":
      body = (
        <GuideView
          fromId={route.from}
          toId={route.to}
          onFinish={() => go("#/")}
          onRelocate={(id) =>
            go(`#/go/${encodeURIComponent(id)}/${encodeURIComponent(route.to)}`)
          }
        />
      );
      break;

    case "plan":
      body = <PlanView />;
      break;

    default:
      body = (
        <HomeView
          currentId={currentId}
          onSelectDest={selectDest}
          onScan={() => go("#/scan")}
          onSetCurrent={setCurrent}
          onClearCurrent={clearCurrent}
        />
      );
  }

  return (
    <div className="app">
      <header className="app-header">
        {route.view !== "home" ? (
          <button
            className="back-btn"
            onClick={() => go("#/")}
            aria-label="ホームへ戻る"
          >
            ←
          </button>
        ) : (
          <span style={{ width: 30 }} />
        )}
        <div className="app-title">
          <h1>校内案内マップ</h1>
          <span>延岡工業高等学校</span>
        </div>
      </header>
      <main className="app-main">{body}</main>
    </div>
  );
}
