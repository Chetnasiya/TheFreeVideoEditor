# Audio Architecture & Processing Guide (Gate N)

This document specifies the audio architecture for **TheFreeVideoEditor**, detailing pure audio mathematics, the shared `AudioGraph` builder, offline rendering pipeline, mixing controls, and real-time playback integration.

---

## 1. Mathematical Foundations & Pan Law

### Decibels and Linear Amplitude Gain

Gain calculations are bounded between $-96\text{ dB}$ (digital silence floor) and $+24\text{ dB}$ (maximum gain ceiling):
$$\text{gain}(dB) = \begin{cases} 0 & \text{if } dB \le -96 \\ 10^{\frac{\min(24, dB)}{20}} & \text{otherwise} \end{cases}$$

$$\text{dB}(\text{gain}) = \begin{cases} -96 & \text{if } \text{gain} \le 10^{-96/20} \approx 0.00001585 \\ \max(-96, \min(24, 20 \log_{10}(\text{gain}))) & \text{otherwise} \end{cases}$$

### Constant-Power Stereo Pan Law

For pan $p \in [-1, 1]$:
$$\theta = \frac{\pi}{4}(p + 1)$$
$$G_L = \cos(\theta), \quad G_R = \sin(\theta)$$

- **Center ($p = 0$):** $\theta = \frac{\pi}{4} \implies G_L = G_R = \frac{\sqrt{2}}{2} \approx 0.7071$ ($-3.01\text{ dB}$ center attenuation).
- **Hard Left ($p = -1$):** $\theta = 0 \implies G_L = 1, G_R = 0$.
- **Hard Right ($p = 1$):** $\theta = \frac{\pi}{2} \implies G_L = 0, G_R = 1$.
- **Invariant:** $G_L^2 + G_R^2 = 1.0$ across all pan settings.

### Fades & Envelopes

Clip-level fade in ($T_{in}$) and fade out ($T_{out}$) over duration $T$:

- **Equal-Power Curve ($\sin/\cos$):**
  $$G_{in}(t) = \sin\left(\frac{\pi t}{2 T_{in}}\right), \quad G_{out}(t) = \sin\left(\frac{\pi (T - t)}{2 T_{out}}\right)$$
- **Linear Curve:**
  $$G_{in}(t) = \frac{t}{T_{in}}, \quad G_{out}(t) = \frac{T - t}{T_{out}}$$

---

## 2. Shared AudioGraph Architecture

The shared `AudioGraph` builder (`src/editor/services/audio/graph.ts`) constructs isomorphic node graphs in both preview (`AudioContext`) and export (`OfflineAudioContext`):

```
Clip Source (Buffer / Element)
      │
      ▼
GainNode (Clip Volume dB Automation + Fades)
      │
      ▼
StereoPannerNode (Clip Pan Automation)
      │
      ▼
Track Input GainNode
      │
      ▼
BiquadFilterNodes (4-band Parametric EQ: LowShelf, Peaking, Peaking, HighShelf)
      │
      ▼
DynamicsCompressorNode (Track Dynamics)
      │
      ▼
GainNode (Track Fader dB)
      │
      ▼
StereoPannerNode (Track Pan)
      │
      ▼
GainNode (Mute / Solo Gate: 1.0 or 0.0)
      │
      ▼
Track AnalyserNodes (Peak & RMS ballistics)
      │
      ▼
Master Input GainNode
      │
      ▼
GainNode (Master Fader dB)
      │
      ▼
DynamicsCompressorNode (Master Limiter: Threshold -0.5 dBFS)
      │
      ▼
Master AnalyserNodes (Peak & RMS ballistics)
      │
      ▼
Destination (AudioContext.destination / OfflineAudioContext.destination)
```

---

## 3. Solo / Mute Truth Table

When resolving audible audio tracks (`resolveAudibleTracks`):

1. If **any** audio track has `solo === true`:
   - A track is audible **if and only if** `solo === true` AND `muted === false`.
2. If **no** audio track has `solo === true`:
   - A track is audible **if and only if** `muted === false`.

---

## 4. Offline Rendering & Memory Caps

- Single-pass `OfflineAudioContext` is used for total frame counts $\le 32\text{M}$ samples ($\approx 256\text{ MB}$ in 32-bit float stereo, $\approx 11.1$ minutes at $48\text{ kHz}$).
- For longer timelines exceeding 256 MB, the offline renderer splits playback into overlapping chunks with $\ge 1.0\text{ s}$ pre-roll to let IIR filters and compressors settle, eliminating seam artifacts ($< -60\text{ dBFS}$).

---

## 5. Keyboard Shortcuts

- `Alt+M` (`⌥M`): Toggle Audio Mixer panel.
- `Alt+0` (`⌥0`): Reset active track/master fader to $0\text{ dB}$.
- `Alt+Shift+M` (`⌥⇧M`): Toggle mute on selected audio track.
- `Alt+Shift+S` (`⌥⇧S`): Toggle solo on selected audio track.
