// Ascending chime: C5 → E5 → G5 → C6
export function playAlarm(): void {
  try {
    const AudioCtx = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext
    const ctx = new AudioCtx()
    const notes = [523.25, 659.25, 783.99, 1046.5]
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.type = 'sine'
      osc.frequency.value = freq
      const start = ctx.currentTime + i * 0.18
      const end = start + 0.28
      gain.gain.setValueAtTime(0, start)
      gain.gain.linearRampToValueAtTime(0.35, start + 0.03)
      gain.gain.exponentialRampToValueAtTime(0.001, end)
      osc.start(start)
      osc.stop(end)
    })
  } catch {
    // AudioContext not available or suspended
  }
}
