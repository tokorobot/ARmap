// ============================================================
// 配置エディタ（管理用 #/edit）
// 地図プレビューを見ながら、部屋の並び・階段・渡り廊下・
// QRの向き・方位補正を編集する。
//
// 保存先はこの端末の localStorage（＝その端末のナビに即反映）。
// 全端末に反映するには「JSONを書き出す」の内容で
// src/data/layout.json を置き換えて再デプロイする。
// ============================================================

import { useMemo, useState } from "react";
import {
  LAYOUT_LS_KEY,
  buildGraph,
  loadLayout,
  type BridgeAt,
  type LayoutConfig,
  type StairPos,
} from "../data/graph";
import FloorMap from "./FloorMap";

function clone<T>(v: T): T {
  return JSON.parse(JSON.stringify(v)) as T;
}

const STAIR_LABELS: { pos: StairPos; label: string }[] = [
  { pos: "north", label: "上端（図の上）" },
  { pos: "center", label: "中央" },
  { pos: "south", label: "下端（図の下）" },
];

// 方位のクイック入力（実方位）
const FACING_PRESETS = [
  { label: "北", deg: 0 },
  { label: "東", deg: 90 },
  { label: "南", deg: 180 },
  { label: "西", deg: 270 },
];

export default function EditorView() {
  const [draft, setDraft] = useState<LayoutConfig>(() => clone(loadLayout()));
  const [selB, setSelB] = useState(draft.buildings[0]?.id ?? "");
  const [selF, setSelF] = useState(1);
  const [newRoom, setNewRoom] = useState("");
  const [importText, setImportText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  const graph = useMemo(() => {
    try {
      return buildGraph(draft);
    } catch {
      return null;
    }
  }, [draft]);

  const building = draft.buildings.find((b) => b.id === selB) ?? draft.buildings[0];
  const floors = Object.keys(building.roomsByFloor)
    .map(Number)
    .sort((a, z) => a - z);
  const floor = floors.includes(selF) ? selF : floors[0];
  const rooms = building.roomsByFloor[String(floor)] ?? [];

  /** draftを複製して書き換えるヘルパー */
  const update = (fn: (d: LayoutConfig) => void) => {
    setDraft((d) => {
      const nd = clone(d);
      fn(nd);
      return nd;
    });
    setMsg(null);
  };

  const curRooms = (d: LayoutConfig) =>
    d.buildings.find((b) => b.id === building.id)!.roomsByFloor[String(floor)];

  const moveRoom = (i: number, dir: -1 | 1) =>
    update((d) => {
      const arr = curRooms(d);
      const j = i + dir;
      if (j < 0 || j >= arr.length) return;
      [arr[i], arr[j]] = [arr[j], arr[i]];
    });

  const renameRoom = (i: number, name: string) =>
    update((d) => {
      curRooms(d)[i] = name;
    });

  const deleteRoom = (i: number) =>
    update((d) => {
      curRooms(d).splice(i, 1);
    });

  const addRoom = () => {
    const name = newRoom.trim();
    if (!name) return;
    update((d) => {
      curRooms(d).push(name);
    });
    setNewRoom("");
  };

  const toggleStair = (pos: StairPos) =>
    update((d) => {
      const b = d.buildings.find((x) => x.id === building.id)!;
      b.stairs = b.stairs.includes(pos) ? b.stairs.filter((p) => p !== pos) : [...b.stairs, pos];
    });

  const setFacing = (nodeId: string, deg: number) =>
    update((d) => {
      const v = ((Math.round(deg) % 360) + 360) % 360;
      const qp = d.qrPoints.find((q) => q.nodeId === nodeId);
      if (qp) qp.facing = v;
      else d.stairFacings[nodeId] = v;
    });

  // ---------- 保存・書き出し ----------

  const save = () => {
    localStorage.setItem(LAYOUT_LS_KEY, JSON.stringify(draft));
    // グラフはモジュール読み込み時に構築されるため、リロードして反映する
    location.hash = "#/";
    location.reload();
  };

  const reset = () => {
    if (!confirm("この端末での変更を破棄して、公開されている既定の配置に戻しますか？")) return;
    localStorage.removeItem(LAYOUT_LS_KEY);
    location.reload();
  };

  const exportJson = async () => {
    const text = JSON.stringify(draft, null, 2);
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      // クリップボード不可ならダウンロードのみ
    }
    const blob = new Blob([text], { type: "application/json" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "layout.json";
    a.click();
    URL.revokeObjectURL(a.href);
    setMsg(copied ? "コピー＆ダウンロードしました。layout.json を置き換えて再デプロイすると全端末に反映されます" : "layout.json をダウンロードしました");
  };

  const importJson = () => {
    try {
      const cfg = JSON.parse(importText) as LayoutConfig;
      if (!cfg || !Array.isArray(cfg.buildings) || !Array.isArray(cfg.bridges)) {
        throw new Error("bad");
      }
      setDraft(cfg);
      setImportText("");
      setMsg("読み込みました（まだ保存されていません）");
    } catch {
      setMsg("JSONの形式が正しくありません");
    }
  };

  return (
    <div className="editor">
      <div className="card">
        <p className="note">
          変更は下のプレビューに即反映されます。「保存して反映」で<strong>この端末の</strong>ナビに適用。
          全員に配るには「JSONを書き出す」→ layout.json を置き換えて再デプロイしてください。
          部屋名を変えると、その部屋の印刷済みQRは無効になります。
        </p>
        {msg && <p className="editor-msg">{msg}</p>}
        <div className="editor-actions">
          <button className="btn btn-primary" onClick={save}>
            💾 保存して反映
          </button>
          <button className="btn btn-ghost" onClick={exportJson}>
            📤 JSONを書き出す
          </button>
          <button className="btn btn-ghost" onClick={reset}>
            ↩ 既定に戻す
          </button>
        </div>
      </div>

      {/* 棟・階の選択 */}
      <div className="tab-row">
        {draft.buildings.map((b) => (
          <button
            key={b.id}
            className={`tab ${b.id === building.id ? "active" : ""}`}
            onClick={() => setSelB(b.id)}
          >
            {b.name}
          </button>
        ))}
      </div>
      <div className="tab-row">
        {floors.map((f) => (
          <button key={f} className={`tab ${f === floor ? "active" : ""}`} onClick={() => setSelF(f)}>
            {f}F
          </button>
        ))}
      </div>

      {/* プレビュー */}
      {graph ? (
        <FloorMap floor={floor} pathIds={[]} highlightIds={[]} graph={graph} />
      ) : (
        <div className="card">
          <p>プレビューを生成できません（データを確認してください）</p>
        </div>
      )}

      {/* 部屋の並び */}
      <section className="card">
        <h3 className="editor-h">
          {building.name} {floor}F の部屋（図の上 → 下の順）
        </h3>
        {rooms.map((name, i) => (
          <div key={`${i}-${name}`} className="room-row">
            <input
              className="room-input"
              defaultValue={name}
              onBlur={(e) => {
                const v = e.target.value.trim();
                if (v && v !== name) renameRoom(i, v);
              }}
            />
            <button className="icon-btn" disabled={i === 0} onClick={() => moveRoom(i, -1)} aria-label="上へ">
              ↑
            </button>
            <button
              className="icon-btn"
              disabled={i === rooms.length - 1}
              onClick={() => moveRoom(i, 1)}
              aria-label="下へ"
            >
              ↓
            </button>
            <button className="icon-btn danger" onClick={() => deleteRoom(i)} aria-label="削除">
              ✕
            </button>
          </div>
        ))}
        <div className="room-row">
          <input
            className="room-input"
            placeholder="部屋を追加…"
            value={newRoom}
            onChange={(e) => setNewRoom(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addRoom()}
          />
          <button className="btn btn-ghost btn-sm" onClick={addRoom}>
            追加
          </button>
        </div>
      </section>

      {/* 階段 */}
      <section className="card">
        <h3 className="editor-h">{building.name} の階段の位置（全階共通）</h3>
        <div className="check-row">
          {STAIR_LABELS.map(({ pos, label }) => (
            <label key={pos} className="check-item">
              <input type="checkbox" checked={building.stairs.includes(pos)} onChange={() => toggleStair(pos)} />
              {label}
            </label>
          ))}
        </div>
      </section>

      {/* 渡り廊下 */}
      <section className="card">
        <h3 className="editor-h">渡り廊下</h3>
        {draft.bridges.map((br, bi) => {
          const w = draft.buildings.find((b) => b.id === br.west);
          const e = draft.buildings.find((b) => b.id === br.east);
          if (!w || !e) return null;
          const shared = Object.keys(w.roomsByFloor)
            .map(Number)
            .filter((f) => Object.keys(e.roomsByFloor).map(Number).includes(f))
            .sort((a, z) => a - z);
          return (
            <div key={bi} className="bridge-row">
              <strong>
                {w.name} ↔ {e.name}
              </strong>
              <div className="check-row">
                {shared.map((f) => (
                  <label key={f} className="check-item">
                    <input
                      type="checkbox"
                      checked={br.floors.includes(f)}
                      onChange={() =>
                        update((d) => {
                          const target = d.bridges[bi];
                          target.floors = target.floors.includes(f)
                            ? target.floors.filter((x) => x !== f)
                            : [...target.floors, f].sort((a, z) => a - z);
                        })
                      }
                    />
                    {f}F
                  </label>
                ))}
                <select
                  className="editor-select"
                  value={br.at}
                  onChange={(e2) =>
                    update((d) => {
                      d.bridges[bi].at = e2.target.value as BridgeAt;
                    })
                  }
                >
                  <option value="north">上端（図の上）</option>
                  <option value="south">下端（図の下）</option>
                </select>
              </div>
            </div>
          );
        })}
      </section>

      {/* 方位補正 */}
      <section className="card">
        <h3 className="editor-h">方位補正（コンパス矢印用）</h3>
        <p className="note">
          「模式図の上」が実際に向いている方位角（北=0°・東=90°・時計回り）。Googleマップの実測で約100°（ほぼ東）です。
        </p>
        <input
          type="number"
          className="editor-num"
          value={draft.rotationDeg}
          onChange={(e) =>
            update((d) => {
              d.rotationDeg = Number(e.target.value) || 0;
            })
          }
        />
      </section>

      {/* QRの向き */}
      <section className="card">
        <h3 className="editor-h">QRの向き（QRを正面に見たとき自分が向く実方位）</h3>
        <p className="note">現地でスマホのコンパスアプリを使い、QRに正対したときの方位を実測して入力してください。</p>
        {(graph?.qrNodes ?? []).map((n) => (
          <div key={n.id} className="facing-row">
            <span className="facing-label">{n.qr!.place}</span>
            <input
              type="number"
              className="editor-num"
              value={n.qr!.facing}
              onChange={(e) => setFacing(n.id, Number(e.target.value) || 0)}
            />
            <span className="facing-presets">
              {FACING_PRESETS.map((p) => (
                <button key={p.deg} className="icon-btn" onClick={() => setFacing(n.id, p.deg)}>
                  {p.label}
                </button>
              ))}
            </span>
          </div>
        ))}
      </section>

      {/* JSON取り込み */}
      <section className="card">
        <h3 className="editor-h">JSONの取り込み</h3>
        <textarea
          className="editor-ta"
          rows={4}
          placeholder="書き出したJSONを貼り付けて「読み込む」"
          value={importText}
          onChange={(e) => setImportText(e.target.value)}
        />
        <button className="btn btn-ghost btn-sm" onClick={importJson} disabled={!importText.trim()}>
          読み込む
        </button>
      </section>
    </div>
  );
}
