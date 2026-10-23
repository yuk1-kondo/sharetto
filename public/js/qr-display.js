/**
 * QRコードを指定要素に描画する。
 * @param {HTMLElement} element
 * @param {string} url
 */
export function renderQRCode(element, url) {
  element.innerHTML = '<p class="qr-placeholder">QRコードを生成中…</p>';

  try {
    const qr = qrcode(0, 'M');
    qr.addData(url);
    qr.make();

    const tile = document.createElement('div');
    tile.className = 'qr-tile';
    tile.innerHTML = qr.createSvgTag({ cellSize: 4, margin: 0, scalable: true });
    tile.querySelector('svg')?.setAttribute('aria-label', '参加用QRコード');

    element.innerHTML = '';
    element.appendChild(tile);
  } catch (error) {
    console.error('QRコード生成エラー:', error);
    element.innerHTML = '<p class="qr-placeholder">QRコードを生成できませんでした</p>';
    throw error;
  }
}
