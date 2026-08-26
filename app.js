'use strict';

const APP_VERSION = '2.0.0';
const MIB = 1024 * 1024;
const PART_RE = /^(.*)\.part(\d+)$/i;
const MANIFEST_RE = /\.parts\.json$/i;

let splitFileSelected = null;
let mergeFilesSelected = [];
let splitObjectUrls = [];
let mergeObjectUrls = [];
let deferredInstallPrompt = null;

const $ = (id) => document.getElementById(id);

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '-';
  const units = ['B', 'KiB', 'MiB', 'GiB', 'TiB'];
  let value = bytes;
  let unit = units[0];
  for (let i = 0; i < units.length - 1 && value >= 1024; i += 1) {
    value /= 1024;
    unit = units[i + 1];
  }
  const digits = value >= 100 ? 0 : value >= 10 ? 1 : 2;
  return `${value.toFixed(digits)} ${unit}`;
}

function setText(el, text) {
  el.textContent = text;
}

function clearElement(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function appendStatus(container, text, kind = '') {
  const div = document.createElement('div');
  div.className = `status-msg${kind ? ` ${kind}` : ''}`;
  div.textContent = text;
  container.appendChild(div);
  return div;
}

function appendDownloadLink(blob, filename, container, label, urlStore, primary = false) {
  const url = URL.createObjectURL(blob);
  urlStore.push(url);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.className = `download-item${primary ? ' primary' : ''}`;

  const text = document.createElement('span');
  text.textContent = label;
  const icon = document.createElement('span');
  icon.textContent = '⬇';
  icon.setAttribute('aria-hidden', 'true');

  link.append(text, icon);
  container.appendChild(link);
}

function revokeUrls(store) {
  for (const url of store) URL.revokeObjectURL(url);
  store.length = 0;
}

function setProgress(prefix, current, total, text) {
  const wrap = $(`progress${prefix}`);
  const bar = $(`progress${prefix}Bar`);
  const textEl = $(`progress${prefix}Text`);
  const percentEl = $(`progress${prefix}Percent`);
  const percent = total > 0 ? Math.min(100, Math.max(0, Math.round((current / total) * 100))) : 0;
  wrap.hidden = false;
  bar.value = percent;
  textEl.textContent = text;
  percentEl.textContent = `${percent}%`;
}

function hideProgress(prefix) {
  $(`progress${prefix}`).hidden = true;
  $(`progress${prefix}Bar`).value = 0;
  $(`progress${prefix}Percent`).textContent = '0%';
}

function setupDropZone(dropZoneId, inputId, onFiles) {
  const dropZone = $(dropZoneId);
  const input = $(inputId);

  ['dragenter', 'dragover'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.add('dragover');
    });
  });

  ['dragleave', 'drop'].forEach((eventName) => {
    dropZone.addEventListener(eventName, (event) => {
      event.preventDefault();
      event.stopPropagation();
      dropZone.classList.remove('dragover');
    });
  });

  dropZone.addEventListener('drop', (event) => onFiles(Array.from(event.dataTransfer.files)));
  input.addEventListener('change', () => onFiles(Array.from(input.files)));
  dropZone.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      input.click();
    }
  });
}

function updateSplitModeUI() {
  const mode = $('splitMode').value;
  $('customSizeArea').hidden = mode !== 'custom';
  $('splitCountArea').hidden = mode !== 'count';
  updateSplitPreview();
}

function calculateSplitPlan(file) {
  const mode = $('splitMode').value;
  if (!file || file.size <= 0) throw new Error('0 byteのファイルは分割できません。');

  if (mode === 'count') {
    const count = Number.parseInt($('splitCount').value, 10);
    if (!Number.isInteger(count) || count < 2 || count > 9999) {
      throw new Error('分割数は2～9999の整数で指定してください。');
    }
    if (count > file.size) {
      throw new Error('分割数がファイルのバイト数を超えています。空のパーツは作成しません。');
    }
    return { mode: 'count', totalChunks: count, chunkSize: null };
  }

  let sizeMiB;
  if (mode === 'custom') {
    sizeMiB = Number.parseFloat($('customSize').value);
    if (!Number.isFinite(sizeMiB) || sizeMiB < 0.1 || sizeMiB > 1024) {
      throw new Error('任意サイズは0.1～1024 MiBで指定してください。');
    }
  } else {
    sizeMiB = Number.parseFloat(mode);
  }

  const chunkSize = Math.max(1, Math.floor(sizeMiB * MIB));
  const totalChunks = Math.ceil(file.size / chunkSize);
  return { mode: 'size', totalChunks, chunkSize, sizeMiB };
}

function getChunkRange(fileSize, index, plan) {
  if (plan.mode === 'count') {
    const start = Math.floor((fileSize * index) / plan.totalChunks);
    const end = Math.floor((fileSize * (index + 1)) / plan.totalChunks);
    return { start, end };
  }
  const start = index * plan.chunkSize;
  const end = Math.min(fileSize, start + plan.chunkSize);
  return { start, end };
}

function updateSplitPreview() {
  const box = $('splitPreview');
  if (!splitFileSelected) {
    box.hidden = true;
    clearElement(box);
    return;
  }

  try {
    const plan = calculateSplitPlan(splitFileSelected);
    const first = getChunkRange(splitFileSelected.size, 0, plan);
    const last = getChunkRange(splitFileSelected.size, plan.totalChunks - 1, plan);
    const lines = [
      `予想分割数: ${plan.totalChunks}個`,
      `先頭パーツ: ${formatBytes(first.end - first.start)}`,
      `最終パーツ: ${formatBytes(last.end - last.start)}`,
      '整合性情報: SHA-256付きマニフェストを生成'
    ];
    box.textContent = lines.join('\n');
    box.style.whiteSpace = 'pre-line';
    box.hidden = false;
  } catch (error) {
    box.textContent = error.message;
    box.hidden = false;
  }
}

function handleSplitFiles(files) {
  revokeUrls(splitObjectUrls);
  clearElement($('logSplit'));
  hideProgress('Split');

  splitFileSelected = files[0] || null;
  const info = $('fileInfoSplit');
  $('btnSplit').disabled = !splitFileSelected;
  $('btnClearSplit').disabled = !splitFileSelected;

  if (!splitFileSelected) {
    info.hidden = true;
    updateSplitPreview();
    return;
  }

  info.textContent = `選択中: ${splitFileSelected.name}（${formatBytes(splitFileSelected.size)}）`;
  info.hidden = false;
  updateSplitPreview();
}

function handleMergeFiles(files) {
  revokeUrls(mergeObjectUrls);
  clearElement($('logMerge'));
  hideProgress('Merge');

  mergeFilesSelected = files;
  const info = $('fileInfoMerge');
  const validation = $('mergeValidation');
  validation.hidden = true;
  validation.className = 'validation-box';
  clearElement(validation);

  $('btnMerge').disabled = files.length === 0;
  $('btnClearMerge').disabled = files.length === 0;

  if (files.length === 0) {
    info.hidden = true;
    return;
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);
  const manifestCount = files.filter((file) => MANIFEST_RE.test(file.name)).length;
  info.textContent = `${files.length}個のファイルを選択中（合計 ${formatBytes(totalSize)} / マニフェスト ${manifestCount}個）`;
  info.hidden = false;

  const quick = quickValidateMergeSelection(files);
  validation.textContent = quick.message;
  validation.className = `validation-box ${quick.ok ? (quick.warning ? 'warning' : 'ok') : 'error'}`;
  validation.hidden = false;
}

function quickValidateMergeSelection(files) {
  const manifests = files.filter((file) => MANIFEST_RE.test(file.name));
  const parts = files.filter((file) => !MANIFEST_RE.test(file.name));

  if (manifests.length > 1) return { ok: false, message: 'マニフェスト（.parts.json）は1個だけ選択してください。' };
  if (parts.length === 0) return { ok: false, message: '分割ファイル（.part001 など）が選択されていません。' };

  const parsed = parts.map((file) => {
    const match = file.name.match(PART_RE);
    return match ? { file, base: match[1], number: Number.parseInt(match[2], 10) } : null;
  });
  if (parsed.some((item) => item === null)) {
    return { ok: false, message: '認識できないファイルがあります。.part001 形式の分割ファイルだけを選択してください。' };
  }

  const bases = new Set(parsed.map((item) => item.base));
  if (bases.size !== 1) return { ok: false, message: '異なる元ファイルのパーツが混在しています。' };

  const numbers = parsed.map((item) => item.number);
  if (new Set(numbers).size !== numbers.length) return { ok: false, message: '同じパーツ番号が重複しています。' };

  numbers.sort((a, b) => a - b);
  if (numbers[0] !== 1) return { ok: false, message: 'part001 がありません。' };
  for (let i = 1; i < numbers.length; i += 1) {
    if (numbers[i] !== numbers[i - 1] + 1) {
      return { ok: false, message: `part${String(numbers[i - 1] + 1).padStart(3, '0')} が不足しています。` };
    }
  }

  if (manifests.length === 1) {
    return { ok: true, warning: false, message: `連番チェックOK。${numbers.length}パーツ + SHA-256マニフェストを検出しました。` };
  }
  return { ok: true, warning: true, message: `連番チェックOK。${numbers.length}パーツ。マニフェストがないためSHA-256照合は行いません。` };
}

async function sha256Hex(blob) {
  if (!globalThis.crypto?.subtle) throw new Error('このブラウザではSHA-256機能を利用できません。HTTPS環境で開いてください。');
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest('SHA-256', buffer);
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function buildManifestName(originalName) {
  return `${originalName}.parts.json`;
}

async function splitFile() {
  const file = splitFileSelected;
  const log = $('logSplit');
  const btn = $('btnSplit');
  if (!file) return;

  revokeUrls(splitObjectUrls);
  clearElement(log);

  let plan;
  try {
    plan = calculateSplitPlan(file);
  } catch (error) {
    appendStatus(log, error.message, 'error');
    return;
  }

  btn.disabled = true;
  $('btnClearSplit').disabled = true;
  btn.textContent = '処理中...';

  try {
    const manifest = {
      manifestVersion: 2,
      app: 'File Splitter',
      appVersion: APP_VERSION,
      createdAt: new Date().toISOString(),
      originalName: file.name,
      originalSize: file.size,
      totalParts: plan.totalChunks,
      hashAlgorithm: 'SHA-256',
      split: plan.mode === 'count'
        ? { method: 'count', count: plan.totalChunks }
        : { method: 'size', chunkSizeBytes: plan.chunkSize },
      parts: []
    };

    appendStatus(log, `総サイズ ${formatBytes(file.size)} / ${plan.totalChunks}パーツを生成します。`);

    for (let i = 0; i < plan.totalChunks; i += 1) {
      const { start, end } = getChunkRange(file.size, i, plan);
      const chunk = file.slice(start, end);
      const partNum = String(i + 1).padStart(3, '0');
      const chunkName = `${file.name}.part${partNum}`;
      setProgress('Split', i, plan.totalChunks, `SHA-256計算中 ${i + 1} / ${plan.totalChunks}`);
      const hash = await sha256Hex(chunk);

      manifest.parts.push({
        number: i + 1,
        name: chunkName,
        size: chunk.size,
        sha256: hash
      });

      appendDownloadLink(
        chunk,
        chunkName,
        log,
        `${chunkName}（${formatBytes(chunk.size)}）`,
        splitObjectUrls
      );
      setProgress('Split', i + 1, plan.totalChunks, `分割完了 ${i + 1} / ${plan.totalChunks}`);

      if (i % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
    }

    const manifestText = `${JSON.stringify(manifest, null, 2)}\n`;
    const manifestBlob = new Blob([manifestText], { type: 'application/json;charset=utf-8' });
    appendDownloadLink(
      manifestBlob,
      buildManifestName(file.name),
      log,
      `整合性マニフェスト: ${buildManifestName(file.name)}`,
      splitObjectUrls,
      true
    );
    appendStatus(log, '分割完了。すべてのパーツと .parts.json を保存してください。', 'success');
  } catch (error) {
    appendStatus(log, `分割中にエラーが発生しました: ${error.message}`, 'error');
  } finally {
    btn.disabled = false;
    $('btnClearSplit').disabled = false;
    btn.textContent = '分割を実行';
  }
}

function parsePartFiles(files) {
  const manifests = files.filter((file) => MANIFEST_RE.test(file.name));
  const rawParts = files.filter((file) => !MANIFEST_RE.test(file.name));

  if (manifests.length > 1) throw new Error('マニフェスト（.parts.json）が複数選択されています。');
  if (rawParts.length === 0) throw new Error('分割ファイルがありません。');

  const parts = rawParts.map((file) => {
    const match = file.name.match(PART_RE);
    if (!match) throw new Error(`認識できないファイルです: ${file.name}`);
    return { file, base: match[1], number: Number.parseInt(match[2], 10) };
  });

  const bases = new Set(parts.map((part) => part.base));
  if (bases.size !== 1) throw new Error('異なる元ファイルのパーツが混在しています。');

  parts.sort((a, b) => a.number - b.number);
  const seen = new Set();
  for (let i = 0; i < parts.length; i += 1) {
    const part = parts[i];
    if (seen.has(part.number)) throw new Error(`part${String(part.number).padStart(3, '0')} が重複しています。`);
    seen.add(part.number);
    const expected = i + 1;
    if (part.number !== expected) throw new Error(`part${String(expected).padStart(3, '0')} が不足しています。`);
  }

  return { parts, manifestFile: manifests[0] || null, originalNameFromParts: parts[0].base };
}

async function readManifest(file) {
  if (!file) return null;
  let data;
  try {
    data = JSON.parse(await file.text());
  } catch {
    throw new Error('マニフェストJSONを読み取れません。');
  }

  if (!data || data.manifestVersion !== 2 || !Array.isArray(data.parts)) {
    throw new Error('対応していないマニフェスト形式です。Ver.2で生成した .parts.json を使用してください。');
  }
  if (!Number.isSafeInteger(data.originalSize) || data.originalSize < 0) throw new Error('マニフェストのoriginalSizeが不正です。');
  if (!Number.isInteger(data.totalParts) || data.totalParts < 1) throw new Error('マニフェストのtotalPartsが不正です。');
  if (typeof data.originalName !== 'string' || data.originalName.length === 0) throw new Error('マニフェストのoriginalNameが不正です。');
  return data;
}

function safeDownloadName(name) {
  return name.replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_') || 'merged_file';
}

async function mergeFiles() {
  const log = $('logMerge');
  const btn = $('btnMerge');
  if (mergeFilesSelected.length === 0) return;

  revokeUrls(mergeObjectUrls);
  clearElement(log);
  btn.disabled = true;
  $('btnClearMerge').disabled = true;
  btn.textContent = '検証中...';

  try {
    const parsed = parsePartFiles(mergeFilesSelected);
    const { parts, manifestFile, originalNameFromParts } = parsed;
    const manifest = await readManifest(manifestFile);

    if (manifest) {
      if (manifest.originalName !== originalNameFromParts) {
        throw new Error(`元ファイル名が一致しません。パーツ: ${originalNameFromParts} / マニフェスト: ${manifest.originalName}`);
      }
      if (manifest.totalParts !== parts.length) {
        throw new Error(`パーツ数が一致しません。選択: ${parts.length} / マニフェスト: ${manifest.totalParts}`);
      }
      if (manifest.parts.length !== parts.length) {
        throw new Error('マニフェスト内のパーツ一覧件数が一致しません。');
      }

      appendStatus(log, `構造検証OK。${parts.length}パーツのSHA-256を照合します。`);

      for (let i = 0; i < parts.length; i += 1) {
        const selected = parts[i];
        const expected = manifest.parts[i];
        const expectedNum = i + 1;
        setProgress('Merge', i, parts.length, `SHA-256照合中 ${expectedNum} / ${parts.length}`);

        if (expected.number !== expectedNum) throw new Error(`マニフェストのパーツ番号が不正です: ${expectedNum}`);
        if (expected.name !== selected.file.name) throw new Error(`ファイル名が一致しません: ${selected.file.name}`);
        if (expected.size !== selected.file.size) throw new Error(`サイズ不一致: ${selected.file.name}`);
        if (typeof expected.sha256 !== 'string' || !/^[0-9a-f]{64}$/i.test(expected.sha256)) {
          throw new Error(`SHA-256情報が不正です: ${selected.file.name}`);
        }

        const actualHash = await sha256Hex(selected.file);
        if (actualHash.toLowerCase() !== expected.sha256.toLowerCase()) {
          throw new Error(`SHA-256不一致: ${selected.file.name}。破損または別ファイルの可能性があります。`);
        }
        setProgress('Merge', i + 1, parts.length, `検証OK ${expectedNum} / ${parts.length}`);
        if (i % 8 === 7) await new Promise((resolve) => setTimeout(resolve, 0));
      }
    } else {
      appendStatus(log, '連番・重複・混在チェックはOKです。マニフェストがないためSHA-256照合は省略します。', 'warning');
      setProgress('Merge', 1, 1, '構造検証完了');
    }

    const fileBlobs = parts.map((part) => part.file);
    const mergedBlob = new Blob(fileBlobs, { type: 'application/octet-stream' });
    const expectedSize = manifest ? manifest.originalSize : fileBlobs.reduce((sum, file) => sum + file.size, 0);
    if (mergedBlob.size !== expectedSize) {
      throw new Error(`結合後サイズが一致しません。実際: ${mergedBlob.size} bytes / 期待: ${expectedSize} bytes`);
    }

    const originalName = safeDownloadName(manifest?.originalName || originalNameFromParts);
    appendStatus(log, `結合準備完了。合計サイズ ${formatBytes(mergedBlob.size)}。`, 'success');
    appendDownloadLink(
      mergedBlob,
      originalName,
      log,
      `${originalName} を保存（${formatBytes(mergedBlob.size)}）`,
      mergeObjectUrls,
      true
    );
  } catch (error) {
    appendStatus(log, `結合できません: ${error.message}`, 'error');
    const validation = $('mergeValidation');
    validation.textContent = error.message;
    validation.className = 'validation-box error';
    validation.hidden = false;
  } finally {
    btn.disabled = false;
    $('btnClearMerge').disabled = false;
    btn.textContent = '検証して結合';
  }
}

function clearSplit() {
  revokeUrls(splitObjectUrls);
  splitFileSelected = null;
  $('fileInputSplit').value = '';
  $('fileInfoSplit').hidden = true;
  $('splitPreview').hidden = true;
  clearElement($('logSplit'));
  hideProgress('Split');
  $('btnSplit').disabled = true;
  $('btnClearSplit').disabled = true;
}

function clearMerge() {
  revokeUrls(mergeObjectUrls);
  mergeFilesSelected = [];
  $('fileInputMerge').value = '';
  $('fileInfoMerge').hidden = true;
  $('mergeValidation').hidden = true;
  clearElement($('logMerge'));
  hideProgress('Merge');
  $('btnMerge').disabled = true;
  $('btnClearMerge').disabled = true;
}

function setupPwa() {
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', async () => {
      try {
        const registration = await navigator.serviceWorker.register('./service-worker.js');
        $('offlineStatus').textContent = 'オフライン対応';

        if (registration.waiting) $('updateBanner').hidden = false;

        registration.addEventListener('updatefound', () => {
          const worker = registration.installing;
          worker?.addEventListener('statechange', () => {
            if (worker.state === 'installed' && navigator.serviceWorker.controller) {
              $('updateBanner').hidden = false;
            }
          });
        });

        $('btnUpdate').addEventListener('click', () => {
          const waiting = registration.waiting;
          if (waiting) waiting.postMessage({ type: 'SKIP_WAITING' });
          else window.location.reload();
        });
      } catch {
        $('offlineStatus').textContent = 'オフライン準備失敗';
      }
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });
  } else {
    $('offlineStatus').textContent = 'SW非対応';
  }

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    $('btnInstall').hidden = false;
  });

  $('btnInstall').addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    await deferredInstallPrompt.userChoice;
    deferredInstallPrompt = null;
    $('btnInstall').hidden = true;
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    $('btnInstall').hidden = true;
  });
}

function init() {
  setupDropZone('dropZoneSplit', 'fileInputSplit', handleSplitFiles);
  setupDropZone('dropZoneMerge', 'fileInputMerge', handleMergeFiles);

  $('splitMode').addEventListener('change', updateSplitModeUI);
  $('customSize').addEventListener('input', updateSplitPreview);
  $('splitCount').addEventListener('input', updateSplitPreview);
  $('btnSplit').addEventListener('click', splitFile);
  $('btnMerge').addEventListener('click', mergeFiles);
  $('btnClearSplit').addEventListener('click', clearSplit);
  $('btnClearMerge').addEventListener('click', clearMerge);

  window.addEventListener('beforeunload', () => {
    revokeUrls(splitObjectUrls);
    revokeUrls(mergeObjectUrls);
  });

  setupPwa();
  updateSplitModeUI();
}

document.addEventListener('DOMContentLoaded', init);
