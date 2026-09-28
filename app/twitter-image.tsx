import { ImageResponse } from 'next/og';

export const alt = 'GAMER.ID - your gamer identity across Xbox, Steam and PlayStation';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f5f5dc',
          padding: 40,
        }}
      >
        <div
          style={{
            width: '100%',
            height: '100%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            borderRadius: 32,
            background: 'linear-gradient(135deg, #1a1a1a 0%, #2d3436 100%)',
            color: '#ffffff',
          }}
        >
          <div style={{ fontSize: 132, fontWeight: 900, letterSpacing: -4 }}>GAMER.ID</div>
          <div
            style={{
              marginTop: 24,
              fontSize: 40,
              fontWeight: 700,
              color: '#ffffff',
              background: 'linear-gradient(90deg, #10b981 0%, #06b6d4 100%)',
              borderRadius: 999,
              padding: '10px 36px',
            }}
          >
            Xbox · Steam · PlayStation
          </div>
          <div style={{ marginTop: 28, fontSize: 32, color: '#d4d4d8' }}>Pooled playtime and shareable Top 6 / 10 / 25 / 50 cards</div>
        </div>
      </div>
    ),
    size
  );
}
