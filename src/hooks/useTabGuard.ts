import { useEffect, useRef, useState } from 'react';

interface TabMessage {
  type: 'hello' | 'state';
  id: string;
  playing: boolean;
}

const CHANNEL = 'stage-audio-control.tabs';
const HEARTBEAT_MS = 2500;
const EXPIRE_MS = 7000;

/**
 * Cảnh báo (best-effort) nếu một tab khác cùng trình duyệt/profile đang phát.
 * Không phải khóa đa thiết bị và không bảo đảm gì giữa các máy.
 */
export function useTabGuard(isPlaying: boolean): boolean {
  const [otherPlaying, setOtherPlaying] = useState(false);
  const playingRef = useRef(isPlaying);
  const postRef = useRef<((type: TabMessage['type']) => void) | null>(null);
  playingRef.current = isPlaying;

  useEffect(() => {
    if (typeof BroadcastChannel === 'undefined') return;
    const myId = Math.random().toString(36).slice(2);
    const channel = new BroadcastChannel(CHANNEL);
    const others = new Map<string, number>(); // id -> lần cuối thấy đang phát

    const recompute = () => {
      const now = Date.now();
      for (const [id, t] of others) if (now - t > EXPIRE_MS) others.delete(id);
      setOtherPlaying(others.size > 0);
    };
    const post = (type: TabMessage['type']) => {
      const msg: TabMessage = { type, id: myId, playing: playingRef.current };
      channel.postMessage(msg);
    };
    postRef.current = post;

    channel.onmessage = (ev: MessageEvent<TabMessage>) => {
      const m = ev.data;
      if (!m || m.id === myId) return;
      if (m.playing) others.set(m.id, Date.now());
      else others.delete(m.id);
      if (m.type === 'hello') post('state');
      recompute();
    };

    post('hello');
    const timer = setInterval(() => {
      post('state');
      recompute();
    }, HEARTBEAT_MS);

    return () => {
      clearInterval(timer);
      postRef.current = null;
      channel.close();
    };
  }, []);

  useEffect(() => {
    postRef.current?.('state');
  }, [isPlaying]);

  return otherPlaying;
}
