/**
 * QRコードを指定要素に描画する。
 * @param {HTMLElement} element
 * @param {string} url
 */
export function renderQRCode(element, url) {
  element.innerHTML = '<div style="color: var(--md-on-surface-variant); text-align: center; padding: 40px;">QRコード生成中...</div>';

  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();

    const qrContainer = document.createElement('div');
    qrContainer.style.cssText = `
      background: white;
      padding: 20px;
      border-radius: 20px;
      box-shadow: 0 12px 48px rgba(0, 0, 0, 0.15), 0 6px 24px rgba(0, 0, 0, 0.1);
      display: inline-block;
    `;
    qrContainer.innerHTML = qr.createSvgTag(4, 4);

    element.innerHTML = '';
    element.appendChild(qrContainer);
  } catch (error) {
    console.error('QRコード生成エラー:', error);
    element.innerHTML = '<p style="color: #ef4444; text-align: center; padding: 40px;">QRコードの生成に失敗しました</p>';
    throw error;
  }
}
