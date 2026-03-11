export const createPeerConnection = () => {
    const configuration = {
        iceServers: [
            {
                urls: 'stun:stun.l.google.com:19302'
            }
        ]
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
