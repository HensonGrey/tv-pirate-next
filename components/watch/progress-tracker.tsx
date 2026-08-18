'use client';

import { useEffect, useRef, type RefObject } from 'react';
import { useMediaRemote, useMediaState } from '@vidstack/react';
import { saveProgress } from '@/lib/api/browser';
import type { MediaType } from '@/lib/tmdb/types';

/** Heartbeat and resume plumbing for the player it lives inside. The parent keys
 * one instance per season/episode and renders it only while the resolved stream
 * matches the picker, so its props never change mid-mount and a flush cannot
 * credit the wrong row. see: docs/decisions/watch-progress.md#cadence */
interface ProgressTrackerProps {
    tmdbId: number;
    mediaType: MediaType;
    season?: number;
    episode?: number;
    /** Seek target for this mount; consumed once the stream is ready. */
    resumeTarget: number | null;
    onResumeConsumed: () => void;
    /** Live position — a provider switch remounts the player and continues here. */
    lastPositionRef: RefObject<number>;
}

const HEARTBEAT_MS = 60_000;
const MIN_DELTA_S = 5;
/** A single jump bigger than this is a seek, not playback — flush it. */
const SEEK_JUMP_S = 30;

export default function ProgressTracker({
    tmdbId,
    mediaType,
    season,
    episode,
    resumeTarget,
    onResumeConsumed,
    lastPositionRef,
}: ProgressTrackerProps) {
    const remote = useMediaRemote();
    const currentTime = useMediaState('currentTime');
    const duration = useMediaState('duration');
    const paused = useMediaState('paused');
    const ended = useMediaState('ended');
    const canPlay = useMediaState('canPlay');

    // Refs mirror the media state so the interval and the unmount cleanup read
    // fresh values without re-subscribing.
    const currentTimeRef = useRef(0);
    currentTimeRef.current = currentTime;
    const durationRef = useRef(0);
    durationRef.current = duration;
    const pausedRef = useRef(true);
    pausedRef.current = paused;
    const lastSentRef = useRef(0);

    function send() {
        const now = Math.floor(currentTimeRef.current);
        // No metadata yet, or a sub-5s position: junk rows are noise.
        if (durationRef.current <= 0 || now < 5) return;
        if (Math.abs(now - lastSentRef.current) < MIN_DELTA_S) return;
        lastSentRef.current = now;
        saveProgress({
            tmdbId,
            mediaType,
            season,
            episode,
            progressSeconds: now,
            durationSeconds: Math.floor(durationRef.current),
        }).catch(() => {
            // A lost heartbeat is harmless — the next one overwrites it.
        });
    }
    const sendRef = useRef(send);
    sendRef.current = send;

    // One write per active minute; the flush points below cover everything between.
    useEffect(() => {
        const id = setInterval(() => {
            if (pausedRef.current) return;
            sendRef.current();
        }, HEARTBEAT_MS);
        return () => clearInterval(id);
    }, []);

    // Pause is a deliberate "stop here".
    useEffect(() => {
        if (paused) sendRef.current();
    }, [paused]);

    // Episode end: the final position is the row's natural resting place.
    useEffect(() => {
        if (ended) sendRef.current();
    }, [ended]);

    // Playback moves seconds at a time, so a 30s+ jump is the user dragging the
    // bar (or our own resume seek).
    const prevTimeRef = useRef(0);
    useEffect(() => {
        if (Math.abs(currentTime - prevTimeRef.current) > SEEK_JUMP_S) sendRef.current();
        prevTimeRef.current = currentTime;
    }, [currentTime]);

    // Unmount flush: closing the page or switching episode credits the row this
    // instance was created for.
    useEffect(() => {
        return () => sendRef.current();
    }, []);

    // One per mount: with no resume pending, a provider switch (which remounts the
    // whole player) continues from the live position instead of snapping to zero.
    const seekedRef = useRef(false);
    useEffect(() => {
        if (!canPlay || seekedRef.current) return;
        seekedRef.current = true;
        if (lastPositionRef.current > 0) remote.seek(lastPositionRef.current);
    }, [canPlay, remote, lastPositionRef]);

    // A pending resume target always wins, on first mount or when it arrives while
    // the stream is already playing.
    useEffect(() => {
        if (!canPlay || resumeTarget == null) return;
        onResumeConsumed();
        remote.seek(resumeTarget);
    }, [canPlay, resumeTarget, onResumeConsumed, remote]);

    // Keep the parent's live position warm for the next provider switch.
    useEffect(() => {
        if (currentTime > 0) lastPositionRef.current = currentTime;
    }, [currentTime, lastPositionRef]);

    return null;
}
