const counters = new Map();

const nowIso = () => new Date().toISOString();

export const incrementMetric = (name, amount = 1) => {
    const current = counters.get(name) || 0;
    const next = current + amount;
    counters.set(name, next);
    return next;
};

export const getMetricsSnapshot = () => {
    return Object.fromEntries(counters.entries());
};

export const logTelemetry = (event, payload = {}, level = 'info') => {
    const entry = {
        ts: nowIso(),
        level,
        event,
        payload
    };

    const serialized = JSON.stringify(entry);
    if (level === 'error') {
        console.error(serialized);
        return;
    }

    if (level === 'warn') {
        console.warn(serialized);
        return;
    }

    console.log(serialized);
};
