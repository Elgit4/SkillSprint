/**
 * Cross-browser Blob download helper.
 * Prefer the native share sheet on devices that can share files (notably iOS),
 * use the download attribute where supported, and open a saveable tab as fallback.
 */
export async function downloadBlob(blob, filename, environment = globalThis) {
  const doc = environment.document;
  const URLApi = environment.URL;
  const nav = environment.navigator;
  const win = environment.window;
  const FileCtor = environment.File;

  if (!(blob instanceof (environment.Blob || Blob))) throw new TypeError('A Blob is required to download a file.');
  if (!doc?.createElement || !URLApi?.createObjectURL || !URLApi?.revokeObjectURL) {
    throw new Error('This browser does not support file downloads.');
  }

  if (typeof FileCtor === 'function' && typeof nav?.share === 'function' && typeof nav?.canShare === 'function') {
    const file = new FileCtor([blob], filename, { type: blob.type || 'application/octet-stream' });
    if (nav.canShare({ files: [file] })) {
      await nav.share({ files: [file], title: filename });
      return { method: 'share' };
    }
  }

  const objectUrl = URLApi.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = objectUrl;
  link.download = filename;
  link.rel = 'noopener';
  link.style.display = 'none';

  if ('download' in link) {
    doc.body.append(link);
    link.click();
    link.remove();
    const defer = environment.setTimeout || setTimeout;
    defer(() => URLApi.revokeObjectURL(objectUrl), 60000);
    return { method: 'download' };
  }

  link.remove();
  const opened = win?.open?.(objectUrl, '_blank');
  if (opened) {
    const defer = environment.setTimeout || setTimeout;
    defer(() => URLApi.revokeObjectURL(objectUrl), 60000);
    return { method: 'open' };
  }

  URLApi.revokeObjectURL(objectUrl);
  throw new Error('Your browser blocked the file preview. Allow pop-ups for SkillSprint or open the app in a browser that supports downloads.');
}
