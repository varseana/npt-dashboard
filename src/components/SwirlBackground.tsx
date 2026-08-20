import { Dithering } from "@paper-design/shaders-react";

// fondo animado de swirl con dithering (paper-design shaders, WebGL). monocromatico y tema-aware:
// light = tinta NEGRA sobre fondo BLANCO; dark = tinta BLANCA sobre fondo NEGRO. contraste full
// para que se lea como el sistema B&N del dashboard. va detras de la carta de login (z-index 0).
export default function SwirlBackground({ dark }: { dark: boolean }) {
  const colorBack = dark ? "#000000" : "#ffffff";
  const colorFront = dark ? "#ffffff" : "#000000";
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 0, overflow: "hidden" }} aria-hidden="true">
      <Dithering
        style={{ width: "100%", height: "100%" }}
        colorBack={colorBack}
        colorFront={colorFront}
        shape="swirl"
        type="4x4"
        size={4}
        speed={0.7}
      />
    </div>
  );
}
