// Background city renderer. Pure: no state, no allocations beyond gradients.
// Painted before obstacles and entities. Keep cheap; this runs every frame.

export function drawCity(ctx, width, height) {
  // Asphalt base with a subtle radial vignette
  const grad = ctx.createRadialGradient(
    width / 2, height / 2, height * 0.2,
    width / 2, height / 2, height * 0.9
  );
  grad.addColorStop(0, '#0d1426');
  grad.addColorStop(1, '#03060d');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  // Street grid — softly glowing magenta and cyan lines like a wet city at night
  ctx.save();
  ctx.strokeStyle = 'rgba(86, 224, 255, 0.08)';
  ctx.lineWidth = 1;
  const cell = 64;
  ctx.beginPath();
  for (let x = 0; x <= width; x += cell) {
    ctx.moveTo(x + 0.5, 0);
    ctx.lineTo(x + 0.5, height);
  }
  for (let y = 0; y <= height; y += cell) {
    ctx.moveTo(0, y + 0.5);
    ctx.lineTo(width, y + 0.5);
  }
  ctx.stroke();

  // Dashed centre-lines on the main avenue
  ctx.strokeStyle = 'rgba(255, 200, 100, 0.18)';
  ctx.lineWidth = 2;
  ctx.setLineDash([14, 18]);
  ctx.beginPath();
  ctx.moveTo(0, height * 0.5);
  ctx.lineTo(width, height * 0.5);
  ctx.stroke();
  ctx.setLineDash([]);

  // Distant neon glow streak
  ctx.fillStyle = 'rgba(255, 77, 145, 0.05)';
  ctx.fillRect(0, height * 0.18, width, 6);
  ctx.fillStyle = 'rgba(86, 224, 255, 0.05)';
  ctx.fillRect(0, height * 0.82, width, 4);
  ctx.restore();
}
