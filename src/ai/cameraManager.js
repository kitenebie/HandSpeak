export class CameraManager {
    constructor() {
        this.stream = null;
        this.videoElement = null;
    }

    async start(videoElement) {
        this.videoElement = videoElement;
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'user',
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                }
            });
            
            this.videoElement.srcObject = this.stream;
            
            return new Promise((resolve, reject) => {
                this.videoElement.onloadeddata = () => {
                    resolve();
                };
                this.videoElement.onerror = (e) => {
                    reject(e);
                };
            });
            
        } catch (error) {
            if (error.name === 'NotAllowedError') {
                throw 'PERMISSION_DENIED';
            } else if (error.name === 'NotFoundError') {
                throw 'NOT_FOUND';
            } else {
                throw 'GENERAL_ERROR';
            }
        }
    }

    stop() {
        if (this.stream) {
            this.stream.getTracks().forEach(track => track.stop());
            this.stream = null;
        }
        if (this.videoElement) {
            this.videoElement.srcObject = null;
            this.videoElement = null;
        }
    }

    isActive() {
        return this.stream !== null && this.stream.active;
    }

    getStream() {
        return this.stream;
    }
}
