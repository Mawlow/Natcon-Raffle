/**
 * Broadcast-style event audio, synthesised with the Web Audio API — except
 * two recorded tracks: the drumroll (public/audio/drumroll.mp3) and the
 * winner fanfare (public/audio/winner-fanfare.mp3). Each falls back to its
 * synthesised version if it cannot be loaded. No autoplay surprises. The context is only created
 * after a user gesture (the START RAFFLE button), which is what browsers
 * require.
 *
 * What keeps it from sounding like an arcade game: every cue is layered rather
 * than a single oscillator, transients are filtered noise instead of square
 * waves, everything feeds a generated hall reverb, and the whole bus runs
 * through a compressor so the big moments land loud without clipping.
 *
 * Plain JS on purpose — `useSound.js` is the React wrapper, and keeping the
 * synthesis out of the hook means it can be driven by a stub AudioContext.
 */

/** Master bus level, ahead of the compressor. */
const MASTER_GAIN = 0.9;

/** The recorded winner fanfare, and its level on the output. */
const FANFARE_URL = '/audio/winner-fanfare.mp3';
const FANFARE_GAIN = 0.95;

/**
 * The recorded drumroll: a steady roll that ends in a cymbal crash at 4.26s.
 * The roll is looped between LOOP_START and LOOP_END for as long as the
 * draw spins, and the crash is played from CRASH_AT the moment the winning
 * ticket lands, so the hit falls on the reveal however long the spin ran.
 */
const DRUMROLL_URL = '/audio/drumroll.mp3';
const DRUMROLL_GAIN = 0.9;
const DRUMROLL = { rollFrom: 0.05, loopStart: 0.4, loopEnd: 4.1, crashAt: 4.24 };

/** A decaying-noise impulse response: a mid-sized hall, not a bathroom. */
function buildImpulseResponse(ctx, seconds = 2.8, decay = 2.6) {
    const rate = ctx.sampleRate;
    const length = Math.floor(rate * seconds);
    const impulse = ctx.createBuffer(2, length, rate);

    for (let channel = 0; channel < 2; channel++) {
        const samples = impulse.getChannelData(channel);

        for (let i = 0; i < length; i++) {
            const progress = i / length;
            // Independent noise per channel is what gives the tail its width.
            samples[i] = (Math.random() * 2 - 1) * (1 - progress) ** decay;
        }

        // A few early reflections stop it sounding like a wash of noise.
        [0.013, 0.021, 0.037].forEach((offset, index) => {
            const tap = Math.floor(rate * (offset + channel * 0.002));
            if (tap < length) samples[tap] += 0.5 / (index + 1);
        });
    }

    return impulse;
}

/** One second of white noise, reused by every noise layer. */
function buildNoiseBuffer(ctx) {
    const buffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const samples = buffer.getChannelData(0);

    for (let i = 0; i < samples.length; i++) {
        samples[i] = Math.random() * 2 - 1;
    }

    return buffer;
}

export function createAudioEngine() {
    let ctx = null;
    let graph = null;
    let unlocked = false;
    // The drumroll under the roll, held so it can be cut on reveal.
    let bed = null;
    // The decoded fanfare (null until loaded, or if it failed) and the
    // playback currently sounding, so the next roll can fade it out.
    let fanfareBuffer = null;
    let fanfare = null;
    let drumrollBuffer = null;

    // Tracks are fetched and decoded once, in the background: a slow network
    // never holds up the start of the show. null means "use the synth".
    async function loadTrack(context, url) {
        try {
            const response = await fetch(url);
            if (!response.ok) return null;
            return await context.decodeAudioData(await response.arrayBuffer());
        } catch {
            return null;
        }
    }

    async function unlock() {
        try {
            if (!ctx) {
                const Ctx = globalThis.AudioContext || globalThis.webkitAudioContext;
                if (!Ctx) return false;

                const context = new Ctx();

                //  dry ──────────────┐
                //                    ├─→ master → compressor → out
                //  send → reverb ────┘
                const master = context.createGain();
                master.gain.value = MASTER_GAIN;

                const compressor = context.createDynamicsCompressor();
                compressor.threshold.setValueAtTime(-15, context.currentTime);
                compressor.knee.setValueAtTime(22, context.currentTime);
                compressor.ratio.setValueAtTime(5, context.currentTime);
                compressor.attack.setValueAtTime(0.004, context.currentTime);
                compressor.release.setValueAtTime(0.28, context.currentTime);

                master.connect(compressor).connect(context.destination);

                const reverb = context.createConvolver();
                reverb.buffer = buildImpulseResponse(context);

                const reverbReturn = context.createGain();
                reverbReturn.gain.value = 0.9;
                reverb.connect(reverbReturn).connect(master);

                ctx = context;
                graph = { master, reverb, noise: buildNoiseBuffer(context) };
                loadTrack(context, FANFARE_URL).then((buffer) => { fanfareBuffer = buffer; });
                loadTrack(context, DRUMROLL_URL).then((buffer) => { drumrollBuffer = buffer; });
            }

            if (ctx.state === 'suspended') {
                // A machine with no audio output can leave resume() pending
                // forever. The show must start regardless, so never wait on it
                // for more than a moment.
                await Promise.race([
                    ctx.resume(),
                    new Promise((resolve) => setTimeout(resolve, 1200)),
                ]);
            }

            unlocked = ctx.state === 'running';
            return unlocked;
        } catch {
            return false;
        }
    }

    /**
     * One synth voice: an oscillator (optionally a detuned pair) through a
     * filter and an envelope, into both the dry bus and the reverb.
     */
    function voice(options) {
        if (!ctx || !graph) return;

        const {
            freq,
            type = 'sine',
            attack = 0.008,
            duration = 0.4,
            gain = 0.2,
            delay = 0,
            sweepTo = null,
            detune = 0,
            filter = null,
            filterTo = null,
            filterType = 'lowpass',
            q = 0.9,
            send = 0.25,
        } = options;

        const start = ctx.currentTime + delay;
        const end = start + duration;

        // Two detuned oscillators sum into one gain node, so the level is
        // shared between them and `gain` keeps meaning peak level.
        const oscillators = detune === 0 ? 1 : 2;

        const amp = ctx.createGain();
        amp.gain.setValueAtTime(0.0001, start);
        amp.gain.exponentialRampToValueAtTime(Math.max(gain / oscillators, 0.0002), start + attack);
        amp.gain.exponentialRampToValueAtTime(0.0001, end);

        let node = amp;

        if (filter !== null) {
            const biquad = ctx.createBiquadFilter();
            biquad.type = filterType;
            biquad.Q.value = q;
            biquad.frequency.setValueAtTime(filter, start);
            if (filterTo !== null) biquad.frequency.exponentialRampToValueAtTime(filterTo, end);
            amp.connect(biquad);
            node = biquad;
        }

        node.connect(graph.master);

        if (send > 0) {
            const sendGain = ctx.createGain();
            sendGain.gain.value = send;
            node.connect(sendGain).connect(graph.reverb);
        }

        // A detuned pair reads as an ensemble rather than one thin tone.
        const spreads = detune === 0 ? [0] : [-detune, detune];

        spreads.forEach((cents) => {
            const osc = ctx.createOscillator();
            osc.type = type;
            osc.detune.value = cents;
            osc.frequency.setValueAtTime(freq, start);
            if (sweepTo) osc.frequency.exponentialRampToValueAtTime(sweepTo, end);
            osc.connect(amp);
            osc.start(start);
            osc.stop(end + 0.08);
            osc.onended = () => osc.disconnect();
        });
    }

    /** A burst of filtered noise: transients, swells and crashes. */
    function noise(options) {
        if (!ctx || !graph) return;

        const {
            attack = 0.004,
            duration = 0.3,
            gain = 0.12,
            delay = 0,
            filter = 1800,
            filterTo = null,
            filterType = 'bandpass',
            q = 0.8,
            send = 0.3,
        } = options;

        const start = ctx.currentTime + delay;
        const end = start + duration;

        const source = ctx.createBufferSource();
        source.buffer = graph.noise;
        source.loop = true;

        const biquad = ctx.createBiquadFilter();
        biquad.type = filterType;
        biquad.Q.value = q;
        biquad.frequency.setValueAtTime(filter, start);
        if (filterTo !== null) biquad.frequency.exponentialRampToValueAtTime(filterTo, end);

        const amp = ctx.createGain();
        amp.gain.setValueAtTime(0.0001, start);
        amp.gain.exponentialRampToValueAtTime(Math.max(gain, 0.0002), start + attack);
        amp.gain.exponentialRampToValueAtTime(0.0001, end);

        source.connect(biquad).connect(amp).connect(graph.master);

        if (send > 0) {
            const sendGain = ctx.createGain();
            sendGain.gain.value = send;
            amp.connect(sendGain).connect(graph.reverb);
        }

        source.start(start);
        source.stop(end + 0.05);
        source.onended = () => {
            source.disconnect();
            amp.disconnect();
            biquad.disconnect();
        };
    }

    /** Release the tension bed, if one is running. */
    function stopBed(release = 0.35) {
        if (!ctx || !bed) return;

        const running = bed;
        bed = null;
        const now = ctx.currentTime;

        running.gains.forEach((gain) => {
            try {
                gain.gain.cancelScheduledValues(now);
                gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0002), now);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
            } catch {
                /* The node may already have ended. */
            }
        });

        running.sources.forEach((source) => {
            try {
                source.stop(now + release + 0.05);
            } catch {
                /* Already stopped. */
            }
        });
    }

    /**
     * The drumroll under the roll: a snare roll of filtered-noise strokes that
     * tightens and swells across `duration`, over a low tom rumble. Strokes
     * are scheduled a little past `duration` because the roll only ends when
     * the winning ticket lands; the reveal cuts it off.
     */
    function startSynthRoll(duration) {
        const start = ctx.currentTime;
        const swell = Math.max(duration, 1.5);
        const total = swell + 5;
        const gains = [];
        const sources = [];

        // Every stroke feeds one bus, so the whole roll can be cut at once.
        const bus = ctx.createGain();
        bus.gain.value = 1;
        bus.connect(graph.master);
        const busSend = ctx.createGain();
        busSend.gain.value = 0.22;
        bus.connect(busSend).connect(graph.reverb);
        gains.push(bus);

        // 1. Snare strokes, alternating hands: ~11 per second opening up to
        //    ~26, softly accented, getting louder all the way.
        let t = 0;
        let stroke = 0;
        while (t < total) {
            const progress = Math.min(t / swell, 1);
            const rate = 11 + progress * 15;
            const level = (0.05 + progress ** 1.6 * 0.17) * (stroke % 2 === 0 ? 1 : 0.82) * (0.9 + Math.random() * 0.2);
            const when = start + t;

            const source = ctx.createBufferSource();
            source.buffer = graph.noise;
            // Start each stroke somewhere different in the noise buffer so
            // no two sound identical.
            const offset = Math.random() * 0.8;

            const body = ctx.createBiquadFilter();
            body.type = 'bandpass';
            body.frequency.value = 1900 + Math.random() * 500;
            body.Q.value = 0.7;

            const amp = ctx.createGain();
            amp.gain.setValueAtTime(0.0001, when);
            amp.gain.exponentialRampToValueAtTime(Math.max(level, 0.0002), when + 0.003);
            amp.gain.exponentialRampToValueAtTime(0.0001, when + 0.09);

            source.connect(body).connect(amp).connect(bus);
            source.start(when, offset, 0.12);
            source.onended = () => {
                source.disconnect();
                body.disconnect();
                amp.disconnect();
            };
            sources.push(source);

            t += 1 / rate;
            stroke++;
        }

        // 2. Tom rumble underneath — felt more than heard, rising with the roll.
        const rumble = ctx.createOscillator();
        rumble.type = 'sine';
        rumble.frequency.setValueAtTime(62, start);
        rumble.frequency.linearRampToValueAtTime(78, start + swell);

        const rumbleTremolo = ctx.createOscillator();
        rumbleTremolo.frequency.setValueAtTime(11, start);
        rumbleTremolo.frequency.linearRampToValueAtTime(24, start + swell);
        const tremoloDepth = ctx.createGain();
        tremoloDepth.gain.value = 0.04;

        const rumbleGain = ctx.createGain();
        rumbleGain.gain.setValueAtTime(0.0001, start);
        rumbleGain.gain.exponentialRampToValueAtTime(0.1, start + swell);

        rumbleTremolo.connect(tremoloDepth).connect(rumbleGain.gain);
        rumble.connect(rumbleGain).connect(bus);
        rumble.start(start);
        rumbleTremolo.start(start);
        rumble.stop(start + total);
        rumbleTremolo.stop(start + total);

        gains.push(rumbleGain);
        sources.push(rumble, rumbleTremolo);

        bed = { gains, sources };
    }

    /** The recorded roll, looped until the reveal cuts to its crash. */
    function startRecordedRoll() {
        const source = ctx.createBufferSource();
        source.buffer = drumrollBuffer;
        source.loop = true;
        source.loopStart = DRUMROLL.loopStart;
        source.loopEnd = DRUMROLL.loopEnd;

        const gain = ctx.createGain();
        gain.gain.value = DRUMROLL_GAIN;

        source.connect(gain).connect(ctx.destination);
        source.start(ctx.currentTime, DRUMROLL.rollFrom);

        bed = { gains: [gain], sources: [source], recorded: true };
    }

    /** The roll under the draw: the recorded one when loaded, else the synth. */
    function startBed(duration = 6) {
        if (!ctx || !graph) return;

        stopBed(0.1);
        stopFanfare(0.5);

        if (drumrollBuffer) {
            startRecordedRoll();
        } else {
            startSynthRoll(duration);
        }
    }

    /**
     * End the roll on the reveal. A recorded roll hands over to its own
     * crash, cross-faded so the loop doesn't click; the synth just stops.
     */
    function endRoll() {
        if (!ctx) return;

        if (bed?.recorded && drumrollBuffer) {
            stopBed(0.04);

            const crash = ctx.createBufferSource();
            crash.buffer = drumrollBuffer;

            const gain = ctx.createGain();
            gain.gain.value = DRUMROLL_GAIN;

            crash.connect(gain).connect(ctx.destination);
            crash.start(ctx.currentTime, DRUMROLL.crashAt);
            crash.onended = () => {
                crash.disconnect();
                gain.disconnect();
            };
            return;
        }

        stopBed(0.12);
    }

    /** Fade out the fanfare, if it is still playing. */
    function stopFanfare(release = 0.5) {
        if (!ctx || !fanfare) return;

        const { source, gain } = fanfare;
        fanfare = null;
        const now = ctx.currentTime;

        try {
            gain.gain.cancelScheduledValues(now);
            gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0002), now);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + release);
            source.stop(now + release + 0.05);
        } catch {
            /* Already finished. */
        }
    }

    /** The recorded fanfare, straight to the output: it is already mastered. */
    function playFanfare() {
        if (!ctx || !fanfareBuffer) return false;

        stopFanfare(0.15);

        const source = ctx.createBufferSource();
        source.buffer = fanfareBuffer;

        const gain = ctx.createGain();
        gain.gain.value = FANFARE_GAIN;

        source.connect(gain).connect(ctx.destination);
        source.start();

        const playing = { source, gain };
        fanfare = playing;
        source.onended = () => {
            source.disconnect();
            gain.disconnect();
            if (fanfare === playing) fanfare = null;
        };

        return true;
    }

    function play(name, options = {}) {
        if (!unlocked) return;

        switch (name) {
            // A soft broadcast pip: a tone with its octave, and a tail.
            case 'countdown':
                voice({ freq: 440, type: 'sine', duration: 0.5, gain: 0.16, attack: 0.006, send: 0.45 });
                voice({ freq: 880, type: 'sine', duration: 0.28, gain: 0.05, attack: 0.004, send: 0.4 });
                noise({ duration: 0.09, gain: 0.03, filter: 2400, q: 1.6, send: 0.3 });
                break;

            // The last pip sits a fifth up, rings longer and carries a sub.
            case 'countdown-final':
                voice({ freq: 660, type: 'sine', duration: 0.9, gain: 0.2, attack: 0.005, send: 0.6 });
                voice({ freq: 1320, type: 'sine', duration: 0.45, gain: 0.06, attack: 0.004, send: 0.5 });
                voice({ freq: 165, type: 'sine', duration: 0.7, gain: 0.12, attack: 0.008, send: 0.2 });
                break;

            // Each digit change: a dry mechanical flap, not a beep. Silent
            // under the drumroll, which already carries the rhythm.
            case 'tick':
                if (bed) break;
                noise({ duration: 0.035, gain: 0.05, attack: 0.001, filter: 2600, filterTo: 900, q: 1.1, send: 0.06 });
                voice({ freq: 180, type: 'sine', duration: 0.045, gain: 0.035, attack: 0.001, send: 0.04 });
                break;

            case 'drawing':
                startBed(options.duration ?? 6);
                break;

            // The roll's cymbal crash, on the moment the winning ticket lands.
            case 'roll-end':
                endRoll();
                break;

            // The reveal: a synthesised hit — sub drop, brass stack, cymbal
            // swell. The last winner of a raffle ({ final: true }) gets the
            // recorded fanfare instead, falling back to the hit if the track
            // could not be loaded.
            case 'winner':
                endRoll();
                if (options.final && playFanfare()) break;

                voice({ freq: 110, type: 'sine', duration: 1.4, gain: 0.42, attack: 0.004, sweepTo: 46, send: 0.12 });

                [220, 330, 440].forEach((freq, index) => {
                    voice({
                        freq,
                        type: 'sawtooth',
                        duration: 1.8 - index * 0.2,
                        gain: 0.1 - index * 0.015,
                        attack: 0.012,
                        detune: 9,
                        filter: 900,
                        filterTo: 3400,
                        send: 0.4,
                    });
                });

                noise({ duration: 1.9, gain: 0.1, attack: 0.006, filter: 5200, filterTo: 1400, filterType: 'highpass', q: 0.6, send: 0.55 });
                break;

            // Afterglow: a warm chord under a scatter of high sparkles. The
            // fanfare is its own celebration, so this only fills in for it.
            case 'celebrate':
                if (fanfare) break;
                [261.63, 329.63, 392, 523.25].forEach((freq, index) => {
                    voice({
                        freq,
                        type: 'triangle',
                        duration: 2.6,
                        gain: 0.055,
                        attack: 0.09,
                        delay: 0.3 + index * 0.04,
                        detune: 6,
                        filter: 2600,
                        send: 0.6,
                    });
                });

                for (let i = 0; i < 14; i++) {
                    voice({
                        freq: 1046.5 * (1 + Math.floor(Math.random() * 4) * 0.25),
                        type: 'sine',
                        duration: 0.5 + Math.random() * 0.5,
                        gain: 0.028,
                        attack: 0.004,
                        delay: 0.35 + Math.random() * 1.3,
                        send: 0.75,
                    });
                }
                break;

            default:
                break;
        }
    }

    /** Cut anything still sounding — used when a sequence is abandoned. */
    function stop() {
        stopBed(0.25);
    }

    /** Silence everything, the fanfare included — the mute button. */
    function stopAll() {
        stopBed(0.2);
        stopFanfare(0.3);
    }

    function close() {
        try {
            ctx?.close?.();
        } catch {
            /* Already closed. */
        }

        ctx = null;
        graph = null;
        bed = null;
        fanfare = null;
        fanfareBuffer = null;
        drumrollBuffer = null;
        unlocked = false;
    }

    return { unlock, play, stop, stopAll, close, isUnlocked: () => unlocked };
}
