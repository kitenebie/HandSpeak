import { CameraManager } from '../ai/cameraManager.js';
import { createIcons, icons } from 'lucide';

const HAND_CONNECTIONS = [[0,1],[1,2],[2,3],[3,4],[0,5],[5,6],[6,7],[7,8],[5,9],[9,10],[10,11],[11,12],[9,13],[13,14],[14,15],[15,16],[13,17],[17,18],[18,19],[19,20],[0,17]];

export function createCamera(container) {
  const el = document.createElement('div');
  el.className = 'asl-camera';
  el.innerHTML = `
    <div class="asl-camera__viewport">
      <video class="asl-camera__video" autoplay playsinline muted></video>
      <canvas class="asl-camera__canvas"></canvas>
      <div class="asl-camera__fullscreen-prompt" hidden></div>
      <div class="asl-camera__fullscreen-feedback" hidden aria-live="polite"></div>
      <div class="asl-camera__countdown" hidden aria-live="assertive"></div>
      <button class="asl-camera__fullscreen-btn" type="button" aria-label="Expand camera" aria-pressed="false" title="Expand camera">
        <i data-lucide="maximize-2"></i>
      </button>
      <div class="asl-camera__error" style="display:none"></div>
    </div>
    <div class="asl-camera__status">Camera: Inactive</div>
  `;
  container.appendChild(el);

  const viewport = el.querySelector('.asl-camera__viewport');
  const video = el.querySelector('.asl-camera__video');
  const canvas = el.querySelector('.asl-camera__canvas');
  const fullscreenPrompt = el.querySelector('.asl-camera__fullscreen-prompt');
  const fullscreenFeedback = el.querySelector('.asl-camera__fullscreen-feedback');
  const countdownDiv = el.querySelector('.asl-camera__countdown');
  const fullscreenBtn = el.querySelector('.asl-camera__fullscreen-btn');
  const errorDiv = el.querySelector('.asl-camera__error');
  const statusDiv = el.querySelector('.asl-camera__status');
  const ctx = canvas.getContext('2d');
  
  let manager = null;
  let fallbackExpanded = false;

  const isExpanded = () => document.fullscreenElement === viewport || fallbackExpanded;
  const renderFullscreenButton = () => {
    const expanded = isExpanded();
    fullscreenBtn.innerHTML = `<i data-lucide="${expanded ? 'minimize-2' : 'maximize-2'}"></i>`;
    fullscreenBtn.setAttribute('aria-label', expanded ? 'Exit full screen camera' : 'Expand camera');
    fullscreenBtn.setAttribute('aria-pressed', String(expanded));
    fullscreenBtn.title = expanded ? 'Exit full screen camera' : 'Expand camera';
    createIcons({ icons });
  };
  const exitExpanded = async () => {
    if (document.fullscreenElement === viewport && document.exitFullscreen) {
      await document.exitFullscreen();
      return;
    }
    fallbackExpanded = false;
    viewport.classList.remove('asl-camera__viewport--expanded');
    renderFullscreenButton();
  };
  const enterExpanded = async () => {
    if (viewport.requestFullscreen) {
      await viewport.requestFullscreen();
      return;
    }
    fallbackExpanded = true;
    viewport.classList.add('asl-camera__viewport--expanded');
    renderFullscreenButton();
  };
  const toggleExpanded = async () => {
    try {
      if (isExpanded()) {
        await exitExpanded();
      } else {
        await enterExpanded();
      }
    } catch {
      fallbackExpanded = !fallbackExpanded;
      viewport.classList.toggle('asl-camera__viewport--expanded', fallbackExpanded);
      renderFullscreenButton();
    }
  };
  const handleFullscreenChange = () => {
    if (document.fullscreenElement !== viewport) {
      fallbackExpanded = false;
      viewport.classList.remove('asl-camera__viewport--expanded');
    }
    renderFullscreenButton();
  };

  fullscreenBtn.addEventListener('click', toggleExpanded);
  document.addEventListener('fullscreenchange', handleFullscreenChange);
  renderFullscreenButton();

  return {
    async start() {
      try {
        errorDiv.style.display = 'none';
        manager = new CameraManager();
        await manager.start(video);
        statusDiv.textContent = 'Camera Status: ● Active';
      } catch (err) {
        let msg = 'Error accessing camera';
        if (err === 'PERMISSION_DENIED' || err?.name === 'NotAllowedError') {
          msg = 'Camera access is required.<br><br>Please allow camera permission in your browser settings.';
        } else if (err === 'NOT_FOUND' || err?.name === 'NotFoundError') {
          msg = 'No camera detected.<br><br>Please connect a webcam and try again.';
        } else if (typeof err === 'string') {
          msg = err;
        } else if (err?.message) {
          msg = err.message;
        }
        this.showError(msg);
        statusDiv.textContent = 'Camera: Error';
        throw err;
      }
    },
    stop() {
      if (manager) {
        manager.stop();
        statusDiv.textContent = 'Camera: Inactive';
      }
    },
    getVideoElement() {
      return video;
    },
    getCanvasElement() {
      return canvas;
    },
    drawLandmarks(landmarks) {
      if (video.videoWidth === 0 || video.videoHeight === 0) return;
      
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      this.clearCanvas();
      
      const width = canvas.width;
      const height = canvas.height;
      
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#8B83FF';
      ctx.fillStyle = '#6C63FF';
      
      for (const [startIdx, endIdx] of HAND_CONNECTIONS) {
        const start = landmarks[startIdx];
        const end = landmarks[endIdx];
        if (!start || !end) continue;
        
        ctx.beginPath();
        ctx.moveTo(start.x * width, start.y * height);
        ctx.lineTo(end.x * width, end.y * height);
        ctx.stroke();
      }
      
      for (const landmark of landmarks) {
        ctx.beginPath();
        ctx.arc(landmark.x * width, landmark.y * height, 6, 0, 2 * Math.PI);
        ctx.fill();
      }
    },
    drawWordLandmarks({ hands = [], pose = null, handConnections = [], poseConnections = [] }) {
      if (video.videoWidth === 0 || video.videoHeight === 0) return;

      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      this.clearCanvas();
      const width = canvas.width;
      const height = canvas.height;

      const drawSet = (landmarks, connections, stroke, fill, radius) => {
        if (!landmarks?.length) return;
        ctx.lineWidth = 2;
        ctx.strokeStyle = stroke;
        ctx.fillStyle = fill;
        for (const connection of connections) {
          const startIndex = connection.start ?? connection[0];
          const endIndex = connection.end ?? connection[1];
          const start = landmarks[startIndex];
          const end = landmarks[endIndex];
          if (!start || !end) continue;
          ctx.beginPath();
          ctx.moveTo(start.x * width, start.y * height);
          ctx.lineTo(end.x * width, end.y * height);
          ctx.stroke();
        }
        for (const landmark of landmarks) {
          ctx.beginPath();
          ctx.arc(landmark.x * width, landmark.y * height, radius, 0, 2 * Math.PI);
          ctx.fill();
        }
      };

      drawSet(pose, poseConnections, 'rgba(69, 205, 154, 0.85)', '#2fbf8f', 3);
      hands.forEach((landmarks, index) => {
        const palette = index % 2 === 0
          ? ['#8B83FF', '#6C63FF']
          : ['#FF9F68', '#F47B3C'];
        drawSet(landmarks, handConnections, palette[0], palette[1], 5);
      });
    },
    clearCanvas() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
    },
    showError(message) {
      errorDiv.style.display = 'flex';
      errorDiv.innerHTML = `
        <div>${message}</div>
        <button class="asl-btn asl-btn--primary" id="camera-retry-btn" style="margin-top: 1rem;">Try Again</button>
      `;
      const retryBtn = errorDiv.querySelector('#camera-retry-btn');
      if (retryBtn) {
        retryBtn.addEventListener('click', () => {
          this.start().catch(() => {});
        });
      }
    },
    showStatus(text) {
      statusDiv.textContent = text;
    },
    setFullscreenPrompt(text) {
      fullscreenPrompt.hidden = !text;
      fullscreenPrompt.textContent = text || '';
    },
    showFullscreenFeedback(message, type = '') {
      fullscreenFeedback.hidden = !message;
      fullscreenFeedback.className = `asl-camera__fullscreen-feedback${type ? ` asl-camera__fullscreen-feedback--${type}` : ''}`;
      fullscreenFeedback.textContent = message || '';
    },
    clearFullscreenFeedback() {
      fullscreenFeedback.hidden = true;
      fullscreenFeedback.className = 'asl-camera__fullscreen-feedback';
      fullscreenFeedback.textContent = '';
    },
    showCountdown(value) {
      countdownDiv.hidden = false;
      countdownDiv.textContent = value;
    },
    hideCountdown() {
      countdownDiv.hidden = true;
      countdownDiv.textContent = '';
    },
    isActive() {
      return manager && manager.isActive();
    },
    destroy() {
      this.stop();
      this.hideCountdown();
      this.setFullscreenPrompt('');
      this.clearFullscreenFeedback();
      fullscreenBtn.removeEventListener('click', toggleExpanded);
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      if (document.fullscreenElement === viewport && document.exitFullscreen) {
        document.exitFullscreen().catch(() => {});
      }
      viewport.classList.remove('asl-camera__viewport--expanded');
      el.remove();
    }
  };
}
