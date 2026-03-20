const parseCsv = (value, fallback = []) => {
    if (typeof value !== 'string' || !value.trim()) {
        return fallback;
    }
    return value
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean);
};

export const createPeerConnection = () => {
    const stunServers = parseCsv(import.meta.env.VITE_STUN_SERVERS, ['stun:stun.l.google.com:19302']);
    const turnServers = parseCsv(import.meta.env.VITE_TURN_URLS);
    const turnUsername = import.meta.env.VITE_TURN_USERNAME;
    const turnCredential = import.meta.env.VITE_TURN_CREDENTIAL;

    const iceServers = stunServers.map((url) => ({ urls: url }));

    if (turnServers.length > 0) {
        iceServers.push({
            urls: turnServers,
            username: turnUsername,
            credential: turnCredential
        });
    }

    const configuration = {
        iceServers,
        iceTransportPolicy: import.meta.env.VITE_ICE_TRANSPORT_POLICY || 'all',
        bundlePolicy: import.meta.env.VITE_BUNDLE_POLICY || 'balanced'
    };

    return new RTCPeerConnection(configuration);
};

export const createOffer = async (peerConnection) => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    return offer;
};

export const createAnswer = async (peerConnection, offer) => {
    await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
    const answer = await peerConnection.createAnswer();
    await peerConnection.setLocalDescription(answer);
    return answer;
};

export const addIceCandidate = async (peerConnection, candidate) => {
    if (candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    }
};
