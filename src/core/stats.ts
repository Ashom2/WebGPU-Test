/**
 * Returns a `record(now, timings)` function. Call it once per frame with named timings (ms);
 * it averages them and refreshes the overlay a few times a second, along with FPS.
 */
export function createStatsOverlay(el: HTMLElement | null, interval = 250) {
    const sums: Record<string, number> = {};
    let frames = 0;
    let lastShown = 0;

    return function record(now: number, timings: Record<string, number>): void {
        for (const [name, ms] of Object.entries(timings)) {
            sums[name] = (sums[name] ?? 0) + ms;
        }
        frames++;

        const elapsed = now - lastShown;
        if (elapsed < interval) return;

        if (el) {
            const lines = Object.entries(sums).map(
                ([name, total]) => `${name.padEnd(7)} ${(total / frames).toFixed(2)} ms`,
            );
            lines.push(`${'FPS'.padEnd(7)} ${((frames * 1000) / elapsed).toFixed(0)}`);
            el.textContent = lines.join('\n');
        }

        for (const name in sums) sums[name] = 0;
        frames = 0;
        lastShown = now;
    };
}