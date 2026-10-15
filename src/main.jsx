import React from "react";
import { createRoot } from "react-dom/client";
import { Excalidraw } from "@excalidraw/excalidraw";
import "@excalidraw/excalidraw/index.css";
import "./style.css";

function App() {
  return <main className="board"><Excalidraw name="Whiteboard" /> </main>;
}

createRoot(document.getElementById("root")).render(<App />);
