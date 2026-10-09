import React from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import App from "./App.jsx";
addEventListener("mousemove", (e) => {
  document.getElementById("glow").style.transform =
    `translate(${e.clientX}px,${e.clientY}px)`;
  const c = e.target.closest?.("[data-tilt]");
  if (c) {
    const r = c.getBoundingClientRect();
    c.style.setProperty(
      "--ry",
      ((e.clientX - r.left) / r.width - 0.5) * 10 + "deg",
    );
    c.style.setProperty(
      "--rx",
      -((e.clientY - r.top) / r.height - 0.5) * 10 + "deg",
    );
  }
});
addEventListener("click", (e) => {
  const b = e.target.closest?.(".btn");
  if (!b) return;
  const r = document.createElement("span"),
    q = b.getBoundingClientRect();
  r.className = "rp";
  r.style.cssText = `width:30px;height:30px;left:${e.clientX - q.left - 15}px;top:${e.clientY - q.top - 15}px`;
  b.append(r);
  setTimeout(() => r.remove(), 600);
});
createRoot(document.getElementById("root")).render(<App />);
