'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { VoiceSignal } from '@/server/protocol';
import { fetchIceServers, type SignalOut } from './onlineClient';

/**
 * Voice chat for an online room: a direct WebRTC audio link between each pair of players (a small mesh,
 * at most four people). The game server only relays the short connection messages (offer and answer, with
 * their network candidates); audio never passes through it and nothing is recorded.
 *
 * - Joining voice only listens. The microphone is asked for and switched on when the player taps the mic.
 * - Each player can mute anyone else for themselves.
 * - Everything is closed when the player leaves voice, leaves the page, or the match ends.
 */

export type PeerState = 'connecting' | 'connected' | 'failed';

export interface VoicePeer {
  playerId: string;
  username: string;
  state: PeerState;
  muted: boolean;
  speaking: boolean;
}

interface Link {
  pc: RTCPeerConnection;
  audio: HTMLAudioElement;
  analyser: AnalyserNode | null;
}

const GATHER_TIMEOUT_MS = 2500;
const FALLBACK_ICE: RTCIceServer[] = [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] }];

/** Wait until the browser has found its network candidates, so one message carries everything. */
function gathered(pc: RTCPeerConnection) {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise<void>((resolve) => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      clearTimeout(t);
      resolve();
    };
    const check = () => pc.iceGatheringState === 'complete' && done();
    const t = setTimeout(done, GATHER_TIMEOUT_MS);
    pc.addEventListener('icegatheringstatechange', check);
  });
}

export function voiceSupported() {
  return typeof window !== 'undefined' && typeof RTCPeerConnection !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;
}

export function useVoice(opts: {
  /** False once the match is over or the player is not seated: voice closes. */
  enabled: boolean;
  me: string | null;
  others: Array<{ playerId: string; username: string }>;
  sendSignal: (s: SignalOut) => Promise<unknown>;
  onSignals: (fn: (s: VoiceSignal[]) => void) => () => void;
  pollFast: (ms?: number) => void;
}) {
  const { enabled, me, others, sendSignal, onSignals, pollFast } = opts;
  const [joined, setJoined] = useState(false);
  const [joining, setJoining] = useState(false);
  const [micOn, setMicOn] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [states, setStates] = useState<Record<string, PeerState>>({});
  const [muted, setMutedState] = useState<Record<string, boolean>>({});
  const [speaking, setSpeaking] = useState<Record<string, boolean>>({});

  const joinedRef = useRef(false);
  const links = useRef(new Map<string, Link>());
  const mic = useRef<MediaStream | null>(null);
  const ice = useRef<RTCIceServer[]>(FALLBACK_ICE);
  const mutedRef = useRef<Record<string, boolean>>({});
  const audioCtx = useRef<AudioContext | null>(null);
  const othersRef = useRef(others);
  useEffect(() => {
    othersRef.current = others;
  }, [others]);

  const setState = (id: string, st: PeerState | null) =>
    setStates((cur) => {
      if (st === null) {
        if (!(id in cur)) return cur;
        const next = { ...cur };
        delete next[id];
        return next;
      }
      return cur[id] === st ? cur : { ...cur, [id]: st };
    });

  const drop = useCallback((id: string) => {
    const link = links.current.get(id);
    if (!link) return;
    links.current.delete(id);
    link.pc.onconnectionstatechange = null;
    link.pc.ontrack = null;
    link.pc.close();
    link.audio.srcObject = null;
    link.analyser?.disconnect();
    setState(id, null);
  }, []);

  const newLink = useCallback(
    (id: string) => {
      drop(id);
      const pc = new RTCPeerConnection({ iceServers: ice.current });
      const audio = new Audio();
      audio.autoplay = true;
      audio.muted = !!mutedRef.current[id];
      const link: Link = { pc, audio, analyser: null };
      links.current.set(id, link);
      setState(id, 'connecting');
      pc.ontrack = (e) => {
        const stream = new MediaStream([e.track]);
        audio.srcObject = stream;
        void audio.play().catch(() => {});
        try {
          const ctx = (audioCtx.current ??= new AudioContext());
          const analyser = ctx.createAnalyser();
          analyser.fftSize = 512;
          ctx.createMediaStreamSource(stream).connect(analyser);
          link.analyser = analyser;
        } catch {
          // The speaking light is a nicety; audio still plays without it.
        }
      };
      pc.onconnectionstatechange = () => {
        if (links.current.get(id)?.pc !== pc) return;
        const s = pc.connectionState;
        if (s === 'connected') setState(id, 'connected');
        else if (s === 'failed') setState(id, 'failed');
        else if (s === 'closed') drop(id);
      };
      return link;
    },
    [drop],
  );

  const attachMic = (pc: RTCPeerConnection) => {
    const track = mic.current?.getAudioTracks()[0] ?? null;
    for (const t of pc.getTransceivers()) {
      if (t.receiver.track.kind !== 'audio' || t.currentDirection === 'stopped') continue;
      t.direction = 'sendrecv';
      void t.sender.replaceTrack(track).catch(() => {});
    }
  };

  const callPeer = useCallback(
    async (id: string) => {
      const { pc } = newLink(id);
      pc.addTransceiver('audio', { direction: 'sendrecv' });
      attachMic(pc);
      await pc.setLocalDescription(await pc.createOffer());
      await gathered(pc);
      if (links.current.get(id)?.pc !== pc || !pc.localDescription) return;
      pollFast();
      await sendSignal({ kind: 'offer', to: id, data: { type: 'offer', sdp: pc.localDescription.sdp } });
    },
    [newLink, pollFast, sendSignal],
  );

  const handle = useCallback(
    async (s: VoiceSignal) => {
      if (!joinedRef.current || !me) return;
      if (s.kind === 'bye') return drop(s.from);
      if (s.kind === 'hello') return callPeer(s.from);
      const desc = s.data as { type: 'offer' | 'answer'; sdp: string };
      if (s.kind === 'answer') {
        const link = links.current.get(s.from);
        if (link?.pc.signalingState === 'have-local-offer') await link.pc.setRemoteDescription(desc).catch(() => setState(s.from, 'failed'));
        return;
      }
      // An offer. If we both called each other at once, the player with the larger id gives way.
      const existing = links.current.get(s.from);
      if (existing?.pc.signalingState === 'have-local-offer' && me < s.from) return;
      const { pc } = newLink(s.from);
      try {
        await pc.setRemoteDescription(desc);
        attachMic(pc);
        await pc.setLocalDescription(await pc.createAnswer());
        await gathered(pc);
        if (links.current.get(s.from)?.pc !== pc || !pc.localDescription) return;
        await sendSignal({ kind: 'answer', to: s.from, data: { type: 'answer', sdp: pc.localDescription.sdp } });
      } catch {
        setState(s.from, 'failed');
      }
    },
    [callPeer, drop, me, newLink, sendSignal],
  );

  useEffect(() => onSignals((list) => list.forEach((s) => void handle(s))), [handle, onSignals]);

  const stopMic = () => {
    mic.current?.getTracks().forEach((t) => t.stop());
    mic.current = null;
    for (const { pc } of links.current.values()) attachMic(pc);
    setMicOn(false);
  };

  const leave = useCallback(() => {
    if (!joinedRef.current) return;
    joinedRef.current = false;
    for (const id of [...links.current.keys()]) {
      void sendSignal({ kind: 'bye', to: id }).catch(() => {});
      drop(id);
    }
    stopMic();
    void audioCtx.current?.close().catch(() => {});
    audioCtx.current = null;
    setJoined(false);
    setSpeaking({});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drop, sendSignal]);

  const join = useCallback(async () => {
    if (joinedRef.current || !me) return;
    setJoining(true);
    const r = await fetchIceServers();
    if (r.ok && r.data.iceServers?.length) ice.current = r.data.iceServers;
    joinedRef.current = true;
    setJoined(true);
    setJoining(false);
    pollFast();
    for (const o of othersRef.current) void sendSignal({ kind: 'hello', to: o.playerId }).catch(() => {});
  }, [me, pollFast, sendSignal]);

  const toggleMic = useCallback(async () => {
    setMicError(null);
    if (mic.current) return stopMic();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true }, video: false });
      if (!joinedRef.current) {
        stream.getTracks().forEach((t) => t.stop());
        return;
      }
      mic.current = stream;
      for (const { pc } of links.current.values()) attachMic(pc);
      setMicOn(true);
    } catch {
      setMicError('Could not use your microphone. Allow microphone access for this site and try again.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setMuted = useCallback((id: string, value: boolean) => {
    mutedRef.current = { ...mutedRef.current, [id]: value };
    setMutedState(mutedRef.current);
    const link = links.current.get(id);
    if (link) link.audio.muted = value;
  }, []);

  // Voice ends with the match (or if the player is no longer seated).
  useEffect(() => {
    if (!enabled) leave();
  }, [enabled, leave]);

  // Say goodbye when the tab closes, and tidy up on unmount.
  useEffect(() => {
    const bye = () => leave();
    window.addEventListener('pagehide', bye);
    return () => {
      window.removeEventListener('pagehide', bye);
      leave();
    };
  }, [leave]);

  // A light "speaking" indicator from each player's audio level.
  useEffect(() => {
    if (!joined) return;
    const buf = new Uint8Array(256);
    const t = setInterval(() => {
      const next: Record<string, boolean> = {};
      for (const [id, link] of links.current) {
        if (!link.analyser || mutedRef.current[id]) continue;
        link.analyser.getByteTimeDomainData(buf);
        let peak = 0;
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128));
        next[id] = peak > 10;
      }
      setSpeaking((cur) => (Object.keys(next).every((k) => cur[k] === next[k]) && Object.keys(cur).every((k) => cur[k] === next[k]) ? cur : next));
    }, 200);
    return () => clearInterval(t);
  }, [joined]);

  const peers: VoicePeer[] = others
    .filter((o) => states[o.playerId])
    .map((o) => ({ playerId: o.playerId, username: o.username, state: states[o.playerId], muted: !!muted[o.playerId], speaking: !!speaking[o.playerId] }));

  return { joined, joining, micOn, micError, peers, muted, join, leave, toggleMic, setMuted };
}

export type VoiceApi = ReturnType<typeof useVoice>;
