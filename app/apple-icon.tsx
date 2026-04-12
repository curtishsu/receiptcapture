import { ImageResponse } from "next/og";

export const size = {
  width: 180,
  height: 180
};

export const contentType = "image/png";

export default function AppleIcon(): ImageResponse {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f7f1e6"
        }}
      >
        <div
          style={{
            width: 136,
            height: 136,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: 40,
            background: "linear-gradient(135deg, #0f766e 0%, #115e59 100%)",
            color: "#fffdf9",
            fontSize: 62,
            fontWeight: 800,
            letterSpacing: "-0.06em",
            boxShadow: "0 20px 40px rgba(49, 37, 24, 0.18)"
          }}
        >
          RT
        </div>
      </div>
    ),
    size
  );
}
