import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";

// StrictMode はカメラ初期化の二重実行を避けるため使用しない（前作と同方針）
createRoot(document.getElementById("root")!).render(<App />);
