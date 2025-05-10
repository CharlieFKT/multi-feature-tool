let currentSlide = 0;
const slides = document.querySelectorAll('.slide');
let scrollAnimationId = null;
let isPaused = false;
let lastPosition = 0;
let lastTextWidth = 0;
let lastContainerWidth = 0;
let lastMessage = '';
let scrollSpeed = 5;
let scrollColor = '#00ff00';

function showSlide(index) {
    slides.forEach((slide, i) => {
        slide.classList.toggle('active', i === index);
    });
}

function nextSlide() {
    currentSlide = (currentSlide + 1) % slides.length;
    showSlide(currentSlide);
}

function prevSlide() {
    currentSlide = (currentSlide - 1 + slides.length) % slides.length;
    showSlide(currentSlide);
}

function initScreenCalibration() {
    const calibrationDiv = document.getElementById('screen-calibration');
    const contrastPattern = document.createElement('div');
    contrastPattern.style.background = 'linear-gradient(to right, black, white)';
    contrastPattern.style.height = '50px';
    contrastPattern.style.marginBottom = '10px';
    
    const colorBandingPattern = document.createElement('div');
    colorBandingPattern.style.background = 'repeating-linear-gradient(90deg, #000, #000 10px, #fff 10px, #fff 20px)';
    colorBandingPattern.style.height = '50px';
    colorBandingPattern.style.marginBottom = '10px';

    const brightnessUniformityPattern = document.createElement('div');
    brightnessUniformityPattern.style.background = 'gray';
    brightnessUniformityPattern.style.height = '50px';

    calibrationDiv.appendChild(contrastPattern);
    calibrationDiv.appendChild(colorBandingPattern);
    calibrationDiv.appendChild(brightnessUniformityPattern);
}

function startCamera() {
    const video = document.getElementById('camera');
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(stream => {
                video.srcObject = stream;
                video.play();
            })
            .catch(err => console.error('Error accessing camera: ', err));
    }
}

function parseShutter(shutter) {
    if (shutter.includes('/')) {
        const parts = shutter.split('/');
        return parseFloat(parts[0]) / parseFloat(parts[1]);
    }
    return parseFloat(shutter);
}

function analyzeBrightness() {
    const video = document.getElementById('camera');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    let totalBrightness = 0;
    for (let i = 0; i < frame.data.length; i += 4) {
        const r = frame.data[i];
        const g = frame.data[i + 1];
        const b = frame.data[i + 2];
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        totalBrightness += brightness;
    }
    return totalBrightness / (frame.data.length / 4);
}

function formatShutterSpeed(shutterSpeed) {
    if (shutterSpeed < 1) {
        const denominator = Math.round(1 / shutterSpeed);
        return `1/${denominator}`;
    }
    return `${shutterSpeed.toFixed(2)} s`;
}

function takeEVReading() {
    const video = document.getElementById('camera');
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0, canvas.width, canvas.height);
    const frame = context.getImageData(0, 0, canvas.width, canvas.height);
    let totalBrightness = 0;
    for (let i = 0; i < frame.data.length; i += 4) {
        const r = frame.data[i];
        const g = frame.data[i + 1];
        const b = frame.data[i + 2];
        // Perceived brightness
        const brightness = 0.299 * r + 0.587 * g + 0.114 * b;
        totalBrightness += brightness;
    }
    const avgBrightness = totalBrightness / (frame.data.length / 4);
    // Map avgBrightness (0-255) to EV range (0-16)
    const ev = (avgBrightness / 255) * 16;
    document.getElementById('ev').value = ev.toFixed(2);
}

function calculateLightMeter() {
    const iso = parseFloat(document.getElementById('iso').value);
    const shutterStr = document.getElementById('shutter').value;
    const aperture = parseFloat(document.getElementById('aperture').value);
    const ev = parseFloat(document.getElementById('ev').value);
    let shutter = NaN;
    if (shutterStr && shutterStr.includes('/')) {
        const parts = shutterStr.split('/');
        shutter = parseFloat(parts[0]) / parseFloat(parts[1]);
    } else {
        shutter = parseFloat(shutterStr);
    }
    let result = '';
    // Use the standard EV formula
    // EV = log2(N^2 / t) - log2(ISO/100)
    if (isNaN(ev)) {
        result = 'Please take an EV reading first.';
    } else if (isNaN(aperture)) {
        // Solve for aperture
        // N = sqrt(2^{EV + log2(ISO/100)} * t)
        const N = Math.sqrt(Math.pow(2, ev + Math.log2(iso / 100)) * shutter);
        result = `Aperture: f/${N.toFixed(2)}`;
    } else if (isNaN(shutter)) {
        // Solve for shutter
        // t = N^2 / 2^{EV + log2(ISO/100)}
        const t = (aperture * aperture) / Math.pow(2, ev + Math.log2(iso / 100));
        result = `Shutter Speed: ${formatShutterSpeed(t)}`;
    } else if (isNaN(iso)) {
        // Solve for ISO
        // ISO = 100 * (N^2 / t) / 2^{EV}
        const ISO = 100 * (aperture * aperture / shutter) / Math.pow(2, ev);
        result = `ISO: ${Math.round(ISO)}`;
    } else {
        // Calculate EV from inputs
        const calcEV = Math.log2((aperture * aperture) / shutter) - Math.log2(iso / 100);
        result = `EV: ${calcEV.toFixed(2)}`;
    }
    document.getElementById('result').textContent = `Result: ${result}`;
}

async function startDecibelVisualizer() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        analyser.fftSize = 256;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);

        function updateDecibelLevel() {
            analyser.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((a, b) => a + b, 0);
            const average = sum / dataArray.length;
            const decibelLevel = Math.round(average);
            document.getElementById('decibel-level').textContent = decibelLevel;

            if (decibelLevel > 70) { // Threshold for warning
                document.getElementById('warning').style.display = 'block';
            } else {
                document.getElementById('warning').style.display = 'none';
            }

            requestAnimationFrame(updateDecibelLevel);
        }

        updateDecibelLevel();
    } catch (err) {
        console.error('Error accessing microphone: ', err);
    }
}

function initTypingHeatmap() {
    const keyboard = document.getElementById('keyboard');
    const rows = [
        '` 1 2 3 4 5 6 7 8 9 0 - = BACKSPACE',
        'TAB Q W E R T Y U I O P [ ] \\',
        'CAPS A S D F G H J K L ; \' ENTER',
        'SHIFT Z X C V B N M , . / SHIFT',
        'CTRL ALT SPACE ALT CTRL'
    ];
    const keyElements = {};

    rows.forEach((row, rowIndex) => {
        const rowElement = document.createElement('div');
        rowElement.className = 'row';
        row.split(' ').forEach(key => {
            const keyElement = document.createElement('div');
            keyElement.className = 'key';
            if (['BACKSPACE', 'TAB', 'CAPS', 'ENTER', 'SHIFT', 'CTRL', 'ALT'].includes(key)) {
                keyElement.classList.add('wide');
            }
            if (key === 'SPACE') {
                keyElement.classList.add('space');
            }
            keyElement.textContent = key;
            rowElement.appendChild(keyElement);
            keyElements[key] = keyElement;
        });
        keyboard.appendChild(rowElement);
    });

    document.addEventListener('keydown', (event) => {
        const key = event.key.toUpperCase();
        if (keyElements[key]) {
            keyElements[key].classList.add('active');
        }
    });
}

async function startAudioReactiveBackground() {
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const analyser = audioContext.createAnalyser();
        const microphone = audioContext.createMediaStreamSource(stream);
        microphone.connect(analyser);
        analyser.fftSize = 256;
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let hue = 0;

        function updateBackground() {
            analyser.getByteFrequencyData(dataArray);
            const sum = dataArray.reduce((a, b) => a + b, 0);
            const average = sum / dataArray.length;
            if (average > 0) {
                hue = (hue + average / 10) % 360;
            }
            document.body.style.backgroundColor = `hsl(${hue}, 100%, 50%)`;

            // dB bar logic
            const dbBar = document.getElementById('db-bar');
            const dbLabel = document.getElementById('db-label');
            // Convert average to a pseudo-dB value (0-100)
            const dbValue = Math.round((average / 255) * 100);
            dbBar.style.width = `${dbValue}%`;
            dbLabel.textContent = `${dbValue} dB`;

            requestAnimationFrame(updateBackground);
        }

        updateBackground();
    } catch (err) {
        console.error('Error accessing microphone: ', err);
    }
}

function goToDisplayPage() {
    document.getElementById('flash-config').style.display = 'none';
    document.getElementById('flash-display').style.display = 'flex';
    document.getElementById('home-btn').style.display = 'none';
    startScrollingMessage(true);
}

function goToConfigPage() {
    stopScrollingMessage();
    document.getElementById('flash-config').style.display = 'flex';
    document.getElementById('flash-display').style.display = 'none';
    document.getElementById('home-btn').style.display = 'block';
}

function startScrollingMessage(isFromConfig = false) {
    stopScrollingMessage();
    const messageInput = document.getElementById('message-input');
    const messageDisplay = document.getElementById('message-display');
    const speedRange = document.getElementById('speed-range');
    const colorPicker = document.getElementById('color-picker');
    let message = isFromConfig ? messageInput.value : lastMessage;
    // Add a non-breaking space gap between the two messages
    const gap = '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;';
    messageDisplay.innerHTML = `<span class='scroll-text' id='scroll1'>${message}</span><span class='scroll-text' id='scroll2'>${gap}${message}</span>`;
    scrollSpeed = parseInt(speedRange.value, 10);
    scrollColor = colorPicker.value;
    isPaused = false;
    // Set color for both spans
    document.getElementById('scroll1').style.color = scrollColor;
    document.getElementById('scroll2').style.color = scrollColor;

    setTimeout(() => {
        const containerWidth = messageDisplay.offsetWidth;
        const textSpan = document.getElementById('scroll1');
        const gapSpan = document.getElementById('scroll2');
        const textWidth = textSpan.offsetWidth;
        const gapWidth = gapSpan.offsetWidth - textWidth;
        lastTextWidth = textWidth;
        lastContainerWidth = containerWidth;
        lastMessage = message;
        if (textWidth + gapWidth <= containerWidth) {
            // Center the text and do not scroll
            messageDisplay.innerHTML = `<span class='scroll-text' id='scroll1'>${message}</span>`;
            document.getElementById('scroll1').style.color = scrollColor;
            document.getElementById('scroll1').style.position = 'absolute';
            document.getElementById('scroll1').style.left = '50%';
            document.getElementById('scroll1').style.transform = 'translate(-50%, -50%)';
        } else {
            let pos1 = containerWidth;
            let pos2 = pos1 + textWidth + gapWidth;
            function scrollMessage() {
                if (!isPaused) {
                    pos1 -= scrollSpeed;
                    pos2 -= scrollSpeed;
                    if (pos1 <= -textWidth) {
                        pos1 = pos2 + textWidth + gapWidth;
                    }
                    if (pos2 <= -textWidth) {
                        pos2 = pos1 + textWidth + gapWidth;
                    }
                    document.getElementById('scroll1').style.transform = `translate(${pos1}px, -50%)`;
                    document.getElementById('scroll2').style.transform = `translate(${pos2}px, -50%)`;
                }
                scrollAnimationId = requestAnimationFrame(scrollMessage);
            }
            scrollAnimationId = requestAnimationFrame(scrollMessage);
        }
    }, 50);
}

function pauseScrollingMessage() {
    isPaused = true;
}

function resumeScrollingMessage() {
    if (!isPaused) return;
    isPaused = false;
    // Resume the animation
    const messageDisplay = document.getElementById('message-display');
    const textWidth = lastTextWidth;
    const containerWidth = lastContainerWidth;
    let position = lastPosition;
    function scrollMessage() {
        if (!isPaused) {
            position -= scrollSpeed;
            lastPosition = position;
            if (position < -textWidth) {
                position = containerWidth;
                lastPosition = position;
            }
            messageDisplay.style.transform = `translateX(${position}px)`;
        }
        scrollAnimationId = requestAnimationFrame(scrollMessage);
    }
    scrollAnimationId = requestAnimationFrame(scrollMessage);
}

function stopScrollingMessage() {
    if (scrollAnimationId) {
        cancelAnimationFrame(scrollAnimationId);
        scrollAnimationId = null;
    }
    isPaused = false;
    lastPosition = 0;
    lastTextWidth = 0;
    lastContainerWidth = 0;
    lastMessage = '';
    const messageDisplay = document.getElementById('message-display');
    messageDisplay.style.transform = 'translateX(0)';
    messageDisplay.textContent = '';
}

function restartScrollingMessage() {
    startScrollingMessage();
}

document.getElementById('speed-range')?.addEventListener('input', function() {
    scrollSpeed = parseInt(this.value, 10);
});

document.addEventListener('DOMContentLoaded', () => {
    console.log('Multi-Feature Tool Loaded');
    if (document.getElementById('light-meter')) {
        startCamera();
    }
    if (document.getElementById('screen-calibration')) {
        initScreenCalibration();
        showSlide(currentSlide);
    }
    if (document.getElementById('decibel-visualizer')) {
        startDecibelVisualizer();
    }
    if (document.getElementById('keyboard')) {
        initTypingHeatmap();
    }
    if (document.getElementById('audio-visualizer') || document.getElementById('db-bar-container')) {
        startAudioReactiveBackground();
    }
    // Placeholder for initializing each feature
}); 