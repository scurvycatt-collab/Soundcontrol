import { useRef, useState } from 'react';
import { demoExportShow, demoImportShow } from '../demo/demoStore';

interface Props {
  onMessage: (msg: string) => void;
}

/** Sao lưu / khôi phục toàn bộ show (chế độ local). Nên xuất một bản trước giờ diễn. */
export function DemoTools({ onMessage }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const doExport = async () => {
    setBusy(true);
    try {
      const { blob, count } = await demoExportShow();
      if (count === 0) return onMessage('Chưa có âm thanh nào để xuất.');
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `show-${new Date().toISOString().slice(0, 10)}.stageshow`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      onMessage(`Đã xuất ${count} âm thanh ra tệp .stageshow.`);
    } catch (e) {
      onMessage(`Xuất thất bại: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
    }
  };

  const doImport = async (f: File | undefined) => {
    if (!f) return;
    setBusy(true);
    try {
      const n = await demoImportShow(f);
      onMessage(`Đã nhập ${n} âm thanh từ tệp show.`);
    } catch (e) {
      onMessage(`Nhập thất bại: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = '';
    }
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-2 px-4 pt-3 text-sm">
      <span className="text-slate-400">Tệp show:</span>
      <button type="button" disabled={busy} className="btn h-9 px-3 bg-stage-700 hover:bg-stage-600" onClick={() => void doExport()}>
        ⬇ Xuất (.stageshow)
      </button>
      <button type="button" disabled={busy} className="btn h-9 px-3 bg-stage-700 hover:bg-stage-600" onClick={() => input.current?.click()}>
        ⬆ Nhập
      </button>
      <input ref={input} type="file" accept=".stageshow" className="hidden" onChange={(e) => void doImport(e.target.files?.[0])} />
    </div>
  );
}
