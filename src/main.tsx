import * as React from "react";
import * as ReactDOM from "react-dom/client";
import App from "./App";
import { palette, font } from "./theme";

document.body.style.margin = "0";
document.body.style.background = palette.bg;
document.body.style.color = palette.text;
document.body.style.fontFamily = font;

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
