/** オービタル軌道の共通パラメータ */
export const ORBIT = {
  radius: 1.8,
  tilt: 0.38,
  yAmp: 0.15,
  yFreq: 2,
};

export function orbitPosition(angle, { radius = ORBIT.radius, tilt = ORBIT.tilt } = {}) {
  return {
    x: Math.cos(angle) * radius,
    y: Math.sin(angle * ORBIT.yFreq) * ORBIT.yAmp,
    z: Math.sin(angle) * radius * Math.sin(tilt),
  };
}
