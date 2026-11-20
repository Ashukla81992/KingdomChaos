'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { MessageCircle, Send, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { PlayerView } from '@/engine';
import { seatTheme } from '@/lib/seats';
import { useSettings } from '@/lib/settings';
import { CHAT_MAX_LENGTH, QUICK_CHAT, type ChatMessage } from '@/server/protocol';
import type { SendResult } from './GameScreen';

export interface ChatController {
  messages: ChatMessage[];
  send: (text: string) => Promise<SendResult>;
}

/** Open/closed state, unread count and the "peek" bubble for a match chat. */
export function useMatchChat(chat: ChatController | undefined, me: string | null) {
  const { play } = useSettings();
  const [open, setOpen] = useState(false);
  const [seenId, setSeenId] = useState<number | null>(null);
  const [peek, setPeek] = useState<ChatMessage | null>(null);
  const messages = chat?.messages ?? [];
  const lastId = messages.at(-1)?.id ?? 0;

  // Whatever is already there when the match screen opens counts as read.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (seenId === null && chat) setSeenId(lastId);
  }, [chat, lastId, seenId]);

  useEffect(() => {
    if (open && seenId !== lastId) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setSeenId(lastId);
      setPeek(null);
    }
  }, [open, lastId, seenId]);

  const unread = seenId === null || open ? 0 : messages.filter((m) => m.id > seenId && m.playerId !== me).length;

  // A short bubble with the newest line from someone else, while the panel is closed.
  const peekSource = !open && seenId !== null ? [...messages].reverse().find((m) => m.id > seenId && m.playerId !== me) : undefined;
  const peekId = peekSource?.id;
  useEffect(() => {
    if (!peekSource) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPeek(peekSource);
    play('pickup');
    const t = setTimeout(() => setPeek(null), 6000);
    return () => clearTimeout(t);
    // Only a new message (new id) should restart the bubble.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [peekId]);

  return { open, setOpen, unread, peek: open ? null : peek, dismissPeek: () => setPeek(null) };
}

export function ChatToggle({ unread, open, onClick }: { unread: number; open: boolean; onClick: () => void }) {
  return (
    <button
      className={`btn relative px-3! py-1.5! ${open ? 'btn-primary' : 'btn-ghost'}`}
      onClick={onClick}
      aria-pressed={open}
      aria-label={unread ? `Chat, ${unread} new message${unread === 1 ? '' : 's'}` : 'Chat'}
      data-chat-toggle
    >
      <MessageCircle size={18} aria-hidden="true" />
      <span className="hidden sm:inline">Chat</span>
      {unread > 0 && (
        <span className="absolute -top-1.5 -right-1.5 grid h-5 min-w-5 place-items-center rounded-full bg-[#e0532d] px-1 text-[0.6875rem] font-bold text-white" aria-hidden="true" data-chat-unread>
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}

function nameColor(view: Pick<PlayerView, 'players'> | null, playerId: string) {
  const p = view?.players.find((x) => x.id === playerId);
  return p ? seatTheme(p.seat) : null;
}

function timeOf(at: number) {
  return new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

/** The list of messages, quick lines and the input. Used in the match panel and in the lobby. */
export function ChatBody({ chat, me, view, autoFocus }: { chat: ChatController; me: string | null; view: Pick<PlayerView, 'players'> | null; autoFocus?: boolean }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLOListElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const count = chat.messages.length;

  useEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [count]);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus({ preventScroll: true });
  }, [autoFocus]);

  const submit = async (value: string) => {
    const line = value.trim();
    if (!line || busy) return;
    setBusy(true);
    setErr(null);
    const r = await chat.send(line);
    setBusy(false);
    if (r.ok) {
      if (value === text) setText('');
    } else setErr(r.error);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ol ref={listRef} className="min-h-0 flex-1 space-y-1.5 overflow-y-auto overscroll-contain pr-1" aria-label="Chat messages" aria-live="polite" data-chat-list>
        {count === 0 && <li className="py-4 text-center text-sm text-[#4a5374]">No messages yet. Say hello!</li>}
        {chat.messages.map((m) => {
          const mine = m.playerId === me;
          const theme = nameColor(view, m.playerId);
          return (
            <li key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`} data-chat-message={mine ? 'mine' : 'theirs'}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-1.5 text-sm break-words ${mine ? 'rounded-br-md bg-[#1d2440] text-white' : 'rounded-bl-md bg-white text-[#1d2440] shadow-sm'}`}
                style={!mine && theme ? { borderLeft: `4px solid ${theme.color}` } : undefined}
              >
                {!mine && (
                  <div className="text-xs font-bold" style={{ color: theme?.dark ?? '#4a5374' }}>
                    {m.username}
                  </div>
                )}
                <span>{m.text}</span>
                <span className={`ml-2 text-[0.625rem] ${mine ? 'text-white/60' : 'text-[#8a8370]'}`}>{timeOf(m.at)}</span>
              </div>
            </li>
          );
        })}
      </ol>
      <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5" aria-label="Quick messages" data-chat-quick>
        {QUICK_CHAT.map((q) => (
          <button key={q} type="button" className="shrink-0 rounded-full border border-[#e3d6b6] bg-white px-2.5 py-1 text-xs font-semibold text-[#1d2440] hover:bg-[#fff1b8] disabled:opacity-50" disabled={busy} onClick={() => void submit(q)}>
            {q}
          </button>
        ))}
      </div>
      <form
        className="flex gap-1.5"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(text);
        }}
      >
        <input
          ref={inputRef}
          className="min-w-0 flex-1 rounded-full border-2 border-[#e3d6b6] bg-white px-3 py-2 text-sm text-[#1d2440] outline-none focus:border-[#f4a81d]"
          value={text}
          maxLength={CHAT_MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          placeholder="Message the table…"
          aria-label="Chat message"
          enterKeyHint="send"
          autoComplete="off"
          data-chat-input
        />
        <button type="submit" className="btn btn-primary icon-btn" disabled={busy || !text.trim()} aria-label="Send message" data-chat-send>
          <Send size={18} aria-hidden="true" />
        </button>
      </form>
      {err && (
        <p role="alert" className="text-xs font-semibold text-[#8c2a10]">
          {err}
        </p>
      )}
    </div>
  );
}

/**
 * The in-match chat. On phones it is a sheet above the bottom dock; on laptops and TVs it floats in the
 * bottom-right corner of the board (left of the zoom buttons) and can be closed so nothing stays in the way.
 */
export function MatchChatPanel({
  chat,
  me,
  view,
  open,
  onClose,
  peek,
  onPeek,
}: {
  chat: ChatController;
  me: string | null;
  view: PlayerView;
  open: boolean;
  onClose: () => void;
  peek: ChatMessage | null;
  onPeek: () => void;
}) {
  const { reducedMotion } = useSettings();
  const theme = peek ? nameColor(view, peek.playerId) : null;
  return (
    <>
      <AnimatePresence>
        {peek && (
          <motion.button
            key={peek.id}
            type="button"
            className="fixed right-2 bottom-20 z-40 flex max-w-[min(20rem,calc(100%-1rem))] items-start gap-2 rounded-2xl bg-white/95 px-3 py-2 text-left text-sm text-[#1d2440] shadow-lg lg:absolute lg:right-16 lg:bottom-2"
            style={theme ? { borderLeft: `4px solid ${theme.color}` } : undefined}
            initial={reducedMotion ? false : { y: 10, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={reducedMotion ? undefined : { y: 10, opacity: 0 }}
            onClick={onPeek}
            aria-label={`New message from ${peek.username}: ${peek.text}. Open chat`}
            data-chat-peek
          >
            <MessageCircle size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">
              <span className="font-bold" style={{ color: theme?.dark }}>
                {peek.username}:
              </span>{' '}
              <span className="line-clamp-2 break-words">{peek.text}</span>
            </span>
          </motion.button>
        )}
      </AnimatePresence>
      {open && (
        <div
          className="fixed inset-x-0 bottom-16 z-40 flex h-[min(55dvh,26rem)] flex-col rounded-t-3xl border-t border-[#e6dcc6] bg-[#fffaf0] p-3 shadow-xl lg:absolute lg:inset-x-auto lg:right-16 lg:bottom-2 lg:h-[min(26rem,calc(100%-4rem))] lg:w-[min(22rem,calc(100%-5rem))] lg:rounded-2xl lg:border lg:bg-[#fffaf0]/95 lg:backdrop-blur"
          role="dialog"
          aria-label="Match chat"
          onKeyDown={(e) => {
            if (e.key === 'Escape') onClose();
          }}
          data-chat-panel
        >
          <div className="mb-2 flex items-center justify-between">
            <h2 className="font-display flex items-center gap-1.5 text-lg font-bold">
              <MessageCircle size={18} aria-hidden="true" /> Chat
            </h2>
            <button type="button" className="btn btn-ghost icon-btn" onClick={onClose} aria-label="Close chat" data-chat-close>
              <X size={18} />
            </button>
          </div>
          <ChatBody chat={chat} me={me} view={view} autoFocus />
        </div>
      )}
    </>
  );
}
