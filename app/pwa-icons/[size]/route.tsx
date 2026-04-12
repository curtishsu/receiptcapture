import { ImageResponse } from "next/og";

const VALID_SIZES = new Set(["192", "512"]);

function getDimension(size: string): number | null {
  if (!VALID_SIZES.has(size)) {
    return null;
  }

  return Number(size);
}

function buildIcon(size: number): ImageResponse {
  const fontSize = size * 0.34;
  const radius = size * 0.22;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background:
            "linear-gradient(180deg, #f7f1e6 0%, #f2e7d7 100%)",
          color: "#0f766e"
        }}
      >
        <div
          style={{
            width: size * 0.74,
            height: size * 0.74,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            borderRadius: radius,
            background: "linear-gradient(135deg, #0f766e 0%, #115e59 100%)",
            boxShadow: "0 24px 48px rgba(49, 37, 24, 0.18)",
            color: "#fffdf9",
            fontSize,
            fontWeight: 800,
            letterSpacing: "-0.06em"
          }}
        >
          RT
        </div>
      </div>
    ),
    {
      width: size,
      height: size
    }
  );
}

export async function GET(_request: Request, context: { params: Promise<{ size: string }> }): Promise<Response> {
  const { size } = await context.params;
  const dimension = getDimension(size);

  if (!dimension) {
    return new Response("Not found", { status: 404 });
  }

  return buildIcon(dimension);
}
