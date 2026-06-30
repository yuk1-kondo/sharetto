import { showToast } from './toast.js';

function uniqueName(name, used) {
  if (!used.has(name)) {
    used.add(name);
    return name;
  }
  const dot = name.lastIndexOf('.');
  const base = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : '';
  let i = 2;
  while (used.has(`${base} (${i})${ext}`)) i += 1;
  const next = `${base} (${i})${ext}`;
  used.add(next);
  return next;
}

/**
 * 受信ファイルを ZIP してダウンロード
 * @param {{ name: string, blob: Blob }[]} files
 */
export async function downloadFilesAsZip(files, zipName = 'sharetto-files.zip') {
  if (!files?.length) {
    showToast('ZIP にするファイルがありません', 'info');
    return;
  }

  try {
    const { zipSync } = await import('https://cdn.jsdelivr.net/npm/fflate@0.8.2/esm/browser.js');
    const zipData = {};
    const used = new Set();

    for (const file of files) {
      const buf = new Uint8Array(await file.blob.arrayBuffer());
      const entryName = uniqueName(file.name || 'file', used);
      zipData[entryName] = buf;
    }

    const zipped = zipSync(zipData);
    const blob = new Blob([zipped], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = zipName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast(`${files.length} 件を ZIP 保存しました`, 'success');
  } catch (e) {
    console.error('[zip]', e);
    showToast('ZIP 作成に失敗しました', 'error');
  }
}
